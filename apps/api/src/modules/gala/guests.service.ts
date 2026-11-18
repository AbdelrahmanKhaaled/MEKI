import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import ExcelJS from 'exceljs';
import type { Writable } from 'node:stream';
import { csvSafe, toCsv } from './gala.rules';
import type { GuestExportQueryDto, GuestQueryDto } from './gala.dto';

const EXPORT_ROW_LIMIT = 20_000;

const guestInclude = {
  guest: { select: { fullName: true, email: true, phone: true, dietaryRequirements: true } },
  booking: { select: { publicReference: true, paymentStatus: true, bookingStatus: true, createdAt: true } },
} satisfies Prisma.EventTicketInclude;

type Row = Prisma.EventTicketGetPayload<{ include: typeof guestInclude }>;

export const GUEST_EXPORT_HEADER = [
  'Booking Reference',
  'Guest Full Name',
  'Email',
  'Phone',
  'Dietary Requirements',
  'Ticket Number',
  'Ticket Status',
  'Payment Status',
  'Check-in Status',
  'Booking Date',
];

/** Combined guest list: every ticket row is one guest. Paid and unpaid guests are included; filters narrow them. */
@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(eventId: string, q: GuestQueryDto): Prisma.EventTicketWhereInput {
    return {
      eventId,
      ...(q.ticketStatus ? { status: q.ticketStatus } : {}),
      ...(q.checkInStatus === 'CHECKED_IN' ? { status: 'CHECKED_IN' } : {}),
      ...(q.checkInStatus === 'NOT_CHECKED_IN' ? { status: { not: 'CHECKED_IN' } } : {}),
      booking: {
        ...(q.includeTest === 'true' ? {} : { isTest: false }),
        ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      },
      ...(q.search
        ? { OR: [{ guest: { fullName: { contains: q.search } } }, { guest: { email: { contains: q.search } } }, { booking: { publicReference: { contains: q.search } } }, { ticketNumber: { contains: q.search } }] }
        : {}),
    };
  }

  private row(t: Row) {
    return {
      ticketId: t.id, // Phase 6E: lets the admin open the ticket / booking (not exported)
      bookingId: t.bookingId,
      bookingReference: t.booking.publicReference,
      fullName: t.guest.fullName,
      email: t.guest.email,
      phone: t.guest.phone,
      dietaryRequirements: t.guest.dietaryRequirements,
      ticketNumber: t.ticketNumber,
      ticketStatus: t.status,
      paymentStatus: t.booking.paymentStatus,
      checkInStatus: t.status === 'CHECKED_IN' ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
      checkedInAt: t.checkedInAt,
      bookingDate: t.booking.createdAt,
    };
  }

  async list(eventId: string, q: GuestQueryDto) {
    const where = this.where(eventId, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.eventTicket.findMany({
        where,
        include: guestInclude,
        orderBy: parseSort(q.sort, ['createdAt', 'ticketNumber', 'status'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.eventTicket.count({ where }),
    ]);
    return Paginated.of(items.map((t) => this.row(t)), total, q.page, q.pageSize);
  }

  private exportFilters(q: GuestExportQueryDto) {
    return { paymentStatus: q.paymentStatus, ticketStatus: q.ticketStatus, checkInStatus: q.checkInStatus, search: q.search ? '[set]' : undefined, includeTest: q.includeTest === 'true' };
  }

  /** Same filters as the list; refuses oversized exports before any data is read. */
  private async prepareExport(eventId: string, q: GuestExportQueryDto, actor: ActorContext, format: 'csv' | 'xlsx') {
    const where = this.where(eventId, q);
    const total = await this.prisma.eventTicket.count({ where });
    if (total > EXPORT_ROW_LIMIT) throw new UnprocessableEntityException({ message: `Export is limited to ${EXPORT_ROW_LIMIT} rows; narrow the filters`, code: 'EXPORT_TOO_LARGE' });
    await this.audit.record(actor, 'gala.guests.export', 'Event', eventId, { format, rows: total, filters: this.exportFilters(q) });
    return where;
  }

  /** Batched cursor read (500 rows at a time): memory stays flat for large exports. */
  private async *exportRows(where: Prisma.EventTicketWhereInput): AsyncGenerator<unknown[]> {
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.eventTicket.findMany({
        where,
        include: guestInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!batch.length) return;
      for (const t of batch) {
        const r = this.row(t);
        yield [r.bookingReference, r.fullName, r.email, r.phone, r.dietaryRequirements, r.ticketNumber, r.ticketStatus, r.paymentStatus, r.checkInStatus, r.bookingDate];
      }
      cursor = batch[batch.length - 1].id;
    }
  }

  /**
   * CSV for Excel/Sheets (UTF-8 with BOM, CRLF). Every cell is formula-injection safe. Meant to be merged manually with
   * MEKI's invited-guest list (no RSVP integration exists). Audited with the filters and row count.
   */
  async exportCsv(eventId: string, q: GuestExportQueryDto, actor: ActorContext) {
    const where = await this.prepareExport(eventId, q, actor, 'csv');
    const rows: unknown[][] = [];
    for await (const r of this.exportRows(where)) rows.push(r);
    return String.fromCharCode(0xfeff) + toCsv(GUEST_EXPORT_HEADER, rows); // UTF-8 BOM so Excel detects the encoding
  }

  /**
   * Native .xlsx streamed to the response (ExcelJS streaming writer, no full workbook in memory). Same filters, columns and
   * permission as the CSV. Every text cell goes through the same formula-injection guard and is written as a plain string
   * (never as a formula); the booking date is a real date with a readable number format; Arabic text is stored as UTF-8.
   */
  async exportXlsx(eventId: string, q: GuestExportQueryDto, actor: ActorContext, out: Writable, beforeStream: () => void) {
    const where = await this.prepareExport(eventId, q, actor, 'xlsx');
    beforeStream(); // download headers are set only after validation/audit succeeded, so errors stay normal JSON responses
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
    wb.creator = 'MEKI';
    wb.created = new Date();
    const ws = wb.addWorksheet('Guests', { views: [{ state: 'frozen', ySplit: 1 }] });
    const widths = [20, 28, 34, 20, 34, 18, 14, 16, 18, 20];
    ws.columns = GUEST_EXPORT_HEADER.map((header, i) => ({ header, key: String(i), width: widths[i] }));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: GUEST_EXPORT_HEADER.length } };
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3B30' } };
    head.commit();
    ws.getColumn(10).numFmt = 'yyyy-mm-dd hh:mm';
    for await (const r of this.exportRows(where)) {
      ws.addRow(r.map((v) => (v instanceof Date ? v : csvSafe(v)))).commit();
    }
    ws.commit();
    await wb.commit();
  }
}
