import { Body, Controller, Get, Headers, HttpCode, Injectable, NotFoundException, Param, Patch, Post, Query, Req, Res, UnprocessableEntityException } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Response } from 'express';
import { Actor, CurrentUser, Public, RequirePermissions, SkipCsrf } from '../../common/decorators';
import type { ActorContext, AuthenticatedRequest, AuthUser } from '../../common/types/auth-request';
import { DONATION_THROTTLE, STATUS_THROTTLE } from '../../common/rate-limit';
import { Paginated, parseSort } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { DonationConfigService } from './donation-config.service';
import { DonationsService } from './donations.service';
import { DonorsService } from './donors.service';
import { RecurringService } from './recurring.service';
import { RefundsService } from './refunds.service';
import { ReceiptsService } from './receipts.service';
import { ReportsService } from './reports.service';
import { WebhooksService } from './webhooks.service';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import { D, formatAmount } from './money';
import {
  AnonymizeDonorDto,
  CreateDonationDto,
  DonationAdminQueryDto,
  DonationTokenQueryDto,
  DonorAdminQueryDto,
  IssueReceiptDto,
  ReasonDto,
  ReceiptDocumentQueryDto,
  ReceiptQueryDto,
  RecurringQueryDto,
  RefundDecisionDto,
  RefundQueryDto,
  ReportQueryDto,
  RequestRefundDto,
  TransactionQueryDto,
  UpdateCurrencyDto,
  UpdateDonorDto,
  UpdatePaymentProviderDto,
  WebhookEventQueryDto,
} from './donations.dto';

const canSeeDonor = (u: AuthUser) => u.isSuperAdmin || u.permissions.includes('donors.read');

// ─────────────────────────────── public ───────────────────────────────

@ApiTags('Public · Donations')
@Public()
@Controller('public/donations')
export class PublicDonationsController {
  constructor(
    private readonly donations: DonationsService,
    private readonly config: DonationConfigService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Donation configuration: availability, frequencies, enabled currencies with suggested amounts (decimal strings)' })
  getConfig() {
    return this.config.publicConfig();
  }

  @Post()
  @SkipCsrf()
  @Throttle(DONATION_THROTTLE)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Client-generated unique key (16-80 chars). Replays return the same donation.' })
  @ApiOperation({ summary: 'Create a guest donation (PENDING). Returns reference + one-time access token. No payment is taken here.' })
  create(@Body() dto: CreateDonationDto, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) {
    return this.donations.create(dto, key, { ip: req.ip });
  }

  @Post(':reference/payment-session')
  @HttpCode(200)
  @SkipCsrf()
  @Throttle(DONATION_THROTTLE)
  @ApiHeader({ name: 'X-Donation-Token', required: true })
  @ApiOperation({ summary: 'Create (or reuse) a provider-hosted checkout session for the donation' })
  session(@Param('reference') reference: string, @Headers('x-donation-token') token: string | undefined) {
    return this.donations.createPaymentSession(reference, token);
  }

  @Get(':reference/status')
  @Throttle(STATUS_THROTTLE)
  @ApiHeader({ name: 'X-Donation-Token', required: false })
  @ApiOperation({ summary: 'Donor-safe status (no personal data). confirmed=true only after a verified provider event.' })
  status(@Param('reference') reference: string, @Headers('x-donation-token') header: string | undefined, @Query() q: DonationTokenQueryDto) {
    return this.donations.publicStatus(reference, header ?? q.token, q.locale);
  }

  @Get(':reference/confirmation')
  @Throttle(STATUS_THROTTLE)
  @ApiOperation({ summary: 'Return/confirmation page data (same safe view; the redirect itself never confirms payment)' })
  confirmation(@Param('reference') reference: string, @Headers('x-donation-token') header: string | undefined, @Query() q: DonationTokenQueryDto) {
    return this.donations.publicStatus(reference, header ?? q.token, q.locale);
  }

  @Get(':reference/receipt')
  @Throttle(STATUS_THROTTLE)
  @ApiOperation({ summary: 'Donor receipt (HTML) once issued' })
  async receipt(@Param('reference') reference: string, @Headers('x-donation-token') header: string | undefined, @Query() q: DonationTokenQueryDto, @Res() res: Response) {
    const donation = await this.donations.findForDonor(reference, header ?? q.token);
    const receipt = donation.receipts[0];
    if (!receipt) throw new NotFoundException('No receipt has been issued for this donation');
    const doc = await this.receipts.render(receipt, q.locale);
    res.setHeader('Content-Type', doc.contentType).setHeader('Cache-Control', 'private, no-store').setHeader('X-Content-Type-Options', 'nosniff');
    res.send(doc.body);
  }
}

// ─────────────────────────────── webhooks ───────────────────────────────

@ApiTags('Payment webhooks')
@Public()
@SkipCsrf()
@SkipThrottle()
@Controller('webhooks')
export class PaymentWebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post(':provider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Provider notifications. Signature verified on the raw body; idempotent per provider event id.' })
  receive(@Param('provider') provider: string, @Req() req: RawBodyRequest<AuthenticatedRequest>) {
    return this.webhooks.ingest(provider, req.rawBody, req.headers);
  }
}

