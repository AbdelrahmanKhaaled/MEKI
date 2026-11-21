import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated } from '../../common/utils';
import { AppConfigService } from '../../config/app-config.service';
import { parseProgrammeFormUrls } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DonationConfigService, DonationRuleViolation } from '../donations/donation-config.service';
import { D, generateReference } from '../donations/money';
import { EventFundraisingService } from '../fundraising/fundraising.module';
import {
  CLASSIFICATION_ANSWER,
  DONATION_REF,
  donorStage,
  GALA_ONLY_DISCLOSURE_VERSION,
  galaGate,
  galaOnlyGate,
  generalGate,
  programmeGate,
  zakatGate,
  type Classification,
  type DonationIntentType,
  type Gate,
  type GivingFlags,
} from './giving.rules';
import { ZakatEligibilityService } from './zakat-eligibility.service';

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
/** Provider tag on hosted intents: payment happens on SDI's Zeffy form; MEKI never charges. */
export const HOSTED_PROVIDER = 'sdi_hosted';

export type CreateIntentInput = {
  intentType: DonationIntentType;
  programmeSlug?: string;
  eventSlug?: string;
  amount: string;
  currency: string;
  classification: Classification;
  donor: { fullName: string; email: string };
  acceptTerms: boolean;
  locale?: 'en' | 'ar';
  /** Phase 14B (Gala-only mode): the option the donor started from — "general" or a programme slug. GALA_DONATION only. */
  sourceInterest?: string;
  /** Phase 14B: the donor explicitly accepted that the gift goes to the approved Gala project instead. Required with sourceInterest. */
  acknowledgeGalaDestination?: boolean;
};

const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null);

const include = {
  donor: { select: { firstName: true, lastName: true, email: true, anonymizedAt: true } },
  interestProgramme: { select: { slug: true, nameEn: true, nameAr: true } },
  allocations: { include: { programme: { select: { slug: true, code: true, nameEn: true, nameAr: true } }, project: { select: { code: true, nameEn: true, nameAr: true } } } },
} satisfies Prisma.DonationInclude;
type IntentRow = Prisma.DonationGetPayload<{ include: typeof include }>;

/**
 * Phase 14 — hosted donation intents (Gala donation, programme donation, general donation) on SDI's Zeffy forms.
 *
 *  - An intent is a MEKI `Donation` row (the existing donation system, no second one) with provider `sdi_hosted`, a DN-…
 *    reference, the donor's intent type and Zakat/Sadaqah classification (both immutable — DB trigger) and the intended
 *    designation (DonationAllocation). Status stays PENDING/UNPAID + AWAITING_REPORT.
 *  - Only an applied, four-eyes SDI report can verify it (SdiReportsService). A redirect, a return page or the donor's choice
 *    never changes payment state. MEKI issues no receipt (SDI/Zeffy does).
 *  - Fund allocation is authorized separately, by an administrator other than the report approver.
 *  - Every channel has its own gate (giving.rules.ts); nothing is offered beyond the written SDI agreement.
 */
@Injectable()
export class GivingService {
  private readonly logger = new Logger(GivingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly donationConfig: DonationConfigService,
    private readonly fundraising: EventFundraisingService,
    private readonly zakat: ZakatEligibilityService,
  ) {}

  flags(): GivingFlags {
    const c = this.config;
    return {
      referenceConfirmed: c.get('SDI_DONATION_REFERENCE_CONFIRMED'),
      typeConfirmed: c.get('SDI_DONATION_TYPE_CONFIRMED'),
      zakatEnabled: c.get('ZAKAT_GIVING_ENABLED'),
      generalAuthorized: c.get('GENERAL_GIVING_AUTHORIZED'),
      sdiGeneralEnabled: c.get('SDI_GENERAL_GIVING_ENABLED'),
      generalFormUrl: c.get('ZEFFY_DONATION_FORM_URL') ?? null,
      programmeAuthorized: c.get('PROGRAMME_GIVING_AUTHORIZED'),
      sdiProgrammeEnabled: c.get('SDI_PROGRAMME_GIVING_ENABLED'),
      designationConfirmed: c.get('SDI_PROGRAMME_DESIGNATION_CONFIRMED'),
      programmeFormUrls: parseProgrammeFormUrls(c.get('SDI_PROGRAMME_FORM_URLS')),
    };
  }

