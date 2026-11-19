import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Prisma } from '../../generated/prisma/client';
import type { EventBooking, ProviderPayment, ProviderReportImport, ProviderReportRowStatus } from '../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated } from '../../common/utils';
import { D } from '../donations/money';
import { BookingPaymentsService } from '../gala/booking-payments.service';
import { csvCell, generateBookingAttemptReference } from '../gala/gala.rules';
import { isFormulaLike, normaliseReference, parseAmount, parseCsv, parseDate, parseQuantity, parseXlsx, REPORT_LIMITS, ReportFileError, type DateFormat, type Table } from './sdi-report.parser';

/** Provider key for everything learned from SDI's reports (distinct from the Phase 8A 'zeffy' API/webhook provider). */
export const SDI_REPORT = 'sdi_report';

export const ORDER_STATUSES = ['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Convenience defaults only — the importer reviews and can change every entry; unknown values always go to review. */
export const DEFAULT_STATUS_MAP: Record<string, OrderStatus> = {
  completed: 'COMPLETED', succeeded: 'COMPLETED', paid: 'COMPLETED', approved: 'COMPLETED',
  pending: 'PENDING', processing: 'PENDING',
  failed: 'FAILED', declined: 'FAILED',
  cancelled: 'CANCELLED', canceled: 'CANCELLED', voided: 'CANCELLED',
  refunded: 'REFUNDED', 'fully refunded': 'REFUNDED',
  'partially refunded': 'PARTIALLY_REFUNDED', 'partial refund': 'PARTIALLY_REFUNDED',
};

export type ReconciliationMapping = {
  orderId: string;
  bookingReference?: string;
  ticketType?: string;
  quantity?: string;
  amount: string;
  refundedAmount?: string;
  currency?: string;
  status: string;
  date: string;
  dateFormat: DateFormat;
  statusMap: Record<string, OrderStatus>;
  /** ticket-type values that identify a GALA DONATION line (never ledgered automatically) */
  donationTicketTypes?: string[];
};
export type AttendeeMapping = { guestName: string; ticketType?: string; tableLabel?: string; orderId?: string; bookingReference?: string; answers?: string[] };

type Evaluated = {
  rowNumber: number;
  sourceOrderId: string | null;
  bookingReferenceRaw: string | null;
  bookingReference: string | null;
  ticketType: string | null;
  lineKind: 'TICKET' | 'DONATION' | 'UNKNOWN';
  quantity: number | null;
  amount: string | null;
  refundedAmount: string | null;
  currency: string | null;
  statusRaw: string | null;
  status: OrderStatus | 'UNKNOWN' | null;
  occurredAt: Date | null;
  matchStatus: ProviderReportRowStatus;
  matchNote: string | null;
  bookingId: string | null;
  errors: string[];
};

const MAX_NOTE = 300;

/**
 * Phase 12 — SDI report import + reconciliation (SDI decision: no API key, no webhooks; a daily reconciliation report).
 *
 * Safety model:
 *  - Uploading and previewing NEVER change bookings, payments or the ledger.
 *  - Applying needs: SDI_REPORT_APPLY_ENABLED, a mapping verified against a REAL SDI sample (synthetic fixtures excepted outside
 *    staging/production), the sdi.reports.approve permission and a DIFFERENT administrator than the uploader (four eyes).
 *  - Apply runs in ONE transaction: any unexpected failure rolls back every row (the import stays PREVIEWED).
 *  - Matching uses the MEKI booking reference + SDI order id + expected amount + USD; never e-mail/amount alone. One SDI order can
 *    confirm at most one booking (unique ProviderPayment link) and one booking at most one order.
 *  - Confirmation reuses the established BookingPaymentsService pipeline; Zeffy-owned bookings get NO MEKI tickets/e-mails.
 *  - Only mapped, non-personal columns are stored for reconciliation; the raw file is kept in private storage only.
 */
@Injectable()
export class SdiReportsService {
  private readonly logger = new Logger(SdiReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly bookings: BookingPaymentsService,
  ) {}

  // ───────────────────────── storage ─────────────────────────

  private dir() {
    return resolve(this.config.get('PRIVATE_STORAGE_DIR'), 'sdi-reports');
  }
  private keyFor(id: string, type: string) {
    if (!/^[a-z0-9]{10,30}$/.test(id) || !['csv', 'xlsx'].includes(type)) throw new Error('unsafe storage key');
    return `${id}.${type}`;
  }
  private async readFile(imp: ProviderReportImport) {
    const buf = await readFile(join(this.dir(), imp.storageKey)).catch(() => null);
    if (!buf) throw new ServiceUnavailableException({ message: 'The stored report file is missing', code: 'REPORT_FILE_MISSING' });
    return buf;
  }
  private async parse(buf: Buffer, type: string): Promise<Table> {
    try {
      return type === 'xlsx' ? await parseXlsx(buf) : parseCsv(buf);
    } catch (e) {
      if (e instanceof ReportFileError) throw new UnprocessableEntityException({ message: e.message, code: e.code });
      throw e;
    }
  }

  // ───────────────────────── upload ─────────────────────────

  async upload(file: Express.Multer.File | undefined, input: { kind: 'RECONCILIATION' | 'ATTENDEES'; isSynthetic?: boolean; notes?: string }, actor: ActorContext) {
    if (!file?.buffer?.length) throw new BadRequestException({ message: 'A file field named "file" is required', code: 'FILE_REQUIRED' });
    if (file.size > REPORT_LIMITS.maxBytes) throw new UnprocessableEntityException({ message: 'The report is larger than 5 MB', code: 'FILE_TOO_LARGE' });
    const name = (file.originalname ?? '').slice(0, 255);
    const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
    const zip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const type = ext === 'xlsx' && zip ? 'xlsx' : ext === 'csv' && !zip ? 'csv' : null;
    const allowedMime = type === 'xlsx' ? ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'] : ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv', 'application/octet-stream'];
    if (!type || !allowedMime.includes(file.mimetype)) throw new UnprocessableEntityException({ message: 'Only .csv or .xlsx reports are accepted', code: 'FILE_TYPE_NOT_ALLOWED' });
    if (input.isSynthetic && this.strict()) throw new UnprocessableEntityException({ message: 'Synthetic fixtures cannot be uploaded in staging/production', code: 'SYNTHETIC_NOT_ALLOWED' });
    const table = await this.parse(file.buffer, type);
    const sha = createHash('sha256').update(file.buffer).digest('hex');
    const dup = await this.prisma.providerReportImport.findUnique({ where: { source_kind_fileSha256: { source: 'SDI', kind: input.kind, fileSha256: sha } }, select: { id: true, status: true } });
    if (dup) throw new ConflictException({ message: 'This exact file was already uploaded', code: 'DUPLICATE_FILE', details: { importId: dup.id, status: dup.status } });

    const id = `sdi${randomBytes(9).toString('hex')}`.slice(0, 24);
    const storageKey = this.keyFor(id, type);
    await mkdir(this.dir(), { recursive: true });
    await writeFile(join(this.dir(), storageKey), file.buffer, { flag: 'wx' });
    const imp = await this.prisma.providerReportImport.create({
      data: {
        id, kind: input.kind, fileName: name.replace(/[^\p{L}\p{N} ._()-]/gu, '_'), fileSha256: sha, fileSize: file.size, fileType: type, storageKey,
        headers: table.headers, rowCount: table.rows.length, isSynthetic: input.isSynthetic === true, notes: input.notes?.slice(0, 2000) ?? null, uploadedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'sdi.report.upload', 'ProviderReportImport', imp.id, { kind: imp.kind, fileType: type, rows: table.rows.length, sha256: sha, synthetic: imp.isSynthetic });
    return { ...this.view(imp), suggestedMapping: this.suggest(input.kind, table.headers) };
  }

  /** Header-name suggestions ONLY (case-insensitive). Never applied automatically; the importer confirms every column. */
  private suggest(kind: string, headers: string[]) {
    const find = (...names: string[]) => headers.find((h) => names.includes(h.toLowerCase().replace(/[^a-z]/g, ''))) ?? undefined;
    if (kind === 'ATTENDEES') {
      return { guestName: find('guestname', 'attendeename', 'name', 'fullname'), ticketType: find('tickettype', 'ticket', 'rate'), tableLabel: find('table', 'tablenumber'), orderId: find('orderid', 'order', 'paymentid'), bookingReference: find('mekibookingreference', 'bookingreference') };
    }
    return {
      orderId: find('orderid', 'order', 'ordernumber', 'paymentid', 'transactionid'), bookingReference: find('mekibookingreference', 'bookingreference', 'reference'),
      ticketType: find('tickettype', 'ticket', 'rate', 'item'), quantity: find('quantity', 'qty', 'tickets'), amount: find('amount', 'total', 'totalamount'),
      refundedAmount: find('refundedamount', 'refunded', 'refundamount'), currency: find('currency'), status: find('status', 'paymentstatus', 'orderstatus'), date: find('date', 'orderdate', 'createdat', 'paymentdate'),
      dateFormat: 'ISO', statusMap: DEFAULT_STATUS_MAP,
    };
  }

  private strict() {
    const env = this.config.get('NODE_ENV');
    return env === 'production' || env === 'staging';
  }

  // ───────────────────────── mapping validation ─────────────────────────

  private reconMapping(raw: unknown, headers: string[]): ReconciliationMapping {
    const m = (raw ?? {}) as Partial<ReconciliationMapping>;
    const col = (k: keyof ReconciliationMapping, required: boolean) => {
      const v = m[k];
      if (v === undefined || v === null || v === '') {
        if (required) throw new BadRequestException({ message: `Map the "${k}" column`, code: 'MAPPING_INCOMPLETE', details: { field: k } });
        return undefined;
      }
      if (typeof v !== 'string' || !headers.includes(v)) throw new BadRequestException({ message: `Column "${String(v)}" is not in this file`, code: 'MAPPING_COLUMN_UNKNOWN', details: { field: k } });
      return v;
    };
    const statusMap: Record<string, OrderStatus> = {};
    for (const [k, v] of Object.entries(m.statusMap ?? {})) {
      if (!(ORDER_STATUSES as readonly string[]).includes(v as string) || k.length > 60) throw new BadRequestException({ message: `Invalid status mapping for "${k}"`, code: 'MAPPING_STATUS_INVALID' });
      statusMap[k.trim().toLowerCase()] = v as OrderStatus;
    }
    if (!['ISO', 'MDY', 'DMY'].includes(m.dateFormat as string)) throw new BadRequestException({ message: 'dateFormat must be ISO, MDY or DMY', code: 'MAPPING_DATE_FORMAT' });
    const donation = Array.isArray(m.donationTicketTypes) ? m.donationTicketTypes.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().toLowerCase()).slice(0, 20) : [];
    return {
      orderId: col('orderId', true)!, bookingReference: col('bookingReference', false), ticketType: col('ticketType', false), quantity: col('quantity', false), amount: col('amount', true)!,
      refundedAmount: col('refundedAmount', false), currency: col('currency', false), status: col('status', true)!, date: col('date', true)!, dateFormat: m.dateFormat as DateFormat,
      statusMap, donationTicketTypes: donation,
    };
  }

  private attendeeMapping(raw: unknown, headers: string[]): AttendeeMapping {
    const m = (raw ?? {}) as Partial<AttendeeMapping>;
    const col = (v: unknown, k: string, required = false) => {
      if (v === undefined || v === null || v === '') {
        if (required) throw new BadRequestException({ message: `Map the "${k}" column`, code: 'MAPPING_INCOMPLETE', details: { field: k } });
        return undefined;
      }
      if (typeof v !== 'string' || !headers.includes(v)) throw new BadRequestException({ message: `Column "${String(v)}" is not in this file`, code: 'MAPPING_COLUMN_UNKNOWN', details: { field: k } });
      return v;
    };
    const answers = Array.isArray(m.answers) ? m.answers.slice(0, 10).map((a) => col(a, 'answers')!) : [];
    return { guestName: col(m.guestName, 'guestName', true)!, ticketType: col(m.ticketType, 'ticketType'), tableLabel: col(m.tableLabel, 'tableLabel'), orderId: col(m.orderId, 'orderId'), bookingReference: col(m.bookingReference, 'bookingReference'), answers };
  }

  // ───────────────────────── preview ─────────────────────────

  async preview(id: string, input: { mapping?: unknown; mappingProfileId?: string; periodFrom?: string; periodTo?: string; supersedesId?: string }, actor: ActorContext) {
    const imp = await this.get(id);
    if (imp.status !== 'UPLOADED' && imp.status !== 'PREVIEWED') throw new ConflictException({ message: `This report is ${imp.status}`, code: 'REPORT_NOT_PREVIEWABLE' });
    let rawMapping = input.mapping;
    if (input.mappingProfileId) {
      const p = await this.prisma.providerReportMapping.findUnique({ where: { id: input.mappingProfileId } });
      if (!p || p.kind !== imp.kind) throw new BadRequestException({ message: 'Unknown mapping profile', code: 'MAPPING_PROFILE_UNKNOWN' });
      rawMapping = p.mapping;
    }
    const headers = imp.headers as string[];
    const table = await this.parse(await this.readFile(imp), imp.fileType);
    const period = { from: input.periodFrom ? parseDate(input.periodFrom, 'ISO') : null, to: input.periodTo ? parseDate(input.periodTo, 'ISO') : null };
    if ((input.periodFrom && !period.from) || (input.periodTo && !period.to) || (period.from && period.to && period.from > period.to)) throw new BadRequestException({ message: 'Invalid reporting period', code: 'PERIOD_INVALID' });
    if (input.supersedesId) {
      const prev = await this.prisma.providerReportImport.findUnique({ where: { id: input.supersedesId } });
      if (!prev || prev.kind !== imp.kind || prev.id === imp.id) throw new BadRequestException({ message: 'Unknown report to supersede', code: 'SUPERSEDES_UNKNOWN' });
    }

    if (imp.kind === 'ATTENDEES') {
      const mapping = this.attendeeMapping(rawMapping, headers);
      const idx = (h?: string) => (h ? headers.indexOf(h) : -1);
      const rows = table.rows.map((r, i) => {
        const get = (h?: string) => (h ? (r[idx(h)] ?? '').trim() : '');
        const name = get(mapping.guestName);
        const ref = get(mapping.bookingReference);
        const answers = Object.fromEntries((mapping.answers ?? []).map((h) => [h.slice(0, 80), get(h).slice(0, 500)]));
        const bad = [name, get(mapping.ticketType), get(mapping.tableLabel), ...Object.values(answers)].some((v) => v && isFormulaLike(v));
        return { rowNumber: i + 2, valid: !!name && !bad, guestName: name.slice(0, 200), ticketType: get(mapping.ticketType).slice(0, 120) || null, tableLabel: get(mapping.tableLabel).slice(0, 40) || null, sourceOrderId: get(mapping.orderId).slice(0, 64) || null, bookingReference: ref ? normaliseReference(ref) : null, answers };
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.sdiAttendee.deleteMany({ where: { importId: imp.id } }); // previous PREVIEW of this unapplied import only
        await tx.sdiAttendee.createMany({ data: rows.filter((r) => r.valid).map(({ valid: _v, ...r }) => ({ ...r, importId: imp.id, answers: r.answers as Prisma.InputJsonValue })) });
        await tx.providerReportImport.update({
          where: { id: imp.id },
          data: { status: 'PREVIEWED', mapping: mapping as unknown as Prisma.InputJsonValue, mappingProfileId: input.mappingProfileId ?? null, previewedAt: new Date(), acceptedCount: rows.filter((r) => r.valid).length, rejectedCount: rows.filter((r) => !r.valid).length, periodFrom: period.from, periodTo: period.to, supersedesId: input.supersedesId ?? null, summary: { attendees: rows.filter((r) => r.valid).length, rejected: rows.filter((r) => !r.valid).length } },
        });
      });
      await this.audit.record(actor, 'sdi.report.preview', 'ProviderReportImport', imp.id, { kind: imp.kind, rows: rows.length });
      return this.detail(imp.id);
    }

    const mapping = this.reconMapping(rawMapping, headers);
    const evaluated = await this.evaluate(table, headers, mapping, this.prisma);
    const summary = this.summarise(evaluated);
    await this.prisma.$transaction(async (tx) => {
      await tx.providerReportRow.deleteMany({ where: { importId: imp.id, applied: false } }); // previous PREVIEW of this unapplied import only
      await tx.providerReportRow.createMany({ data: evaluated.map((e) => this.rowData(imp.id, e)) });
      await tx.providerReportImport.update({
        where: { id: imp.id },
        data: {
          status: 'PREVIEWED', mapping: mapping as unknown as Prisma.InputJsonValue, mappingProfileId: input.mappingProfileId ?? null, previewedAt: new Date(),
          acceptedCount: summary.MATCHED ?? 0, rejectedCount: evaluated.length - (summary.MATCHED ?? 0), periodFrom: period.from, periodTo: period.to, supersedesId: input.supersedesId ?? null, summary,
        },
      });
    });
    await this.audit.record(actor, 'sdi.report.preview', 'ProviderReportImport', imp.id, { kind: imp.kind, rows: evaluated.length, summary });
    return this.detail(imp.id);
  }

  private rowData(importId: string, e: Evaluated): Prisma.ProviderReportRowCreateManyInput {
    return {
      importId, rowNumber: e.rowNumber, sourceOrderId: e.sourceOrderId, bookingReferenceRaw: e.bookingReferenceRaw, bookingReference: e.bookingReference, ticketType: e.ticketType, lineKind: e.lineKind,
      quantity: e.quantity, amount: e.amount, refundedAmount: e.refundedAmount, currency: e.currency, statusRaw: e.statusRaw, status: e.status, occurredAt: e.occurredAt,
      matchStatus: e.matchStatus, matchNote: e.matchNote?.slice(0, MAX_NOTE) ?? null, bookingId: e.bookingId, errors: e.errors.length ? e.errors : Prisma.JsonNull,
    };
  }

  private summarise(rows: Evaluated[]) {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.matchStatus] = (out[r.matchStatus] ?? 0) + 1;
    return out;
  }

  /**
   * Row interpretation and matching. Pure with respect to money: it only READS bookings and earlier SDI state. Each rule that
   * cannot be satisfied sends the row to a review status — nothing is guessed.
   */
  private async evaluate(table: Table, headers: string[], m: ReconciliationMapping, db: Pick<Prisma.TransactionClient, 'eventBooking' | 'providerPayment'>): Promise<Evaluated[]> {
    const col = (h?: string) => (h ? headers.indexOf(h) : -1);
    const ix = { order: col(m.orderId), ref: col(m.bookingReference), type: col(m.ticketType), qty: col(m.quantity), amount: col(m.amount), refunded: col(m.refundedAmount), currency: col(m.currency), status: col(m.status), date: col(m.date) };
    const statusMap = { ...m.statusMap };
    const rows: Evaluated[] = table.rows.map((r, i) => {
      const get = (n: number) => (n >= 0 ? (r[n] ?? '').trim() : '');
      const errors: string[] = [];
      const order = get(ix.order);
      const refRaw = get(ix.ref);
      const type = get(ix.type);
      const statusRaw = get(ix.status);
      for (const [name, v] of [['ORDER_ID', order], ['REFERENCE', refRaw], ['TICKET_TYPE', type], ['STATUS', statusRaw]] as const) if (v && isFormulaLike(v)) errors.push(`${name}_FORMULA_LIKE`);
      if (!order) errors.push('ORDER_ID_MISSING');
      if (order.length > 64) errors.push('ORDER_ID_TOO_LONG');
      const amount = parseAmount(get(ix.amount));
      if (amount === null) errors.push('AMOUNT_INVALID');
      const refundedRaw = get(ix.refunded);
      const refunded = refundedRaw ? parseAmount(refundedRaw) : '0.00';
      if (refunded === null) errors.push('REFUNDED_AMOUNT_INVALID');
      const qtyRaw = get(ix.qty);
      const quantity = qtyRaw ? parseQuantity(qtyRaw) : null;
      if (qtyRaw && quantity === null) errors.push('QUANTITY_INVALID');
      const currency = (ix.currency >= 0 ? get(ix.currency).toUpperCase() : 'USD') || 'USD';
      if (currency !== 'USD') errors.push('CURRENCY_NOT_USD');
      const occurredAt = parseDate(get(ix.date), m.dateFormat);
      if (!occurredAt) errors.push('DATE_INVALID');
      const status = statusRaw ? (statusMap[statusRaw.toLowerCase()] ?? 'UNKNOWN') : 'UNKNOWN';
      const lineKind = type && m.donationTicketTypes?.includes(type.toLowerCase()) ? 'DONATION' : type ? 'TICKET' : 'UNKNOWN';
      const reference = refRaw ? normaliseReference(refRaw) : null;
      if (amount && refunded && D(refunded).greaterThan(amount)) errors.push('REFUND_EXCEEDS_AMOUNT');
      const base: Evaluated = {
        rowNumber: i + 2, sourceOrderId: order ? order.slice(0, 64) : null, bookingReferenceRaw: refRaw ? refRaw.slice(0, 80) : null, bookingReference: reference, ticketType: type ? type.slice(0, 120) : null, lineKind,
        quantity, amount, refundedAmount: refunded, currency: currency.slice(0, 3), statusRaw: statusRaw ? statusRaw.slice(0, 60) : null, status, occurredAt, matchStatus: 'MATCHED', matchNote: null, bookingId: null, errors,
      };
      if (errors.length) return { ...base, matchStatus: 'INVALID', matchNote: errors.join(', ') };
      if (status === 'UNKNOWN') return { ...base, matchStatus: 'REQUIRES_REVIEW', matchNote: `Unknown status "${statusRaw}" — add it to the status mapping` };
      if (lineKind === 'DONATION') return { ...base, matchStatus: 'REQUIRES_REVIEW', matchNote: 'Gala donation line: not ledgered until SDI documents donation lines (ticket revenue and donations stay separate)' };
      if (!refRaw) return { ...base, matchStatus: 'UNMATCHED', matchNote: 'No MEKI booking reference on this order' };
      if (!reference) return { ...base, matchStatus: 'INVALID_REFERENCE', matchNote: `"${refRaw.slice(0, 40)}" is not a MEKI booking reference (format EB-XXXXXXXXXXXX)` };
      return base;
    });

    // Several rows for the same order: the latest (by date) is authoritative; identical repeats are duplicates; same-date conflicts → review.
    const byOrder = new Map<string, Evaluated[]>();
    for (const r of rows) if (r.matchStatus !== 'INVALID' && r.sourceOrderId) byOrder.set(r.sourceOrderId, [...(byOrder.get(r.sourceOrderId) ?? []), r]);
    for (const group of byOrder.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.occurredAt!.getTime() - b.occurredAt!.getTime() || a.rowNumber - b.rowNumber);
      const last = group[group.length - 1];
      for (const r of group.slice(0, -1)) {
        const same = r.status === last.status && r.amount === last.amount && r.refundedAmount === last.refundedAmount && r.bookingReference === last.bookingReference;
        if (same) Object.assign(r, { matchStatus: 'DUPLICATE_ROW', matchNote: `Identical to row ${last.rowNumber} for the same order` });
        else if (r.occurredAt!.getTime() === last.occurredAt!.getTime()) {
          for (const g of group) Object.assign(g, { matchStatus: 'DUPLICATE_ROW', matchNote: 'Conflicting rows for the same order at the same time — review' });
          break;
        } else Object.assign(r, { matchStatus: 'STALE', matchNote: `Superseded by row ${last.rowNumber} (later state of the same order)` });
      }
    }

    // One booking reference claimed by several DIFFERENT paid orders in this file → ambiguous (never confirm two orders for one booking).
    const paid = new Set<OrderStatus | 'UNKNOWN'>(['COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
    const ordersByRef = new Map<string, Set<string>>();
    for (const r of rows) if (r.matchStatus === 'MATCHED' && r.bookingReference && paid.has(r.status!)) ordersByRef.set(r.bookingReference, (ordersByRef.get(r.bookingReference) ?? new Set()).add(r.sourceOrderId!));

    const refs = [...new Set(rows.filter((r) => r.matchStatus === 'MATCHED').map((r) => r.bookingReference!))];
    const bookings = refs.length ? await db.eventBooking.findMany({ where: { publicReference: { in: refs } } }) : [];
    const bookingByRef = new Map(bookings.map((b) => [b.publicReference, b]));
    const orderIds = [...new Set(rows.filter((r) => r.matchStatus === 'MATCHED').map((r) => r.sourceOrderId!))];
    const known = orderIds.length ? await db.providerPayment.findMany({ where: { provider: SDI_REPORT, providerPaymentId: { in: orderIds } } }) : [];
    const knownByOrder = new Map(known.map((k) => [k.providerPaymentId, k]));
    const linkedToBooking = bookings.length ? await db.providerPayment.findMany({ where: { provider: SDI_REPORT, matchedEntityType: 'EventBooking', matchedEntityId: { in: bookings.map((b) => b.id) } } }) : [];

    for (const r of rows) {
      if (r.matchStatus !== 'MATCHED') continue;
      const booking = bookingByRef.get(r.bookingReference!);
      if (!booking) {
        Object.assign(r, { matchStatus: 'UNMATCHED', matchNote: `No MEKI booking ${r.bookingReference} — possibly mistyped by the buyer; contact SDI/the buyer` });
        continue;
      }
      r.bookingId = booking.id;
      if (booking.ticketIssuer !== 'ZEFFY') {
        Object.assign(r, { matchStatus: 'REQUIRES_REVIEW', matchNote: 'This booking was not made through the hosted (Zeffy) flow' });
        continue;
      }
      if ((ordersByRef.get(r.bookingReference!)?.size ?? 0) > 1) {
        Object.assign(r, { matchStatus: 'AMBIGUOUS', matchNote: 'Several SDI orders carry this booking reference — one booking can match only one order' });
        continue;
      }
      const otherOrder = linkedToBooking.find((p) => p.matchedEntityId === booking.id && p.providerPaymentId !== r.sourceOrderId);
      if (otherOrder) {
        Object.assign(r, { matchStatus: 'AMBIGUOUS', matchNote: `Booking already reconciled with SDI order ${otherOrder.providerPaymentId.slice(0, 40)}` });
        continue;
      }
      const prev = knownByOrder.get(r.sourceOrderId!);
      if (prev && prev.matchedEntityId && prev.matchedEntityId !== booking.id) {
        Object.assign(r, { matchStatus: 'AMBIGUOUS', matchNote: 'This SDI order was already reconciled with a different booking' });
        continue;
      }
      if (prev && r.occurredAt! < prev.lastSyncedAt) {
        Object.assign(r, { matchStatus: 'STALE', matchNote: 'Older than the state already recorded for this order (out-of-order report)' });
        continue;
      }
      if (prev && prev.status === r.status && D(prev.amount).equals(r.amount!) && D(prev.refundedAmount).equals(r.refundedAmount!)) {
        Object.assign(r, { matchStatus: 'ALREADY_APPLIED', matchNote: 'Same state already applied from an earlier report' });
        continue;
      }
      const verdict = this.moneyVerdict(r, booking, prev);
      if (verdict) Object.assign(r, verdict);
    }
    return rows;
  }

  /** Amount / quantity / state rules. Returns a review verdict, or null when the row may be applied (with an optional note). */
  private moneyVerdict(r: Evaluated, b: EventBooking, prev: ProviderPayment | undefined): Partial<Evaluated> | null {
    const unit = D(b.unitPrice);
    if (r.status === 'COMPLETED' || r.status === 'REFUNDED' || r.status === 'PARTIALLY_REFUNDED') {
      if (r.quantity !== null) {
        if (!unit.times(r.quantity).equals(r.amount!)) return { matchStatus: 'AMOUNT_MISMATCH', matchNote: `Amount ${r.amount} ≠ ${r.quantity} × ${unit.toFixed(2)} (the booking's ticket price)` };
      } else if (!D(b.totalAmount).equals(r.amount!)) {
        return { matchStatus: 'AMOUNT_MISMATCH', matchNote: `Amount ${r.amount} ≠ expected ${D(b.totalAmount).toFixed(2)} for ${b.guestCount} ticket(s); no quantity column to confirm a different count` };
      }
      if (b.paymentStatus === 'PAID' && !prev) return { matchStatus: 'AMBIGUOUS', matchNote: 'Booking already paid through another record — review' };
      if ((b.bookingStatus === 'CANCELLED' || b.bookingStatus === 'REFUNDED') && b.paymentStatus !== 'PAID') return { matchStatus: 'REQUIRES_REVIEW', matchNote: `Payment reported for a ${b.bookingStatus} booking — review (refund may be required)` };
      if (prev && r.status === 'COMPLETED' && (prev.status === 'REFUNDED' || prev.status === 'PARTIALLY_REFUNDED')) return { matchStatus: 'REQUIRES_REVIEW', matchNote: 'Order reported paid again after a refund — review' };
      if (prev && D(r.refundedAmount!).lessThan(prev.refundedAmount)) return { matchStatus: 'REQUIRES_REVIEW', matchNote: 'Refunded amount decreased compared with an earlier report — review' };
      const qtyNote = r.quantity !== null && r.quantity !== b.guestCount ? `Paid quantity ${r.quantity} differs from the ${b.guestCount} requested on MEKI (SDI's report is authoritative)` : null;
      return qtyNote ? { matchNote: qtyNote } : null;
    }
    if (r.status === 'CANCELLED' && b.paymentStatus === 'PAID') return { matchStatus: 'REQUIRES_REVIEW', matchNote: 'Paid booking reported cancelled without a refund — review' };
    return null;
  }

  // ───────────────────────── apply (four eyes) ─────────────────────────

  async apply(id: string, actor: ActorContext) {
    const imp = await this.get(id);
    if (imp.status !== 'PREVIEWED') throw new ConflictException({ message: 'Preview the report before applying it', code: 'REPORT_NOT_PREVIEWED' });
    if (imp.uploadedById === actor.userId) throw new ForbiddenException({ message: 'A different administrator must approve this report (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    if (!this.config.get('SDI_REPORT_APPLY_ENABLED')) throw new ServiceUnavailableException({ message: 'Applying SDI reports is disabled until a real SDI sample has been verified', code: 'REPORT_APPLY_DISABLED' });
    if (imp.isSynthetic && this.strict()) throw new UnprocessableEntityException({ message: 'Synthetic fixtures are never applied in staging/production', code: 'SYNTHETIC_NOT_ALLOWED' });
    if (imp.kind === 'RECONCILIATION' && !imp.isSynthetic) {
      const profile = imp.mappingProfileId ? await this.prisma.providerReportMapping.findUnique({ where: { id: imp.mappingProfileId } }) : null;
      if (!profile?.verifiedAgainstSample) throw new UnprocessableEntityException({ message: 'Use a mapping profile verified against a real SDI sample report', code: 'MAPPING_NOT_VERIFIED' });
    }

    if (imp.kind === 'ATTENDEES') {
      await this.prisma.providerReportImport.update({ where: { id }, data: { status: 'APPLIED', approvedById: actor.userId, appliedAt: new Date() } });
      await this.audit.record(actor, 'sdi.report.apply', 'ProviderReportImport', id, { kind: imp.kind, attendees: imp.acceptedCount });
      return this.detail(id);
    }

    const mapping = this.reconMapping(imp.mapping, imp.headers as string[]);
    const table = await this.parse(await this.readFile(imp), imp.fileType);
    const counts = { confirmed: 0, refunds: 0, cancelled: 0, recorded: 0 };
    await this.prisma.$transaction(
      async (tx) => {
        // Re-evaluate against the CURRENT state inside the transaction (another report may have been applied since the preview).
        const evaluated = await this.evaluate(table, imp.headers as string[], mapping, tx);
        await tx.providerReportRow.deleteMany({ where: { importId: id, applied: false } });
        const ordered = [...evaluated].sort((a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0));
        for (const e of ordered) {
          if (e.matchStatus === 'MATCHED') {
            const did = await this.applyRow(tx, imp, e);
            counts[did]++;
          }
        }
        await tx.providerReportRow.createMany({ data: evaluated.map((e) => ({ ...this.rowData(id, e), applied: e.matchStatus === 'MATCHED', appliedAt: e.matchStatus === 'MATCHED' ? new Date() : null })) });
        const summary = this.summarise(evaluated);
        await tx.providerReportImport.update({ where: { id }, data: { status: 'APPLIED', approvedById: actor.userId, appliedAt: new Date(), summary: { ...summary, applied: counts }, acceptedCount: summary.MATCHED ?? 0, rejectedCount: evaluated.length - (summary.MATCHED ?? 0) } });
        if (imp.supersedesId) await tx.auditLog.create({ data: { actorId: actor.userId, action: 'sdi.report.superseded', entityType: 'ProviderReportImport', entityId: imp.supersedesId, metadata: { by: id } } });
        await this.audit.record(actor, 'sdi.report.apply', 'ProviderReportImport', id, { kind: imp.kind, counts, summary, synthetic: imp.isSynthetic }, tx);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return this.detail(id);
  }

  /** Applies ONE matched order state. Throws on any inconsistency, which rolls back the whole import. */
  private async applyRow(tx: Prisma.TransactionClient, imp: ProviderReportImport, e: Evaluated): Promise<'confirmed' | 'refunds' | 'cancelled' | 'recorded'> {
    const booking = await tx.eventBooking.findUniqueOrThrow({ where: { id: e.bookingId! } });
    const isTest = booking.isTest || imp.isSynthetic;
    const amount = D(e.amount!);
    const refunded = D(e.refundedAmount!);
    const record = await tx.providerPayment.upsert({
      where: { provider_providerPaymentId: { provider: SDI_REPORT, providerPaymentId: e.sourceOrderId! } },
      create: {
        provider: SDI_REPORT, providerPaymentId: e.sourceOrderId!, status: e.status!, type: 'imported', amount, eligibleAmount: amount, refundedAmount: refunded,
        refundStatus: refunded.isZero() ? 'none' : refunded.equals(amount) ? 'full' : 'partial', currency: 'USD', classification: 'EVENT_TICKET_PAYMENT',
        items: e.ticketType ? [{ type: 'ticket', rateTitle: e.ticketType, quantity: e.quantity }] : [], correlationRef: e.bookingReference, matchStatus: 'MATCHED',
        matchReason: `SDI report ${imp.id} row ${e.rowNumber}`, providerCreatedAt: e.occurredAt!, lastEventId: `sdi-import:${imp.id}:${e.rowNumber}`, lastSyncedAt: e.occurredAt!,
      },
      update: {
        status: e.status!, amount, eligibleAmount: amount, refundedAmount: refunded, refundStatus: refunded.isZero() ? 'none' : refunded.equals(amount) ? 'full' : 'partial',
        correlationRef: e.bookingReference, lastEventId: `sdi-import:${imp.id}:${e.rowNumber}`, lastSyncedAt: e.occurredAt!,
      },
    });
    const evidence = (status: string) =>
      tx.paymentWebhookEvent.upsert({
        where: { provider_providerEventId: { provider: SDI_REPORT, providerEventId: `sdi:${imp.id}:${e.sourceOrderId}:${status}`.slice(0, 191) } },
        update: {},
        create: {
          provider: SDI_REPORT, providerEventId: `sdi:${imp.id}:${e.sourceOrderId}:${status}`.slice(0, 191), eventType: `report.order.${status.toLowerCase()}`, signatureVerified: false,
          payloadHash: createHash('sha256').update(`${imp.fileSha256}:${e.rowNumber}`).digest('hex'),
          payload: { source: 'sdi-report', importId: imp.id, rowNumber: e.rowNumber, fileSha256: imp.fileSha256, orderId: e.sourceOrderId, reference: e.bookingReference, status: e.status, amount: e.amount, refunded: e.refundedAmount, synthetic: imp.isSynthetic },
        },
      });

    let did: 'confirmed' | 'refunds' | 'cancelled' | 'recorded' = 'recorded';
    const paidState = e.status === 'COMPLETED' || e.status === 'REFUNDED' || e.status === 'PARTIALLY_REFUNDED';
    if (paidState && booking.paymentStatus !== 'PAID' && booking.paymentStatus !== 'REFUNDED') {
      // SDI's paid quantity is authoritative (amount already verified = quantity × unit price).
      const qty = e.quantity ?? booking.guestCount;
      await tx.eventBooking.update({ where: { id: booking.id }, data: { guestCount: qty, totalAmount: amount, reportedTicketCount: qty } });
      await tx.providerPayment.update({ where: { id: record.id }, data: { matchedEntityType: 'EventBooking', matchedEntityId: booking.id } }); // unique: one order ↔ one booking
      const row = await evidence('COMPLETED');
      const attempt = await tx.eventBookingPaymentAttempt.create({
        data: { reference: generateBookingAttemptReference(), bookingId: booking.id, provider: SDI_REPORT, providerSessionRef: `sdi:${e.sourceOrderId}`.slice(0, 191), amount, currency: 'USD', status: 'CREATED', isTest },
      });
      const outcome = await this.bookings.handle(tx, row, {
        eventId: row.providerEventId, type: 'payment.succeeded', occurredAt: e.occurredAt!, attemptReference: attempt.reference, sessionRef: attempt.providerSessionRef ?? undefined,
        paymentRef: e.sourceOrderId!, amount: amount.toFixed(2), currency: 'USD',
      });
      if (outcome.status !== 'PROCESSED') throw new UnprocessableEntityException({ message: `Row ${e.rowNumber}: booking pipeline did not confirm (${outcome.note ?? outcome.status})`, code: 'APPLY_ROLLED_BACK' });
      await tx.providerPayment.update({ where: { id: record.id }, data: { matchStatus: 'CONFIRMED', matchReason: `confirmed from SDI report ${imp.id}` } });
      did = 'confirmed';
    } else if (paidState) {
      await tx.providerPayment.update({ where: { id: record.id }, data: { matchedEntityType: 'EventBooking', matchedEntityId: booking.id, matchStatus: 'CONFIRMED' } });
    }

    // Refunds (full or partial): the ledger records only the NEW refunded amount; history is never rewritten.
    if (paidState && refunded.greaterThan(0)) {
      const current = await tx.eventBooking.findUniqueOrThrow({ where: { id: booking.id } });
      const delta = refunded.minus(current.refundedAmount);
      if (delta.isNegative()) throw new UnprocessableEntityException({ message: `Row ${e.rowNumber}: refunded amount decreased`, code: 'APPLY_ROLLED_BACK' });
      if (delta.greaterThan(0)) {
        const row = await evidence(refunded.equals(current.totalAmount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED');
        const attempt = await tx.eventBookingPaymentAttempt.findFirst({ where: { bookingId: booking.id, provider: SDI_REPORT, providerPaymentRef: e.sourceOrderId! } });
        await tx.eventBookingTransaction.create({
          data: {
            bookingId: booking.id, attemptId: attempt?.id ?? null, webhookEventId: row.id, provider: SDI_REPORT, providerTransactionRef: `sdi-refund:${e.sourceOrderId}:${refunded.toFixed(2)}`.slice(0, 191),
            type: 'REFUND', status: 'SUCCEEDED', amount: delta, currency: 'USD', isTest, occurredAt: e.occurredAt!,
          },
        });
        const full = refunded.equals(current.totalAmount);
        await tx.eventBooking.update({ where: { id: booking.id }, data: { refundedAmount: refunded, ...(full ? { paymentStatus: 'REFUNDED', bookingStatus: 'REFUNDED' } : {}) } });
        await this.audit.record(null, 'gala.booking.refunded', 'EventBooking', booking.id, { source: 'sdi-report', importId: imp.id, orderId: e.sourceOrderId, refunded: refunded.toFixed(2), full, ticketIssuer: booking.ticketIssuer }, tx);
        did = 'refunds';
      }
    }

    if (e.status === 'CANCELLED' && booking.bookingStatus === 'PENDING' && booking.paymentStatus !== 'PAID') {
      await tx.eventBooking.update({ where: { id: booking.id }, data: { bookingStatus: 'CANCELLED', cancelledAt: new Date(), cancelReason: `Order cancelled on SDI's form (report ${imp.id})` } });
      await this.audit.record(null, 'gala.booking.cancelled', 'EventBooking', booking.id, { source: 'sdi-report', importId: imp.id, orderId: e.sourceOrderId }, tx);
      did = 'cancelled';
    }
    return did;
  }

  async reject(id: string, reason: string, actor: ActorContext) {
    const imp = await this.get(id);
    if (imp.status === 'APPLIED' || imp.status === 'REJECTED') throw new ConflictException({ message: `This report is ${imp.status}`, code: 'REPORT_CLOSED' });
    await this.prisma.providerReportImport.update({ where: { id }, data: { status: 'REJECTED', rejectedById: actor.userId, rejectedAt: new Date(), rejectReason: reason.slice(0, 500) } });
    await this.audit.record(actor, 'sdi.report.reject', 'ProviderReportImport', id, { reason: reason.slice(0, 200) });
    return this.detail(id);
  }

  // ───────────────────────── reads ─────────────────────────

  private async get(id: string) {
    const imp = await this.prisma.providerReportImport.findUnique({ where: { id } });
    if (!imp) throw new NotFoundException('Report import not found');
    return imp;
  }

  private view(i: ProviderReportImport) {
    const { storageKey: _s, ...rest } = i;
    return rest;
  }

  async detail(id: string) {
    return this.view(await this.get(id));
  }

  async list(q: { page: number; pageSize: number; kind?: string; status?: string }) {
    const where: Prisma.ProviderReportImportWhereInput = { ...(q.kind ? { kind: q.kind as never } : {}), ...(q.status ? { status: q.status as never } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.providerReportImport.findMany({ where, orderBy: { uploadedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.providerReportImport.count({ where }),
    ]);
    return Paginated.of(items.map((i) => this.view(i)), total, q.page, q.pageSize);
  }

  async rows(id: string, q: { page: number; pageSize: number; matchStatus?: string; search?: string }) {
    await this.get(id);
    const s = q.search?.trim();
    const where: Prisma.ProviderReportRowWhereInput = {
      importId: id,
      ...(q.matchStatus ? { matchStatus: q.matchStatus as never } : {}),
      ...(s ? { OR: [{ sourceOrderId: { contains: s } }, { bookingReference: { contains: s.toUpperCase() } }, { bookingReferenceRaw: { contains: s } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.providerReportRow.findMany({ where, orderBy: { rowNumber: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.providerReportRow.count({ where }),
    ]);
    const refs = await this.prisma.eventBooking.findMany({ where: { id: { in: items.map((r) => r.bookingId).filter((x): x is string => !!x) } }, select: { id: true, eventId: true, publicReference: true } });
    const map = new Map(refs.map((b) => [b.id, b]));
    return Paginated.of(items.map((r) => ({ ...r, amount: r.amount?.toFixed(2) ?? null, refundedAmount: r.refundedAmount?.toFixed(2) ?? null, booking: r.bookingId ? map.get(r.bookingId) ?? null : null })), total, q.page, q.pageSize);
  }

  /** Reconciliation results as CSV (formula-safe cells; no personal data is stored, so none is exported). */
  async exportCsv(id: string, actor: ActorContext) {
    const imp = await this.get(id);
    const rows = await this.prisma.providerReportRow.findMany({ where: { importId: id }, orderBy: { rowNumber: 'asc' } });
    const header = ['Row', 'SDI order', 'Booking reference (normalised)', 'Reference as typed', 'Ticket type', 'Line', 'Quantity', 'Amount', 'Refunded', 'Currency', 'Status (SDI)', 'Status', 'Date', 'Result', 'Note', 'Applied'];
    const lines = [header, ...rows.map((r) => [r.rowNumber, r.sourceOrderId, r.bookingReference, r.bookingReferenceRaw, r.ticketType, r.lineKind, r.quantity, r.amount?.toFixed(2), r.refundedAmount?.toFixed(2), r.currency, r.statusRaw, r.status, r.occurredAt?.toISOString(), r.matchStatus, r.matchNote, r.applied ? 'yes' : 'no'])];
    await this.audit.record(actor, 'sdi.report.export', 'ProviderReportImport', id, { rows: rows.length });
    return { fileName: `sdi-reconciliation-${imp.id}.csv`, body: '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') };
  }

  // ───────────────────────── mapping profiles ─────────────────────────

  listProfiles(kind?: string) {
    return this.prisma.providerReportMapping.findMany({ where: { source: 'SDI', ...(kind ? { kind: kind as never } : {}) }, orderBy: { name: 'asc' } });
  }

  async saveProfile(input: { id?: string; kind: 'RECONCILIATION' | 'ATTENDEES'; name: string; mapping: unknown; headers: string[] }, actor: ActorContext) {
    const mapping = input.kind === 'RECONCILIATION' ? this.reconMapping(input.mapping, input.headers) : this.attendeeMapping(input.mapping, input.headers);
    const data = { kind: input.kind, name: input.name.trim().slice(0, 80), mapping: mapping as unknown as Prisma.InputJsonValue };
    const profile = input.id
      ? await this.prisma.providerReportMapping.update({ where: { id: input.id }, data: { ...data, verifiedAgainstSample: false, verifiedById: null, verifiedAt: null, verificationNote: null } }) // any change needs re-verification
      : await this.prisma.providerReportMapping.create({ data: { ...data, createdById: actor.userId } });
    await this.audit.record(actor, input.id ? 'sdi.mapping.update' : 'sdi.mapping.create', 'ProviderReportMapping', profile.id, { name: profile.name, kind: profile.kind });
    return profile;
  }

  /** Attestation that the profile was checked against a REAL SDI sample file (never a synthetic fixture). */
  async verifyProfile(id: string, note: string, actor: ActorContext) {
    const p = await this.prisma.providerReportMapping.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Mapping profile not found');
    if (p.createdById === actor.userId) throw new ForbiddenException({ message: 'A different administrator must verify this mapping (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    const updated = await this.prisma.providerReportMapping.update({ where: { id }, data: { verifiedAgainstSample: true, verifiedById: actor.userId, verifiedAt: new Date(), verificationNote: note.slice(0, 500) } });
    await this.audit.record(actor, 'sdi.mapping.verify', 'ProviderReportMapping', id, { note: note.slice(0, 200) });
    return updated;
  }

  // ───────────────────────── attendees + status ─────────────────────────

  /** Latest APPLIED attendee list (operational seating information — NOT proof of payment). */
  async attendees(q: { page: number; pageSize: number; search?: string; bookingReference?: string }) {
    const latest = await this.prisma.providerReportImport.findFirst({ where: { kind: 'ATTENDEES', status: 'APPLIED' }, orderBy: { appliedAt: 'desc' } });
    // Explicit envelope { import, items, meta } (not a bare Paginated): the admin must know WHICH file the list came from.
    const page = <T>(items: T[], total: number) => {
      const p = Paginated.of(items, total, q.page, q.pageSize);
      return { items: p.items, meta: p.meta };
    };
    if (!latest) return { import: null, ...page([], 0) };
    const s = q.search?.trim();
    const where: Prisma.SdiAttendeeWhereInput = {
      importId: latest.id,
      ...(q.bookingReference ? { bookingReference: q.bookingReference } : {}),
      ...(s ? { OR: [{ guestName: { contains: s } }, { bookingReference: { contains: s.toUpperCase() } }, { tableLabel: { contains: s } }, { ticketType: { contains: s } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sdiAttendee.findMany({ where, orderBy: { rowNumber: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.sdiAttendee.count({ where }),
    ]);
    return { import: { id: latest.id, fileName: latest.fileName, appliedAt: latest.appliedAt, isSynthetic: latest.isSynthetic }, ...page(items, total) };
  }

  async status() {
    const [lastApplied, pending, review] = await Promise.all([
      this.prisma.providerReportImport.findFirst({ where: { kind: 'RECONCILIATION', status: 'APPLIED' }, orderBy: { appliedAt: 'desc' } }),
      this.prisma.providerReportImport.count({ where: { status: { in: ['UPLOADED', 'PREVIEWED'] } } }),
      this.prisma.providerReportRow.count({ where: { applied: false, import: { status: 'APPLIED' }, matchStatus: { in: ['UNMATCHED', 'AMBIGUOUS', 'INVALID_REFERENCE', 'AMOUNT_MISMATCH', 'REQUIRES_REVIEW', 'DUPLICATE_ROW'] } } }),
    ]);
    const periods = await this.prisma.providerReportImport.findMany({ where: { kind: 'RECONCILIATION', status: 'APPLIED', periodFrom: { not: null }, periodTo: { not: null } }, select: { periodFrom: true, periodTo: true }, orderBy: { periodFrom: 'asc' } });
    return {
      mode: this.config.get('GALA_TICKETING_MODE'),
      galaHostedSalesEnabled: this.config.get('GALA_HOSTED_SALES_ENABLED'),
      galaFormConfigured: !!this.config.get('ZEFFY_GALA_TICKET_FORM_URL'),
      generalGivingEnabled: this.config.get('SDI_GENERAL_GIVING_ENABLED'),
      programmeGivingEnabled: this.config.get('SDI_PROGRAMME_GIVING_ENABLED'),
      programmeDesignationConfirmed: this.config.get('SDI_PROGRAMME_DESIGNATION_CONFIRMED'),
      applyEnabled: this.config.get('SDI_REPORT_APPLY_ENABLED'),
      zeffyApiConfigured: !!this.config.get('ZEFFY_API_KEY'),
      lastAppliedReport: lastApplied ? { id: lastApplied.id, appliedAt: lastApplied.appliedAt, periodTo: lastApplied.periodTo, isSynthetic: lastApplied.isSynthetic } : null,
      importsAwaitingAction: pending,
      rowsRequiringReview: review,
      missingBusinessDays: missingBusinessDays(periods.map((p) => ({ from: p.periodFrom!, to: p.periodTo! }))),
    };
  }
}

/** Business days (Mon–Fri, UTC) between the first applied period and yesterday that no applied report covers (max 60 listed). */
export function missingBusinessDays(periods: { from: Date; to: Date }[], today = new Date()): string[] {
  if (periods.length === 0) return [];
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const covered = (t: number) => periods.some((p) => t >= day(p.from) && t <= day(p.to));
  const out: string[] = [];
  for (let t = day(periods[0].from); t < day(today) && out.length < 60; t += 86_400_000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6 && !covered(t)) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