// ─────────────────────────────── admin ───────────────────────────────

@ApiTags('Admin · Donations')
@ApiCookieAuth()
@Controller('admin/donations')
export class AdminDonationsController {
  constructor(
    private readonly donations: DonationsService,
    private readonly refunds: RefundsService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Get() @RequirePermissions('donations.read')
  @ApiOperation({ summary: 'List/search/filter donations. Donor PII only with donors.read. Test records excluded by default.' })
  list(@Query() q: DonationAdminQueryDto, @CurrentUser() user: AuthUser) {
    return this.donations.adminList(q, canSeeDonor(user));
  }

  @Get(':id') @RequirePermissions('donations.read')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.donations.adminGet(id, canSeeDonor(user));
  }

  @Post(':id/refunds') @RequirePermissions('refunds.request')
  @ApiOperation({ summary: 'Request a full or partial refund (needs approval by a different admin)' })
  requestRefund(@Param('id') id: string, @Body() dto: RequestRefundDto, @Actor() actor: ActorContext) {
    return this.refunds.request(id, dto.amount, dto.reason, actor);
  }

  @Post(':id/receipts') @RequirePermissions('receipts.issue')
  @ApiOperation({ summary: 'Issue a receipt for a confirmed donation (409 if one is already issued)' })
  issueReceipt(@Param('id') id: string, @Body() _dto: IssueReceiptDto, @Actor() actor: ActorContext) {
    return this.receipts.issue(id, actor);
  }
}

@ApiTags('Admin · Donors')
@ApiCookieAuth()
@Controller('admin/donors')
export class AdminDonorsController {
  constructor(private readonly donors: DonorsService) {}

  @Get() @RequirePermissions('donors.read')
  list(@Query() q: DonorAdminQueryDto) {
    return this.donors.list(q);
  }

  @Get(':id') @RequirePermissions('donors.read')
  @ApiOperation({ summary: 'Donor with donation and recurring history' })
  get(@Param('id') id: string) {
    return this.donors.get(id);
  }

  @Patch(':id') @RequirePermissions('donors.manage')
  @ApiOperation({ summary: 'Correct permitted details (e-mail, consent grants and financial data are not editable)' })
  update(@Param('id') id: string, @Body() dto: UpdateDonorDto, @Actor() actor: ActorContext) {
    return this.donors.update(id, dto, actor);
  }

  @Post(':id/anonymize') @HttpCode(200) @RequirePermissions('donors.anonymize')
  @ApiOperation({ summary: 'Erase personal data (financial records retained)' })
  anonymize(@Param('id') id: string, @Body() dto: AnonymizeDonorDto, @Actor() actor: ActorContext) {
    return this.donors.anonymize(id, dto.reason, actor);
  }
}