  private questions() {
    return { referenceQuestion: this.config.get('SDI_DONATION_REFERENCE_QUESTION'), donationTypeQuestion: this.config.get('SDI_DONATION_TYPE_QUESTION') };
  }

  private publishedProgrammes() {
    return this.prisma.programme.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', kind: 'PROGRAMME', provenance: { not: 'DEMO' } },
      select: { id: true, slug: true, code: true, nameEn: true, nameAr: true, number: true },
      orderBy: [{ number: 'asc' }, { code: 'asc' }],
    });
  }

  // ───────────────────────── public: options ─────────────────────────

  /** Phase 14B — whether program / general gifts may be offered as Gala gifts (mode on + Gala intent gate open). */
  private async galaOnly(locale: 'en' | 'ar') {
    const slug = this.config.get('GIVING_GALA_EVENT_SLUG');
    const g = await this.fundraising.galaGivingState(slug);
    const gate = galaGate(this.flags(), g ?? { givingAvailable: false, formUrl: null });
    const state = galaOnlyGate(this.config.get('GIVING_GALA_ONLY_MODE'), gate);
    const eligible = state.active && g?.project ? await this.zakat.isEligible('PROJECT', g.project.id) : false;
    return {
      active: state.active,
      reason: state.reason,
      eventSlug: slug,
      project: state.active && g?.project ? { code: g.project.code, name: locale === 'ar' ? g.project.nameAr || g.project.nameEn : g.project.nameEn } : null,
      zakat: state.active && g?.project ? zakatGate(this.flags(), { eligible }) : zakatGate(this.flags(), null),
      disclosureVersion: GALA_ONLY_DISCLOSURE_VERSION,
    };
  }

  /** Everything the general / programme giving form needs. Programmes are listed for INFORMATION; `payable` says what may be paid. */
  async options(locale: 'en' | 'ar' = 'en') {
    const f = this.flags();
    const general = generalGate(f);
    const programmeChannel = programmeGate({ ...f, programmeFormUrls: { __any__: 'x' } }, '__any__');
    const programmes = await this.publishedProgrammes();
    const zakatMap = await this.zakat.effectiveMap('PROGRAMME', programmes.map((p) => p.id));
    const generalZakat = zakatGate(f, null);
    return {
      currency: 'USD' as const,
      limits: await this.donationConfig.hostedLimits(),
      ...this.questions(),
      referencePrefill: false as const,
      classifications: ['SADAQAH', 'ZAKAT'] as const,
      /** Phase 14B: Gala-only launch mode — program/general "Give" may be redirected to the Gala project WITH the donor's acceptance */
      galaOnly: await this.galaOnly(locale),
      channels: {
        general: { available: general.available, reason: general.reason, zakat: generalZakat },
        programme: { available: programmeChannel.available, reason: programmeChannel.available ? null : programmeChannel.reason },
      },
      programmes: programmes.map((p) => {
        const gate = programmeGate(f, p.slug);
        return {
          slug: p.slug,
          code: p.code,
          name: locale === 'ar' ? p.nameAr || p.nameEn : p.nameEn,
          payable: gate.available,
          reason: gate.reason,
          zakat: zakatGate(f, { eligible: zakatMap.get(p.id) ?? false }),
        };
      }),
    };
  }

  /** Gala donation options (the single approved Gala project). */
  async galaOptions(slug: string, locale: 'en' | 'ar' = 'en') {
    const g = await this.fundraising.galaGivingState(slug);
    if (!g) throw new NotFoundException('Event not found');
    const f = this.flags();
    const gate = galaGate(f, g);
    const eligible = g.project ? await this.zakat.isEligible('PROJECT', g.project.id) : false;
    return {
      currency: 'USD' as const,
      limits: await this.donationConfig.hostedLimits(),
      ...this.questions(),
      referencePrefill: false as const,
      available: gate.available,
      reason: gate.reason,
      campaignClosed: g.campaignClosed,
      project: g.project ? { code: g.project.code, name: locale === 'ar' ? g.project.nameAr || g.project.nameEn : g.project.nameEn } : null,
      zakat: g.project ? zakatGate(f, { eligible }) : zakatGate(f, null),
      /** the Phase 12B direct link stays in use while SDI has not confirmed the donation-reference question */
      directLinkOnly: g.givingAvailable && gate.reason === 'REFERENCE_QUESTION_NOT_CONFIRMED',
    };
  }

  // ───────────────────────── public: create ─────────────────────────

  private tokenSecret() {
    const s = this.config.get('DONATION_TOKEN_SECRET') ?? this.config.get('EVENT_BOOKING_TOKEN_SECRET');
    if (!s) throw new ServiceUnavailableException({ message: 'Donation references are not configured', code: 'GIVING_TOKEN_NOT_CONFIGURED' });
    return s;
  }
  /** HMAC(secret, "hosted-donation:" + id): reproducible for idempotent replays; only its SHA-256 is stored. */
  private tokenFor(id: string) {
    return createHmac('sha256', this.tokenSecret()).update(`hosted-donation:${id}`).digest('base64url');
  }

  /** Resolves the gate, designation and Zakat rule for an intent. Throws a coded 4xx/503 on every refusal. */
  private async resolve(input: CreateIntentInput) {
    const f = this.flags();
    if (input.intentType !== 'GALA_DONATION' && (input.sourceInterest !== undefined || input.acknowledgeGalaDestination !== undefined)) {
      throw new BadRequestException({ message: 'A source interest is only used when a gift is redirected to the Gala project', code: 'INTEREST_ONLY_FOR_GALA' });
    }
    if (input.intentType === 'GALA_DONATION') {
      if (input.programmeSlug) throw new BadRequestException({ message: 'A Gala donation supports the approved Gala project only', code: 'GALA_DONATION_NO_PROGRAMME' });
      const interest = input.sourceInterest !== undefined ? await this.resolveInterest(input) : null;
      const g = await this.fundraising.galaGivingState(input.eventSlug ?? '');
      if (!g) throw new NotFoundException('Event not found');
      const gate = galaGate(f, g);
      return { gate, interest, zakatTarget: g.project ? { type: 'PROJECT' as const, id: g.project.id } : null, allocation: { designation: 'PROJECT' as const, projectId: g.project?.id ?? null, programmeId: null }, sourceEventId: g.eventId, designationLabel: g.project?.nameEn ?? null };
    }
    if (input.eventSlug) throw new BadRequestException({ message: 'Only Gala donations name an event', code: 'EVENT_NOT_ALLOWED' });
    if (input.intentType === 'PROGRAM_DONATION') {
      if (!input.programmeSlug) throw new BadRequestException({ message: 'Choose a programme', code: 'PROGRAMME_REQUIRED' });
      const p = await this.prisma.programme.findFirst({ where: { slug: input.programmeSlug, deletedAt: null, status: 'PUBLISHED', kind: 'PROGRAMME', provenance: { not: 'DEMO' } } });
      if (!p) throw new DonationRuleViolation('This programme is not accepting donations', 'PROGRAMME_NOT_ACCEPTING_DONATIONS');
      return { gate: programmeGate(f, p.slug), interest: null, zakatTarget: { type: 'PROGRAMME' as const, id: p.id }, allocation: { designation: 'PROGRAMME' as const, programmeId: p.id, projectId: null }, sourceEventId: null, designationLabel: p.nameEn };
    }
    if (input.programmeSlug) throw new BadRequestException({ message: 'General donations do not name a programme', code: 'GENERAL_DONATION_NO_PROGRAMME' });
    return { gate: generalGate(f), interest: null, zakatTarget: null, allocation: { designation: 'GENERAL_FUND' as const, programmeId: null, projectId: null }, sourceEventId: null, designationLabel: null };
  }

  /**
   * Phase 14B — a program / general "Give" fulfilled as a Gala gift. Never silent: Gala-only mode must be on, the gift must go to
   * the configured Gala event, the donor must have accepted the destination disclosure, and the source option itself must NOT be
   * open (otherwise the donor gives to it directly). Returns the immutable source-interest record.
   */
  private async resolveInterest(input: CreateIntentInput) {
    if (!this.config.get('GIVING_GALA_ONLY_MODE')) throw new ConflictException({ message: 'Gala-only giving is not active', code: 'GIVING_CHANNEL_DISABLED', details: { reason: 'GALA_ONLY_MODE_OFF' } });
    if (input.eventSlug !== this.config.get('GIVING_GALA_EVENT_SLUG')) throw new BadRequestException({ message: 'Redirected gifts go to the configured Gala event only', code: 'GALA_ONLY_WRONG_EVENT' });
    if (input.acknowledgeGalaDestination !== true) throw new BadRequestException({ message: 'Please confirm that your gift will support the Gala project', code: 'GALA_DESTINATION_NOT_ACKNOWLEDGED' });
    const f = this.flags();
    if (input.sourceInterest === 'general') {
      if (generalGate(f).available) throw new ConflictException({ message: 'General giving is open: give there directly', code: 'INTEREST_CHANNEL_OPEN' });
      return { kind: 'GENERAL' as const, programmeId: null, slug: null };
    }
    const p = await this.prisma.programme.findFirst({ where: { slug: input.sourceInterest, deletedAt: null, status: 'PUBLISHED', kind: 'PROGRAMME', provenance: { not: 'DEMO' } } });
    if (!p) throw new DonationRuleViolation('Unknown program', 'PROGRAMME_NOT_FOUND');
    if (programmeGate(f, p.slug).available) throw new ConflictException({ message: 'Giving to this program is open: give there directly', code: 'INTEREST_CHANNEL_OPEN' });
    return { kind: 'PROGRAMME' as const, programmeId: p.id, slug: p.slug };
  }

  private refuseClosed(gate: Gate, intentType: DonationIntentType) {
    if (gate.available) return;
    // 409: the channel exists but is not open (agreement, SDI form or confirmation missing) — never a payment path.
    throw new ConflictException({ message: 'This giving option is not open', code: 'GIVING_CHANNEL_DISABLED', details: { intentType, reason: gate.reason } });
  }

  async createIntent(input: CreateIntentInput, idempotencyKey: string | undefined) {
    if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException({ message: 'An Idempotency-Key header (16-80 chars, [A-Za-z0-9_-]) is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    if (input.currency !== 'USD') throw new DonationRuleViolation('SDI hosted forms accept USD only', 'CURRENCY_NOT_ACCEPTED');
    if (input.acceptTerms !== true) throw new BadRequestException({ message: 'Please confirm the terms', code: 'TERMS_REQUIRED' });
    const requestHash = createHash('sha256').update(canonical({ ...input, donor: { ...input.donor, email: input.donor.email.trim().toLowerCase() } })).digest('hex');
    const existing = await this.prisma.donation.findUnique({ where: { idempotencyKey }, include });
    if (existing) return this.replay(existing, requestHash);

    const r = await this.resolve(input);
    this.refuseClosed(r.gate, input.intentType);
    if (input.classification === 'ZAKAT') {
      const eligible = r.zakatTarget ? await this.zakat.isEligible(r.zakatTarget.type, r.zakatTarget.id) : false;
      const z = zakatGate(this.flags(), r.zakatTarget ? { eligible } : null);
      if (!z.allowed) throw new DonationRuleViolation('Zakat cannot be designated for this gift', 'ZAKAT_NOT_ALLOWED', { reason: z.reason });
    }
    const { amount } = await this.donationConfig.validateHostedAmount(input.amount);
    const name = input.donor.fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 120) throw new BadRequestException({ message: 'Enter your full name', code: 'NAME_INVALID' });
    this.tokenSecret(); // fail before writing anything if tokens cannot be issued
    const now = new Date();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const donor = await tx.donor.create({ data: { firstName: name, lastName: '', email: input.donor.email.trim().toLowerCase(), preferredLocale: input.locale ?? 'en', privacyConsentAt: now } });
          const d = await tx.donation.create({
            data: {
              reference: generateReference('DN'),
              accessTokenHash: '0'.repeat(64),
              idempotencyKey,
              idempotencyRequestHash: requestHash,
              donorId: donor.id,
              amount: D(amount),
              currency: 'USD',
              frequency: 'ONE_TIME',
              provider: HOSTED_PROVIDER,
              isTest: this.config.get('NODE_ENV') !== 'production',
              locale: input.locale ?? 'en',
              source: 'hosted-intent',
              sourceEventId: r.sourceEventId,
              intentType: input.intentType,
              charitableClassification: input.classification,
              reconciliationStatus: 'AWAITING_REPORT',
              allocationStatus: 'PENDING_AUTHORIZATION',
              payoutStatus: 'NOT_REPORTED',
              ...(r.interest ? { interestKind: r.interest.kind, interestProgrammeId: r.interest.programmeId, destinationDisclosureAcceptedAt: now, destinationDisclosureVersion: GALA_ONLY_DISCLOSURE_VERSION } : {}),
              allocations: { create: [{ designation: r.allocation.designation, programmeId: r.allocation.programmeId, projectId: r.allocation.projectId, amount: D(amount), currency: 'USD' }] },
            },
          });
          await tx.donation.update({ where: { id: d.id }, data: { accessTokenHash: createHash('sha256').update(this.tokenFor(d.id)).digest('hex') } });
          // The donor's ORIGINAL choice, in the append-only audit log (the columns are also immutable by trigger).
          await this.audit.record(null, 'giving.intent.create', 'Donation', d.id, { reference: d.reference, intentType: input.intentType, classification: input.classification, amount, currency: 'USD', designation: r.allocation.designation, programmeSlug: input.programmeSlug ?? null, eventSlug: input.eventSlug ?? null, ...(r.interest ? { sourceInterest: r.interest.kind === 'GENERAL' ? 'general' : r.interest.slug, destinationDisclosureAccepted: true, disclosureVersion: GALA_ONLY_DISCLOSURE_VERSION } : {}) }, tx);
          return tx.donation.findUniqueOrThrow({ where: { id: d.id }, include });
        });
        this.logger.log(`giving.intent_created ref=${created.reference} type=${input.intentType} class=${input.classification} test=${created.isTest}`);
        return this.createdView(created, r.gate);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const raced = await this.prisma.donation.findUnique({ where: { idempotencyKey }, include });
          if (raced) return this.replay(raced, requestHash);
          continue; // reference collision (astronomically unlikely): retry with a new reference
        }
        throw e;
      }
    }
    throw new ConflictException({ message: 'Could not allocate a unique reference, please retry', code: 'REFERENCE_COLLISION' });
  }

  private async replay(d: IntentRow, requestHash: string) {
    if (!d.intentType) throw new ConflictException({ message: 'This Idempotency-Key was used for another request', code: 'IDEMPOTENCY_KEY_REUSED' });
    if (d.idempotencyRequestHash !== requestHash) throw new ConflictException({ message: 'This Idempotency-Key was used with different data', code: 'IDEMPOTENCY_KEY_REUSED' });
    const r = await this.resolve({ intentType: d.intentType as DonationIntentType, programmeSlug: d.allocations[0]?.programme?.slug, eventSlug: d.intentType === 'GALA_DONATION' ? (await this.eventSlug(d.sourceEventId)) : undefined } as CreateIntentInput).catch(() => null); // interest is already recorded; no re-check
    return this.createdView(d, r?.gate ?? { available: false, reason: null, formUrl: null });
  }

  private async eventSlug(id: string | null) {
    return id ? ((await this.prisma.event.findUnique({ where: { id }, select: { slug: true } }))?.slug ?? undefined) : undefined;
  }

  private designationOf(d: IntentRow, locale: 'en' | 'ar' = 'en') {
    const a = d.allocations[0];
    const pick = (en?: string | null, ar?: string | null) => (locale === 'ar' ? ar || en : en) ?? null;
    if (!a) return { type: null, name: null, slug: null };
    if (a.designation === 'PROGRAMME') return { type: 'PROGRAMME' as const, name: pick(a.programme?.nameEn, a.programme?.nameAr), slug: a.programme?.slug ?? null };
    if (a.designation === 'PROJECT') return { type: 'PROJECT' as const, name: pick(a.project?.nameEn, a.project?.nameAr), slug: null };
    return { type: 'GENERAL_FUND' as const, name: null, slug: null };
  }

  /** Phase 14B: the option the donor started from (kept apart from the actual destination). */
  private interestOf(d: IntentRow, locale: 'en' | 'ar' = 'en') {
    if (!d.interestKind) return null;
    const p = d.interestProgramme;
    return { kind: d.interestKind as 'PROGRAMME' | 'GENERAL', slug: p?.slug ?? null, name: p ? (locale === 'ar' ? p.nameAr || p.nameEn : p.nameEn) : null, acceptedAt: d.destinationDisclosureAcceptedAt, disclosureVersion: d.destinationDisclosureVersion };
  }

  private createdView(d: IntentRow, gate: Gate) {
    const designation = this.designationOf(d);
    const q = this.questions();
    const classification = d.charitableClassification as Classification;
    return {
      reference: d.reference,
      accessToken: this.tokenFor(d.id),
      intentType: d.intentType,
      classification,
      amount: D(d.amount).toFixed(2),
      currency: d.currency,
      designation,
      interest: this.interestOf(d),
      stage: 'PENDING_EXTERNAL' as const,
      handoff: {
        /** the SDI-approved Zeffy form for THIS flow (never the Gala form for a programme or general gift) */
        formUrl: gate.available ? gate.formUrl : null,
        referenceQuestion: q.referenceQuestion,
        donationTypeQuestion: this.config.get('SDI_DONATION_TYPE_CONFIRMED') ? q.donationTypeQuestion : null,
        donationTypeAnswer: CLASSIFICATION_ANSWER[classification],
        designationAnswer: designation.name,
        /** no URL pre-fill is assumed: the donor types the reference into SDI's question */
        prefill: false as const,
      },
      createdAt: d.createdAt,
    };
  }

  // ───────────────────────── public: status ─────────────────────────

  async publicStatus(reference: string, token: string | undefined, locale: 'en' | 'ar' = 'en') {
    const notFound = new NotFoundException('Donation not found');
    if (!token || token.length > 128 || !DONATION_REF.test(reference)) throw notFound;
    const d = await this.prisma.donation.findUnique({ where: { reference }, include });
    if (!d || !d.intentType) throw notFound;
    const given = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
    const stored = Buffer.from(d.accessTokenHash, 'hex');
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) throw notFound;
    const stage = donorStage(d);
    return {
      reference: d.reference,
      intentType: d.intentType,
      classification: d.charitableClassification,
      /** the donor's INTENDED amount; the paid amount is what SDI's form charged */
      intendedAmount: D(d.amount).toFixed(2),
      currency: d.currency,
      designation: this.designationOf(d, locale),
      interest: this.interestOf(d, locale),
      stage,
      verifiedAt: stage === 'VERIFIED' || stage === 'ALLOCATED' ? d.reconciledAt : null,
      createdAt: d.createdAt,
      receiptsIssuedBy: 'SDI_ZEFFY' as const,
    };
  }

  // ───────────────────────── admin ─────────────────────────

  async adminList(q: { page: number; pageSize: number; intentType?: string; classification?: string; reconciliationStatus?: string; allocationStatus?: string; search?: string; includeTest?: boolean }, showDonor: boolean) {
    const s = q.search?.trim();
    const where: Prisma.DonationWhereInput = {
      intentType: q.intentType ? (q.intentType as never) : { not: null },
      ...(q.classification ? { charitableClassification: q.classification as never } : {}),
      ...(q.reconciliationStatus ? { reconciliationStatus: q.reconciliationStatus as never } : {}),
      ...(q.allocationStatus ? { allocationStatus: q.allocationStatus as never } : {}),
      ...(q.includeTest ? {} : { isTest: false }),
      ...(s ? { OR: [{ reference: { contains: s.toUpperCase() } }, { externalPaymentId: { contains: s } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.donation.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.donation.count({ where }),
    ]);
    return Paginated.of(items.map((d) => this.adminView(d, showDonor)), total, q.page, q.pageSize);
  }

  private adminView(d: IntentRow, showDonor: boolean) {
    return {
      id: d.id,
      reference: d.reference,
      intentType: d.intentType,
      classification: d.charitableClassification,
      amount: D(d.amount).toFixed(2),
      reportedAmount: d.reportedAmount === null ? null : D(d.reportedAmount).toFixed(2),
      currency: d.currency,
      designation: this.designationOf(d),
      interest: this.interestOf(d),
      paymentStatus: d.paymentStatus,
      reconciliationStatus: d.reconciliationStatus,
      stage: donorStage(d),
      allocationStatus: d.allocationStatus,
      authorizedFund: d.authorizedFund,
      allocationDecidedAt: d.allocationDecidedAt,
      payoutStatus: d.payoutStatus,
      externalPaymentId: d.externalPaymentId,
      reconciledReportId: d.reconciledReportId,
      reconciledReportRow: d.reconciledReportRow,
      reconciledAt: d.reconciledAt,
      isTest: d.isTest,
      createdAt: d.createdAt,
      /** personal data only with donors.read (least privilege) */
      donor: showDonor && !d.donor.anonymizedAt ? { name: `${d.donor.firstName} ${d.donor.lastName}`.trim(), email: d.donor.email } : null,
    };
  }

  async adminDetail(id: string, showDonor: boolean) {
    const d = await this.prisma.donation.findUnique({ where: { id }, include });
    if (!d || !d.intentType) throw new NotFoundException('Donation intent not found');
    const [rows, payment, history] = await Promise.all([
      this.prisma.providerReportRow.findMany({ where: { OR: [{ donationId: d.id }, { donationReference: d.reference }] }, orderBy: { createdAt: 'desc' }, take: 50, include: { import: { select: { id: true, fileName: true, status: true, appliedAt: true, approvedById: true, isSynthetic: true, fileSha256: true } } } }),
      d.externalPaymentId ? this.prisma.providerPayment.findFirst({ where: { matchedEntityType: 'Donation', matchedEntityId: d.id } }) : null,
      this.prisma.auditLog.findMany({ where: { entityType: 'Donation', entityId: d.id }, orderBy: { createdAt: 'asc' }, select: { action: true, createdAt: true, actorId: true, metadata: true } }),
    ]);
    return {
      ...this.adminView(d, showDonor),
      evidence: {
        reportRows: rows.map((r) => ({ importId: r.importId, fileName: r.import.fileName, importStatus: r.import.status, synthetic: r.import.isSynthetic, fileSha256: r.import.fileSha256, rowNumber: r.rowNumber, sourceOrderId: r.sourceOrderId, amount: r.amount?.toFixed(2) ?? null, currency: r.currency, status: r.status, donationType: r.donationType, donationTypeRaw: r.donationTypeRaw, designationRaw: r.designationRaw, matchStatus: r.matchStatus, matchNote: r.matchNote, applied: r.applied, appliedAt: r.appliedAt })),
        providerPayment: payment ? { provider: payment.provider, orderId: payment.providerPaymentId, status: payment.status, amount: D(payment.amount).toFixed(2), matchStatus: payment.matchStatus, matchReason: payment.matchReason } : null,
      },
      history: history.map((h) => ({ action: h.action, at: h.createdAt, actorId: h.actorId, metadata: h.metadata })),
    };
  }

  /** Verified totals per intent type × classification (USD, test excluded). Ticket revenue is reported separately (SDI status). */
  async summary() {
    const grouped = await this.prisma.donation.groupBy({
      by: ['intentType', 'charitableClassification', 'reconciliationStatus', 'allocationStatus'],
      where: { intentType: { not: null }, isTest: false, currency: 'USD' },
      _count: { _all: true },
      _sum: { amount: true, reportedAmount: true },
    });
    return {
      currency: 'USD',
      note: 'Intended amounts are what donors chose on MEKI; verified amounts are what SDI reported. Ticket revenue is never included.',
      rows: grouped.map((g) => ({
        intentType: g.intentType,
        classification: g.charitableClassification,
        reconciliationStatus: g.reconciliationStatus,
        allocationStatus: g.allocationStatus,
        count: g._count._all,
        intendedAmount: D(g._sum.amount ?? 0).toFixed(2),
        verifiedAmount: g.reconciliationStatus === 'VERIFIED' ? D(g._sum.reportedAmount ?? 0).toFixed(2) : '0.00',
      })),
    };
  }

  /**
   * Fund-allocation authorization — separate from payment verification. Only a VERIFIED, PAID intent; decided by an
   * administrator who did NOT approve the SDI report that verified it (four eyes across the two steps). Decided once.
   */
  async decideAllocation(id: string, input: { decision: 'AUTHORIZE' | 'REJECT'; fund?: string; note: string }, actor: ActorContext) {
    const d = await this.prisma.donation.findUnique({ where: { id } });
    if (!d || !d.intentType) throw new NotFoundException('Donation intent not found');
    if (d.reconciliationStatus !== 'VERIFIED' || d.paymentStatus !== 'PAID') throw new UnprocessableEntityException({ message: 'Only a payment verified by an approved SDI report can be allocated', code: 'ALLOCATION_NOT_VERIFIED' });
    if (d.allocationStatus !== 'PENDING_AUTHORIZATION') throw new ConflictException({ message: `Allocation already ${d.allocationStatus}`, code: 'ALLOCATION_DECIDED' });
    const report = d.reconciledReportId ? await this.prisma.providerReportImport.findUnique({ where: { id: d.reconciledReportId }, select: { approvedById: true } }) : null;
    const manual = await this.prisma.manualPaymentEvidence.findFirst({ where: { targetType: 'Donation', targetId: id, status: 'APPROVED' }, select: { decidedById: true } });
    if (manual?.decidedById === actor.userId) throw new ForbiddenException('The payment approver cannot also authorize allocation');
    if (report?.approvedById === actor.userId) throw new ForbiddenException({ message: 'The administrator who approved the SDI report cannot also authorize the allocation (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    const fund = input.fund?.trim();
    if (input.decision === 'AUTHORIZE' && (!fund || fund.length < 3)) throw new BadRequestException({ message: 'Enter the authorized fund / destination', code: 'FUND_REQUIRED' });
    const updated = await this.prisma.donation.update({
      where: { id },
      data: { allocationStatus: input.decision === 'AUTHORIZE' ? 'AUTHORIZED' : 'REJECTED', authorizedFund: input.decision === 'AUTHORIZE' ? fund!.slice(0, 160) : null, allocationDecidedById: actor.userId, allocationDecidedAt: new Date(), allocationNote: input.note.trim().slice(0, 500) },
    });
    await this.audit.record(actor, input.decision === 'AUTHORIZE' ? 'giving.allocation.authorize' : 'giving.allocation.reject', 'Donation', id, { reference: d.reference, fund: updated.authorizedFund, classification: d.charitableClassification });
    return this.adminDetail(id, false);
  }
}
