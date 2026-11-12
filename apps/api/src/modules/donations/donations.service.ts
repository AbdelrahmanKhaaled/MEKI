import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { Paginated, parseSort } from '../../common/utils';
import { DonationConfigService, DonationRuleViolation } from './donation-config.service';
import { D, formatAmount, generateReference } from './money';
import type { CreateDonationDto, DonationAdminQueryDto } from './donations.dto';

/** Deterministic JSON (sorted keys) so retries with re-ordered fields hash identically. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const OPEN_ATTEMPT = ['CREATED', 'REQUIRES_ACTION'] as const;

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly donationConfig: DonationConfigService,
  ) {}

  // ───────── donor-facing access tokens ─────────

  /** HMAC(secret, donationId): reproducible for idempotent replays, only its SHA-256 is stored. */
  private tokenFor(donationId: string) {
    const secret = this.config.get('DONATION_TOKEN_SECRET');
    if (!secret) throw new BadGatewayException('Donation tokens are not configured');
    return createHmac('sha256', secret).update(`donation:${donationId}`).digest('base64url');
  }

  /** Loads a donation by public reference, verifying the token in constant time. Same 404 for both failures. */
  async findForDonor(reference: string, token: string | undefined) {
    const notFound = new NotFoundException('Donation not found');
    if (!token || token.length > 128 || !/^DN-[0-9A-Z]{12}$/.test(reference)) throw notFound;
    const donation = await this.prisma.donation.findUnique({
      where: { reference },
      include: {
        allocations: { include: { campaign: { select: { titleEn: true, titleAr: true, slug: true } }, programme: { select: { nameEn: true, nameAr: true, slug: true } } } },
        receipts: { where: { status: 'ISSUED' }, orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!donation) throw notFound;
    const given = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
    const stored = Buffer.from(donation.accessTokenHash, 'hex');
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) throw notFound;
    return donation;
  }

  // ───────── public: create ─────────

  async create(dto: CreateDonationDto, idempotencyKey: string | undefined, _client: { ip?: string }) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
      throw new BadRequestException({ message: 'An Idempotency-Key header (16-80 chars, [A-Za-z0-9_-]) is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    const requestHash = createHash('sha256').update(canonical(dto)).digest('hex');
    const existing = await this.prisma.donation.findUnique({ where: { idempotencyKey } });
    if (existing) return this.replay(existing, requestHash);

    const adapter = await this.donationConfig.requireAdapter();
    const frequency = dto.frequency ?? 'ONE_TIME';
    if (frequency === 'MONTHLY') await this.donationConfig.assertRecurringAllowed(adapter);
    const target = await this.donationConfig.resolveDesignation(dto);
    const { amount, currency } = await this.donationConfig.validateAmount(dto.amount, dto.currency, target.campaign, adapter);

    let sourceEventId: string | null = null;
    if (dto.attribution?.eventSlug) {
      const event = await this.prisma.event.findFirst({
        where: { slug: dto.attribution.eventSlug, deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] }, approvedAt: { not: null } },
        select: { id: true },
      });
      if (!event) throw new DonationRuleViolation('Unknown event attribution', 'INVALID_EVENT_ATTRIBUTION');
      sourceEventId = event.id;
    }

    const now = new Date();
    const locale = dto.locale ?? 'en';
    try {
      const donation = await this.prisma.$transaction(async (tx) => {
        // Guest donors are never merged by e-mail: each guest donation gets its own donor record.
        const donor = await tx.donor.create({
          data: {
            ...dto.donor,
            preferredLocale: locale,
            marketingConsent: dto.marketingConsent === true,
            marketingConsentAt: dto.marketingConsent ? now : null,
            privacyConsentAt: now,
            privacyPolicyVersion: dto.privacyPolicyVersion,
          },
        });
        const recurring =
          frequency === 'MONTHLY'
            ? await tx.recurringDonation.create({
                data: {
                  reference: generateReference('RD'),
                  donorId: donor.id,
                  designation: target.designation,
                  campaignId: target.campaign?.id,
                  programmeId: target.programme?.id ?? target.campaign?.programmeId,
                  amount,
                  currency: currency.code,
                  provider: adapter.code,
                  isTest: adapter.isTest,
                  maxRetryAttempts: this.config.get('RECURRING_MAX_RETRY_ATTEMPTS'),
                },
              })
            : null;
        const created = await tx.donation.create({
          data: {
            reference: generateReference('DN'),
            accessTokenHash: '0'.repeat(64), // replaced below once the id exists
            idempotencyKey,
            idempotencyRequestHash: requestHash,
            donorId: donor.id,
            amount,
            currency: currency.code,
            frequency,
            isAnonymous: dto.isAnonymous === true,
            donorMessage: dto.message?.trim() || null,
            provider: adapter.code,
            isTest: adapter.isTest,
            locale,
            source: dto.attribution?.source,
            utmSource: dto.attribution?.utmSource,
            utmMedium: dto.attribution?.utmMedium,
            utmCampaign: dto.attribution?.utmCampaign,
            sourceEventId,
            recurringDonationId: recurring?.id,
            allocations: {
              create: {
                designation: target.designation,
                campaignId: target.campaign?.id,
                programmeId: target.programme?.id ?? target.campaign?.programmeId,
                amount,
                currency: currency.code,
              },
            },
          },
        });
        return tx.donation.update({
          where: { id: created.id },
          data: { accessTokenHash: createHash('sha256').update(this.tokenFor(created.id)).digest('hex') },
        });
      });
      this.logger.log(`donation.created ref=${donation.reference} test=${donation.isTest}`);
      return this.createdView(donation, currency.minorUnits);
    } catch (e) {
      // Two concurrent requests with the same key: the unique index wins, the loser replays.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await this.prisma.donation.findUnique({ where: { idempotencyKey } });
        if (raced) return this.replay(raced, requestHash);
      }
      throw e;
    }
  }

  private async replay(existing: { id: string; idempotencyRequestHash: string | null } & Parameters<DonationsService['createdView']>[0], requestHash: string) {
    if (existing.idempotencyRequestHash !== requestHash) {
      throw new ConflictException({ message: 'Idempotency-Key was already used with different data', code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    const minor = await this.donationConfig.minorUnitsFn();
    return { ...this.createdView(existing, minor(existing.currency)), replayed: true };
  }

  private createdView(
    d: { id: string; reference: string; status: string; paymentStatus: string; amount: Prisma.Decimal; currency: string; frequency: string; isTest: boolean },
    minorUnits: number,
  ) {
    return {
      reference: d.reference,
      /** Shown once; required for status, payment session and receipt requests. Store it client-side only. */
      accessToken: this.tokenFor(d.id),
      status: d.status,
      paymentStatus: d.paymentStatus,
      amount: formatAmount(d.amount, minorUnits),
      currency: d.currency,
      frequency: d.frequency,
      isTest: d.isTest,
    };
  }

  // ───────── public: payment session ─────────

  async createPaymentSession(reference: string, token: string | undefined) {
    const donation = await this.findForDonor(reference, token);
    if (donation.paymentStatus === 'PAID' || donation.status === 'COMPLETED') {
      throw new ConflictException({ message: 'This donation is already paid', code: 'DONATION_ALREADY_PAID' });
    }
    if (donation.status === 'CANCELLED' || donation.status === 'EXPIRED') {
      throw new DonationRuleViolation('This donation can no longer be paid', 'DONATION_CLOSED');
    }
    if (donation.recurringDonationId) {
      const recurring = await this.prisma.recurringDonation.findUniqueOrThrow({ where: { id: donation.recurringDonationId } });
      if (recurring.status !== 'PENDING_ACTIVATION' && recurring.status !== 'FAILED') {
        throw new ConflictException({ message: 'This recurring donation is already set up', code: 'RECURRING_ALREADY_ACTIVE' });
      }
    }
    const adapter = await this.donationConfig.requireAdapter();
    if (adapter.code !== donation.provider) throw new DonationRuleViolation('Payment provider changed; please start a new donation', 'PROVIDER_CHANGED');

    // Re-use an open, unexpired attempt (double-clicks, page reloads).
    const open = await this.prisma.paymentAttempt.findFirst({
      where: { donationId: donation.id, status: { in: [...OPEN_ATTEMPT] }, expiresAt: { gt: new Date() } },
      orderBy: { initiatedAt: 'desc' },
    });
    if (open?.checkoutUrl) return this.sessionView(open);

    const minor = await this.donationConfig.minorUnitsFn();
    const amount = formatAmount(donation.amount, minor(donation.currency))!;
    const attempt = await this.prisma.$transaction(async (tx) => {
      if (donation.status === 'FAILED') {
        // Retry after a failed payment: the intent becomes payable again (money state stays driven by events).
        await tx.donation.update({ where: { id: donation.id }, data: { status: 'PENDING', paymentStatus: 'UNPAID' } });
      }
      return tx.paymentAttempt.create({
        data: {
          reference: generateReference('PA'),
          donationId: donation.id,
          provider: adapter.code,
          amount: donation.amount,
          currency: donation.currency,
          isTest: adapter.isTest,
          expiresAt: new Date(Date.now() + this.config.get('PAYMENT_SESSION_TTL_MINUTES') * 60_000),
        },
      });
    });

    const purpose = donation.allocations[0];
    const urls = this.returnUrls(donation.reference, donation.locale);
    try {
      const recurring = donation.recurringDonationId ? await this.prisma.recurringDonation.findUnique({ where: { id: donation.recurringDonationId } }) : null;
      const session = await adapter.createPaymentSession({
        attemptReference: attempt.reference,
        donationReference: donation.reference,
        amount,
        currency: donation.currency,
        description: purpose?.campaign?.titleEn ?? purpose?.programme?.nameEn ?? 'MEKI general fund',
        locale: donation.locale,
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
        ...(recurring ? { recurring: { reference: recurring.reference, interval: 'MONTHLY' as const, intervalCount: recurring.intervalCount } } : {}),
      });
      const updated = await this.prisma.$transaction(async (tx) => {
        if (recurring && session.agreementRef) {
          await tx.recurringDonation.update({ where: { id: recurring.id }, data: { providerAgreementRef: session.agreementRef, status: 'PENDING_ACTIVATION' } });
        }
        return tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { providerSessionRef: session.sessionRef, checkoutUrl: session.checkoutUrl, status: 'REQUIRES_ACTION', ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}) },
        });
      });
      return this.sessionView(updated);
    } catch (e) {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', failureCode: 'SESSION_CREATE_FAILED', failureReason: (e as Error).message.slice(0, 500), completedAt: new Date() },
      });
      this.logger.error(`payment session failed ref=${donation.reference}: ${(e as Error).message}`);
      throw new BadGatewayException({ message: 'The payment provider is unavailable, please try again', code: 'PROVIDER_UNAVAILABLE' });
    }
  }

  /** Provider return/cancel URLs. Only the public reference is included — never the access token. */
  returnUrls(reference: string, locale: string) {
    const base = this.config.get('DONATION_RETURN_URL').replace('{locale}', locale === 'ar' ? 'ar' : 'en');
    return { returnUrl: `${base}?reference=${reference}`, cancelUrl: `${base}?reference=${reference}&cancelled=1` };
  }

  private sessionView(a: { reference: string; checkoutUrl: string | null; expiresAt: Date | null; provider: string; isTest: boolean }) {
    return { attemptReference: a.reference, checkoutUrl: a.checkoutUrl, expiresAt: a.expiresAt, provider: a.provider, isTest: a.isTest };
  }

  // ───────── public: status / confirmation ─────────

  /** Donor-safe view: no donor PII, provider ids, notes, failure internals or admin data. */
  async publicStatus(reference: string, token: string | undefined, locale: 'en' | 'ar' = 'en') {
    const d = await this.findForDonor(reference, token);
    const minor = await this.donationConfig.minorUnitsFn();
    const purpose = d.allocations[0];
    const confirmed = d.paymentStatus === 'PAID' || d.paymentStatus === 'PARTIALLY_REFUNDED' || d.paymentStatus === 'REFUNDED';
    const pick = (en?: string | null, ar?: string | null) => (locale === 'ar' ? (ar ?? en) : en) ?? null;
    return {
      reference: d.reference,
      status: d.status,
      paymentStatus: d.paymentStatus,
      confirmed,
      /** The return page must show "processing" until confirmed=true (set only by a verified provider event). */
      message: confirmed ? 'confirmed' : d.status === 'FAILED' ? 'failed' : d.status === 'PENDING' ? 'processing' : d.status.toLowerCase(),
      amount: formatAmount(d.amount, minor(d.currency)),
      currency: d.currency,
      frequency: d.frequency,
      designation: purpose?.designation ?? 'GENERAL_FUND',
      purpose: pick(purpose?.campaign?.titleEn ?? purpose?.programme?.nameEn, purpose?.campaign?.titleAr ?? purpose?.programme?.nameAr),
      confirmedAt: d.confirmedAt,
      createdAt: d.createdAt,
      receiptNumber: d.receipts[0]?.receiptNumber ?? null,
      isTest: d.isTest,
    };
  }

  // ───────── admin ─────────

  private adminWhere(q: DonationAdminQueryDto): Prisma.DonationWhereInput {
    return {
      ...(q.includeTest === 'true' ? {} : { isTest: false }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.frequency ? { frequency: q.frequency } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.donorId ? { donorId: q.donorId } : {}),
      ...(q.campaignId ? { allocations: { some: { campaignId: q.campaignId } } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ reference: { contains: q.search.toUpperCase() } }, { donor: { email: { contains: q.search.toLowerCase() } } }] } : {}),
    };
  }

  async adminList(q: DonationAdminQueryDto, canSeeDonor: boolean) {
    const where = this.adminWhere(q);
    if (!canSeeDonor && q.search) where.OR = [{ reference: { contains: q.search.toUpperCase() } }]; // no PII search without donors.read
    const [items, total, minor] = await Promise.all([
      this.prisma.donation.findMany({
        where,
        include: { donor: true, allocations: { include: { campaign: { select: { id: true, titleEn: true, slug: true } }, programme: { select: { id: true, nameEn: true, slug: true } } } } },
        orderBy: parseSort(q.sort, ['createdAt', 'amount', 'confirmedAt', 'status'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.donation.count({ where }),
      this.donationConfig.minorUnitsFn(),
    ]);
    return Paginated.of(items.map((d) => this.adminView(d, canSeeDonor, minor)), total, q.page, q.pageSize);
  }

  async adminGet(id: string, canSeeDonor: boolean) {
    const d = await this.prisma.donation.findUnique({
      where: { id },
      include: {
        donor: true,
        allocations: { include: { campaign: { select: { id: true, titleEn: true, slug: true } }, programme: { select: { id: true, nameEn: true, slug: true } } } },
        attempts: { orderBy: { initiatedAt: 'desc' } },
        transactions: { orderBy: { occurredAt: 'asc' } },
        refunds: { orderBy: { requestedAt: 'desc' } },
        receipts: { orderBy: { version: 'desc' } },
        recurringDonation: true,
        sourceEvent: { select: { id: true, slug: true, titleEn: true } },
      },
    });
    if (!d) throw new NotFoundException('Donation not found');
    const minor = await this.donationConfig.minorUnitsFn();
    const m = minor(d.currency);
    return {
      ...this.adminView(d, canSeeDonor, minor),
      attempts: d.attempts.map(({ checkoutUrl: _c, ...a }) => ({ ...a, amount: formatAmount(a.amount, m) })),
      transactions: d.transactions.map((t) => ({ ...t, amount: formatAmount(t.amount, m), settlementAmount: t.settlementAmount?.toString() ?? null, feeAmount: t.feeAmount?.toString() ?? null })),
      refunds: d.refunds.map((r) => ({ ...r, amount: formatAmount(r.amount, m) })),
      receipts: d.receipts.map(({ snapshot: _s, ...r }) => r),
      recurringDonation: d.recurringDonation ? { id: d.recurringDonation.id, reference: d.recurringDonation.reference, status: d.recurringDonation.status } : null,
      sourceEvent: d.sourceEvent,
      utm: { source: d.utmSource, medium: d.utmMedium, campaign: d.utmCampaign },
    };
  }

  private adminView(
    d: Prisma.DonationGetPayload<{ include: { donor: true; allocations: { include: { campaign: { select: { id: true; titleEn: true; slug: true } }; programme: { select: { id: true; nameEn: true; slug: true } } } } } }>,
    canSeeDonor: boolean,
    minor: (c: string) => number,
  ) {
    const m = minor(d.currency);
    return {
      id: d.id,
      reference: d.reference,
      amount: formatAmount(d.amount, m),
      refundedAmount: formatAmount(d.refundedAmount, m),
      netAmount: formatAmount(D(d.amount).minus(d.refundedAmount), m),
      currency: d.currency,
      frequency: d.frequency,
      status: d.status,
      paymentStatus: d.paymentStatus,
      isAnonymous: d.isAnonymous,
      donorMessage: d.donorMessage,
      provider: d.provider,
      isTest: d.isTest,
      source: d.source,
      confirmedAt: d.confirmedAt,
      createdAt: d.createdAt,
      allocations: d.allocations.map((a) => ({ designation: a.designation, campaign: a.campaign, programme: a.programme, amount: formatAmount(a.amount, m), currency: a.currency })),
      donorId: d.donorId,
      donor: canSeeDonor
        ? { id: d.donor.id, firstName: d.donor.firstName, lastName: d.donor.lastName, email: d.donor.email, organizationName: d.donor.organizationName, countryCode: d.donor.countryCode, anonymizedAt: d.donor.anonymizedAt }
        : undefined,
    };
  }
}