@Injectable()
export class PaymentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: PaymentProviderRegistry,
    private readonly config: DonationConfigService,
  ) {}

  async transactions(q: TransactionQueryDto) {
    const where = {
      ...(q.includeTest === 'true' ? {} : { isTest: false }),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { providerTransactionRef: { contains: q.search } } : {}),
    };
    const [items, total, minor] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        include: { donation: { select: { reference: true } } },
        orderBy: parseSort(q.sort, ['occurredAt', 'amount', 'type'], { occurredAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.paymentTransaction.count({ where }),
      this.config.minorUnitsFn(),
    ]);
    return Paginated.of(items.map((t) => this.txView(t, minor)), total, q.page, q.pageSize);
  }

  async transaction(id: string) {
    const t = await this.prisma.paymentTransaction.findUnique({ where: { id }, include: { donation: { select: { reference: true } } } });
    if (!t) throw new NotFoundException('Transaction not found');
    return this.txView(t, await this.config.minorUnitsFn());
  }

  private txView<T extends { amount: Prisma.Decimal; currency: string; settlementAmount: Prisma.Decimal | null; feeAmount: Prisma.Decimal | null; exchangeRate: Prisma.Decimal | null }>(t: T, minor: (c: string) => number) {
    return {
      ...t,
      amount: formatAmount(t.amount, minor(t.currency)),
      settlementAmount: t.settlementAmount ? String(t.settlementAmount) : null,
      feeAmount: t.feeAmount ? String(t.feeAmount) : null,
      exchangeRate: t.exchangeRate ? String(t.exchangeRate) : null,
    };
  }

  async providers() {
    const rows = await this.prisma.paymentProvider.findMany({ orderBy: { code: 'asc' } });
    return rows.map((p) => ({ ...p, configuredOnServer: this.registry.has(p.code), activeOnServer: this.registry.active()?.code === p.code }));
  }

  async setProvider(code: string, isEnabled: boolean, actor: ActorContext) {
    const row = await this.prisma.paymentProvider.findUnique({ where: { code } });
    if (!row) throw new NotFoundException('Payment provider not found');
    if (isEnabled && !this.registry.has(code)) {
      throw new UnprocessableEntityException({ message: 'This provider is not configured on the server', code: 'PROVIDER_NOT_CONFIGURED' });
    }
    await this.prisma.paymentProvider.update({ where: { code }, data: { isEnabled, updatedById: actor.userId } });
    await this.audit.record(actor, isEnabled ? 'payment_provider.enable' : 'payment_provider.disable', 'PaymentProvider', code);
    return (await this.providers()).find((p) => p.code === code);
  }

  async currencies() {
    const rows = await this.prisma.currency.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    return rows.map((c) => ({ ...c, minAmount: c.minAmount?.toString() ?? null, maxAmount: c.maxAmount?.toString() ?? null }));
  }

  async updateCurrency(code: string, dto: UpdateCurrencyDto, actor: ActorContext) {
    const c = await this.prisma.currency.findUnique({ where: { code } });
    if (!c) throw new NotFoundException('Currency not found');
    const tooPrecise = [...(dto.suggestedAmounts ?? []), dto.minAmount, dto.maxAmount].filter(Boolean).some((a) => (a!.split('.')[1]?.length ?? 0) > c.minorUnits);
    if (tooPrecise) throw new UnprocessableEntityException(`${code} allows at most ${c.minorUnits} decimal places`);
    const min = dto.minAmount ?? c.minAmount?.toString();
    const max = dto.maxAmount ?? c.maxAmount?.toString();
    if (min && max && D(min).gt(max)) throw new UnprocessableEntityException('minAmount must not exceed maxAmount');
    await this.prisma.currency.update({
      where: { code },
      data: {
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.suggestedAmounts ? { suggestedAmounts: [...dto.suggestedAmounts].sort((a, b) => D(a).cmp(D(b))) } : {}),
        ...(dto.minAmount ? { minAmount: dto.minAmount } : {}),
        ...(dto.maxAmount ? { maxAmount: dto.maxAmount } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'currency.update', 'Currency', code, { fields: AuditService.changedFields(dto) });
    return (await this.currencies()).find((x) => x.code === code);
  }
}

@ApiTags('Admin · Payments')
@ApiCookieAuth()
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsAdminService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get('transactions') @RequirePermissions('payments.read')
  transactions(@Query() q: TransactionQueryDto) {
    return this.payments.transactions(q);
  }

  @Get('transactions/:id') @RequirePermissions('payments.read')
  transaction(@Param('id') id: string) {
    return this.payments.transaction(id);
  }

  @Get('webhook-events') @RequirePermissions('payments.read')
  webhookEvents(@Query() q: WebhookEventQueryDto) {
    return this.webhooks.list(q);
  }

  @Post('webhook-events/:id/retry') @HttpCode(200) @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Re-process a FAILED webhook event (idempotent)' })
  retry(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.webhooks.retry(id, actor);
  }

  @Get('providers') @RequirePermissions('payments.read')
  providers() {
    return this.payments.providers();
  }

  @Patch('providers/:code') @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Administrative activation flag for a server-configured provider' })
  setProvider(@Param('code') code: string, @Body() dto: UpdatePaymentProviderDto, @Actor() actor: ActorContext) {
    return this.payments.setProvider(code, dto.isEnabled, actor);
  }

  @Get('currencies') @RequirePermissions('settings.read')
  currencies() {
    return this.payments.currencies();
  }

  @Patch('currencies/:code') @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Enable/disable a currency and set its suggested/min/max amounts (decimal strings)' })
  updateCurrency(@Param('code') code: string, @Body() dto: UpdateCurrencyDto, @Actor() actor: ActorContext) {
    return this.payments.updateCurrency(code, dto, actor);
  }
}

