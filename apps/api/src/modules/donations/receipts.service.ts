import { ConflictException, Inject, Injectable, NotFoundException, NotImplementedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { formatAmount } from './money';
import { RECEIPT_PDF_RENDERER, renderReceiptHtml, type ReceiptPdfRenderer, type ReceiptSnapshot } from './receipt-template';
import type { ReceiptQueryDto } from './donations.dto';

type Tx = Prisma.TransactionClient;
const CONFIRMED = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(RECEIPT_PDF_RENDERER) private readonly pdf: ReceiptPdfRenderer,
  ) {}

  /** Gap-free number per year (row-locked atomic increment). Test receipts use a separate TEST- series. */
  private async nextNumber(tx: Tx, isTest: boolean) {
    const year = new Date().getUTCFullYear();
    const key = isTest ? -year : year;
    const seq = await tx.receiptSequence.upsert({
      where: { year: key },
      create: { year: key, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return `${isTest ? 'TEST-' : ''}MEKI-${year}-${String(seq.lastNumber).padStart(6, '0')}`;
  }

  /** Issues a receipt inside the caller's transaction (used by payment confirmation and admin issue). */
  async issueInTx(tx: Tx, donationId: string, opts: { issuedById?: string; replacesReceiptId?: string; version?: number } = {}) {
    const d = await tx.donation.findUniqueOrThrow({
      where: { id: donationId },
      include: { donor: true, allocations: { include: { campaign: true, programme: true } } },
    });
    if (!(CONFIRMED as readonly string[]).includes(d.paymentStatus)) {
      throw new UnprocessableEntityException({ message: 'Receipts are only issued for confirmed donations', code: 'DONATION_NOT_CONFIRMED' });
    }
    const [site, settings, currency] = await Promise.all([
      tx.siteSetting.findUnique({ where: { id: 'default' } }),
      tx.donationSetting.findUnique({ where: { id: 'default' } }),
      tx.currency.findUnique({ where: { code: d.currency } }),
    ]);
    const a = d.allocations[0];
    const receiptNumber = await this.nextNumber(tx, d.isTest);
    const snapshot: ReceiptSnapshot = {
      receiptNumber,
      issuedAt: new Date().toISOString(),
      isTest: d.isTest,
      donation: { reference: d.reference, amount: formatAmount(d.amount, currency?.minorUnits ?? 2)!, currency: d.currency, frequency: d.frequency, confirmedAt: d.confirmedAt?.toISOString() ?? null },
      donor: { name: `${d.donor.firstName} ${d.donor.lastName}`, organizationName: d.donor.organizationName, countryCode: d.donor.countryCode },
      purpose: {
        designation: a?.designation ?? 'GENERAL_FUND',
        titleEn: a?.campaign?.titleEn ?? a?.programme?.nameEn ?? null,
        titleAr: a?.campaign?.titleAr ?? a?.programme?.nameAr ?? null,
      },
      issuer: {
        nameEn: settings?.receiptIssuerNameEn ?? site?.legalNameEn ?? site?.orgNameEn ?? 'MEKI',
        nameAr: settings?.receiptIssuerNameAr ?? site?.legalNameAr ?? site?.orgNameAr ?? null,
        addressEn: site?.addressEn ?? null,
        addressAr: site?.addressAr ?? null,
        taxIdLabel: settings?.receiptTaxIdLabel ?? null,
        taxId: settings?.receiptTaxId ?? null,
      },
      footerEn: settings?.receiptFooterEn ?? null,
      footerAr: settings?.receiptFooterAr ?? null,
    };
    return tx.donationReceipt.create({
      data: {
        receiptNumber,
        donationId,
        version: opts.version ?? 1,
        locale: d.locale,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        issuedById: opts.issuedById,
        replacesReceiptId: opts.replacesReceiptId,
      },
    });
  }

  async issue(donationId: string, actor: ActorContext) {
    const existing = await this.prisma.donationReceipt.findFirst({ where: { donationId, status: 'ISSUED' } });
    if (existing) throw new ConflictException({ message: 'A receipt has already been issued; use regenerate', code: 'RECEIPT_EXISTS', details: { id: existing.id } });
    if (!(await this.prisma.donation.count({ where: { id: donationId } }))) throw new NotFoundException('Donation not found');
    const last = await this.prisma.donationReceipt.findFirst({ where: { donationId }, orderBy: { version: 'desc' } });
    const receipt = await this.prisma.$transaction((tx) => this.issueInTx(tx, donationId, { issuedById: actor.userId, version: (last?.version ?? 0) + 1 }));
    await this.audit.record(actor, 'receipt.issue', 'DonationReceipt', receipt.id, { receiptNumber: receipt.receiptNumber });
    return receipt;
  }

  /** Void + re-issue with a new number (the original record is kept, never rewritten). */
  async regenerate(receiptId: string, reason: string, actor: ActorContext) {
    const current = await this.get(receiptId);
    if (current.status !== 'ISSUED') throw new UnprocessableEntityException('Only an issued receipt can be regenerated');
    const receipt = await this.prisma.$transaction(async (tx) => {
      const voided = await tx.donationReceipt.updateMany({ where: { id: receiptId, status: 'ISSUED' }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason } });
      if (voided.count !== 1) throw new ConflictException('Receipt changed concurrently');
      return this.issueInTx(tx, current.donationId, { issuedById: actor.userId, replacesReceiptId: receiptId, version: current.version + 1 });
    });
    await this.audit.record(actor, 'receipt.regenerate', 'DonationReceipt', receipt.id, { replaces: current.receiptNumber, reason });
    return receipt;
  }

  async list(q: ReceiptQueryDto) {
    const where: Prisma.DonationReceiptWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.donationId ? { donationId: q.donationId } : {}),
      ...(q.search ? { receiptNumber: { contains: q.search.toUpperCase() } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.donationReceipt.findMany({
        where,
        select: { id: true, receiptNumber: true, donationId: true, version: true, status: true, locale: true, issuedAt: true, voidedAt: true, replacesReceiptId: true },
        orderBy: parseSort(q.sort, ['issuedAt', 'receiptNumber'], { issuedAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.donationReceipt.count({ where }),
    ]);
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  async get(id: string) {
    const r = await this.prisma.donationReceipt.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Receipt not found');
    return r;
  }

  async document(id: string, locale: 'en' | 'ar' | undefined, format: 'html' | 'pdf' = 'html') {
    const r = await this.get(id);
    return this.render(r, locale, format);
  }

  async render(r: { snapshot: Prisma.JsonValue; status: 'ISSUED' | 'VOID'; locale: string }, locale: 'en' | 'ar' | undefined, format: 'html' | 'pdf' = 'html') {
    const html = renderReceiptHtml(r.snapshot as unknown as ReceiptSnapshot, locale ?? (r.locale === 'ar' ? 'ar' : 'en'), r.status);
    if (format === 'html') return { contentType: 'text/html; charset=utf-8', body: html };
    if (!this.pdf.available) throw new NotImplementedException({ message: 'PDF receipts are not configured yet', code: 'PDF_NOT_CONFIGURED' });
    return { contentType: 'application/pdf', body: await this.pdf.render(html) };
  }
}