@ApiTags('Admin · Recurring donations')
@ApiCookieAuth()
@Controller('admin/recurring-donations')
export class AdminRecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get() @RequirePermissions('recurring.read')
  list(@Query() q: RecurringQueryDto) {
    return this.recurring.list(q);
  }

  @Get(':id') @RequirePermissions('recurring.read')
  @ApiOperation({ summary: 'Recurring donation with payment history' })
  get(@Param('id') id: string) {
    return this.recurring.get(id);
  }

  @Post(':id/pause') @HttpCode(200) @RequirePermissions('recurring.manage')
  pause(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.recurring.change(id, 'pause', undefined, actor);
  }

  @Post(':id/resume') @HttpCode(200) @RequirePermissions('recurring.manage')
  resume(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.recurring.change(id, 'resume', undefined, actor);
  }

  @Post(':id/cancel') @HttpCode(200) @RequirePermissions('recurring.manage')
  cancel(@Param('id') id: string, @Body() dto: ReasonDto, @Actor() actor: ActorContext) {
    return this.recurring.change(id, 'cancel', dto.reason, actor);
  }
}

@ApiTags('Admin · Refunds')
@ApiCookieAuth()
@Controller('admin/refunds')
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get() @RequirePermissions('donations.read')
  list(@Query() q: RefundQueryDto) {
    return this.refunds.list(q);
  }

  @Get(':id') @RequirePermissions('donations.read')
  get(@Param('id') id: string) {
    return this.refunds.get(id);
  }

  @Post(':id/approve') @HttpCode(200) @RequirePermissions('refunds.approve')
  approve(@Param('id') id: string, @Body() dto: RefundDecisionDto, @Actor() actor: ActorContext) {
    return this.refunds.decide(id, true, dto.note, actor);
  }

  @Post(':id/reject') @HttpCode(200) @RequirePermissions('refunds.approve')
  reject(@Param('id') id: string, @Body() dto: RefundDecisionDto, @Actor() actor: ActorContext) {
    return this.refunds.decide(id, false, dto.note, actor);
  }

  @Post(':id/execute') @HttpCode(200) @RequirePermissions('refunds.execute')
  @ApiOperation({ summary: 'Send the approved refund to the provider (stays PROCESSING until a verified provider event)' })
  execute(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.refunds.execute(id, actor);
  }
}

@ApiTags('Admin · Receipts')
@ApiCookieAuth()
@Controller('admin/receipts')
export class AdminReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get() @RequirePermissions('receipts.read')
  list(@Query() q: ReceiptQueryDto) {
    return this.receipts.list(q);
  }

  @Get(':id') @RequirePermissions('receipts.read')
  get(@Param('id') id: string) {
    return this.receipts.get(id);
  }

  @Get(':id/document') @RequirePermissions('receipts.read')
  @ApiOperation({ summary: 'Render the receipt (HTML; PDF returns 501 until a renderer is configured)' })
  async document(@Param('id') id: string, @Query() q: ReceiptDocumentQueryDto, @Res() res: Response) {
    const doc = await this.receipts.document(id, q.locale, q.format);
    res.setHeader('Content-Type', doc.contentType).setHeader('Cache-Control', 'private, no-store').setHeader('X-Content-Type-Options', 'nosniff');
    res.send(doc.body);
  }

  @Post(':id/regenerate') @HttpCode(200) @RequirePermissions('receipts.regenerate')
  @ApiOperation({ summary: 'Void this receipt and issue a replacement with a new number' })
  regenerate(@Param('id') id: string, @Body() dto: ReasonDto, @Actor() actor: ActorContext) {
    return this.receipts.regenerate(id, dto.reason, actor);
  }
}

@ApiTags('Admin · Financial reports')
@ApiCookieAuth()
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('donations/summary') @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Confirmed totals per currency (never combined), one-time vs monthly, donation status counts' })
  summary(@Query() q: ReportQueryDto) {
    return this.reports.summary(q);
  }

  @Get('donations/by-campaign') @RequirePermissions('reports.read')
  byCampaign(@Query() q: ReportQueryDto) {
    return this.reports.byCampaign(q);
  }

  @Get('donations/by-date') @RequirePermissions('reports.read')
  byDate(@Query() q: ReportQueryDto) {
    return this.reports.byDate(q);
  }

  @Get('campaigns/:id') @RequirePermissions('reports.read')
  campaign(@Param('id') id: string, @Query() q: ReportQueryDto) {
    return this.reports.campaignTotals(id, q);
  }

  @Get('payments') @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Payment attempts by status and currency (successful vs failed)' })
  payments(@Query() q: ReportQueryDto) {
    return this.reports.payments(q);
  }

  @Get('refunds') @RequirePermissions('reports.read')
  refunds(@Query() q: ReportQueryDto) {
    return this.reports.refunds(q);
  }

  @Get('recurring') @RequirePermissions('reports.read')
  recurring(@Query() q: ReportQueryDto) {
    return this.reports.recurring(q);
  }
}
