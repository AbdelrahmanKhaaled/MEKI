import { BadRequestException, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { Campaign, Currency, Programme } from '../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.module';
import { D, decimalPlaces, formatAmount } from './money';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import type { PaymentProviderAdapter } from './payments/payment-provider';
import type { CreateDonationDto } from './donations.dto';

export class DonationRuleViolation extends UnprocessableEntityException {
  constructor(message: string, code: string, details?: unknown) {
    super({ message, code, details });
  }
}

export interface ResolvedDesignation {
  designation: 'GENERAL_FUND' | 'CAMPAIGN' | 'PROGRAMME';
  campaign: Campaign | null;
  programme: Programme | null;
}

/** Currency rules, donation configuration, payment availability and campaign/programme eligibility. */
@Injectable()
export class DonationConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Phase 12B — giving scope under the SDI agreement. The current agreement covers the Gala campaign for ONE approved project
   * only (SDI's hosted Gala forms). General/campaign and programme-restricted donations need a separate written agreement, so
   * MEKI-native designations are refused unless the matching *_GIVING_AUTHORIZED switch records that agreement.
   */
  authorizedDesignations(): ('GENERAL_FUND' | 'CAMPAIGN' | 'PROGRAMME')[] {
    const general = this.config.get('GENERAL_GIVING_AUTHORIZED');
    const programme = this.config.get('PROGRAMME_GIVING_AUTHORIZED');
    return [...(general ? (['GENERAL_FUND', 'CAMPAIGN'] as const) : []), ...(programme ? (['PROGRAMME'] as const) : [])];
  }

  private assertDesignationAuthorized(designation: 'GENERAL_FUND' | 'CAMPAIGN' | 'PROGRAMME') {
    if (!this.authorizedDesignations().includes(designation)) {
      throw new DonationRuleViolation(
        designation === 'PROGRAMME'
          ? 'Donations restricted to an individual programme are not authorized under the current fiscal-sponsor agreement'
          : 'General donations are not authorized under the current fiscal-sponsor agreement',
        'DESIGNATION_NOT_AUTHORIZED',
        { designation },
      );
    }
  }

  async currencyMap(): Promise<Map<string, Currency>> {
    return new Map((await this.prisma.currency.findMany()).map((c) => [c.code, c]));
  }

  /** Minor units per currency (ISO 4217); defaults to 2 for unknown codes in historical data. */
  async minorUnitsFn() {
    const map = await this.currencyMap();
    return (code: string) => map.get(code)?.minorUnits ?? 2;
  }

  /** Effective availability: env + provider record + DonationSetting.paymentsEnabled + adapter present. */
  async availability(): Promise<{ available: boolean; adapter?: PaymentProviderAdapter }> {
    const donation = await this.settings.getDonation();
    const adapter = this.registry.active();
    return { available: donation.paymentsEffective && !!adapter, adapter: adapter ?? undefined };
  }

  async requireAdapter(): Promise<PaymentProviderAdapter> {
    const { available, adapter } = await this.availability();
    if (!available || !adapter) {
      throw new ServiceUnavailableException({ message: 'Online donations are not available yet', code: 'PAYMENTS_UNAVAILABLE' });
    }
    return adapter;
  }

  async publicConfig() {
    const [donation, currencies, provider] = await Promise.all([
      this.settings.getDonation(),
      this.prisma.currency.findMany({ where: { isEnabled: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      this.registry.active() ? this.prisma.paymentProvider.findUnique({ where: { code: this.registry.active()!.code } }) : null,
    ]);
    const { available } = await this.availability();
    const recurring = donation.allowRecurring && !!provider?.supportsRecurring && !!this.registry.active()?.capabilities.recurring;
    return {
      paymentsEnabled: available,
      /** true when the active provider is a test provider (mock): the UI must label payments as TEST */
      testMode: available && !!this.registry.active()?.isTest,
      defaultCurrency: donation.defaultCurrency,
      allowCustomAmount: donation.allowCustomAmount,
      frequencies: ['ONE_TIME', ...(recurring ? ['MONTHLY'] : [])],
      /** Phase 12B: only designations covered by a fiscal-sponsor agreement (see authorizedDesignations). */
      designations: this.authorizedDesignations(),
      amountFormat: 'decimal-string',
      currencies: currencies.map((c) => ({
        code: c.code,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        symbol: c.symbol,
        minorUnits: c.minorUnits,
        suggestedAmounts: ((c.suggestedAmounts as string[] | null) ?? []).map((a) => formatAmount(a, c.minorUnits)),
        minAmount: formatAmount(c.minAmount, c.minorUnits),
        maxAmount: formatAmount(c.maxAmount, c.minorUnits),
      })),
    };
  }

  /** Validates currency, precision, min/max and preset rules. Returns the normalised amount string. */
  async validateAmount(amount: string, currencyCode: string, campaign: Campaign | null, adapter: PaymentProviderAdapter): Promise<{ amount: string; currency: Currency }> {
    const currency = await this.prisma.currency.findUnique({ where: { code: currencyCode } });
    if (!currency || !currency.isEnabled) throw new DonationRuleViolation('Currency is not accepted', 'CURRENCY_NOT_ACCEPTED');
    if (adapter.capabilities.currencies && !adapter.capabilities.currencies.includes(currency.code)) {
      throw new DonationRuleViolation('Currency is not supported by the payment provider', 'CURRENCY_NOT_SUPPORTED');
    }
    const provider = await this.prisma.paymentProvider.findUnique({ where: { code: adapter.code } });
    const providerCurrencies = provider?.supportedCurrencies as string[] | null | undefined;
    if (providerCurrencies && !providerCurrencies.includes(currency.code)) {
      throw new DonationRuleViolation('Currency is not supported by the payment provider', 'CURRENCY_NOT_SUPPORTED');
    }
    if (decimalPlaces(amount) > currency.minorUnits) {
      throw new DonationRuleViolation(`${currency.code} amounts allow at most ${currency.minorUnits} decimal places`, 'INVALID_AMOUNT_PRECISION');
    }
    const value = D(amount);
    if (value.lte(0)) throw new DonationRuleViolation('Amount must be greater than zero', 'INVALID_AMOUNT');

    const donation = await this.settings.getDonation();
    const isDefault = currency.code === donation.defaultCurrency;
    const min = currency.minAmount ?? (isDefault ? donation.minAmount : null);
    const max = currency.maxAmount ?? (isDefault ? donation.maxAmount : null);
    const campaignMin = campaign?.minCustomAmount ?? null;
    const campaignMax = campaign?.maxCustomAmount ?? null;
    for (const [limit, kind] of [
      [min, 'min'],
      [campaignMin, 'min'],
      [max, 'max'],
      [campaignMax, 'max'],
    ] as const) {
      if (limit === null) continue;
      if (kind === 'min' && value.lt(limit)) throw new DonationRuleViolation(`Minimum donation is ${formatAmount(limit, currency.minorUnits)} ${currency.code}`, 'AMOUNT_BELOW_MINIMUM');
      if (kind === 'max' && value.gt(limit)) throw new DonationRuleViolation(`Maximum donation is ${formatAmount(limit, currency.minorUnits)} ${currency.code}`, 'AMOUNT_ABOVE_MAXIMUM');
    }

    const customAllowed = donation.allowCustomAmount && (campaign ? campaign.allowCustomAmount : true);
    if (!customAllowed) {
      const presets = ((campaign?.suggestedAmounts as (string | number)[] | null) ?? (currency.suggestedAmounts as (string | number)[] | null) ?? []).map((p) => D(p));
      if (!presets.some((p) => p.eq(value))) throw new DonationRuleViolation('Please choose one of the suggested amounts', 'CUSTOM_AMOUNT_NOT_ALLOWED');
    }
    return { amount: value.toFixed(currency.minorUnits), currency };
  }

  /**
   * Phase 14 — amount rules for a HOSTED donation intent (USD on SDI's Zeffy form). Same min/max sources as the legacy checkout
   * (currency row, then donation settings) but no MEKI payment adapter is involved: MEKI never charges this amount.
   */
  async validateHostedAmount(amount: string): Promise<{ amount: string; min: string | null; max: string | null }> {
    const currency = await this.prisma.currency.findUnique({ where: { code: 'USD' } });
    const minor = currency?.minorUnits ?? 2;
    if (decimalPlaces(amount) > minor) throw new DonationRuleViolation(`USD amounts allow at most ${minor} decimal places`, 'INVALID_AMOUNT_PRECISION');
    const value = D(amount);
    if (value.lte(0)) throw new DonationRuleViolation('Amount must be greater than zero', 'INVALID_AMOUNT');
    const donation = await this.settings.getDonation();
    const isDefault = donation.defaultCurrency === 'USD';
    const min = currency?.minAmount ?? (isDefault ? donation.minAmount : null);
    const max = currency?.maxAmount ?? (isDefault ? donation.maxAmount : null);
    if (min !== null && value.lt(min)) throw new DonationRuleViolation(`Minimum donation is ${formatAmount(min, minor)} USD`, 'AMOUNT_BELOW_MINIMUM');
    if (max !== null && value.gt(max)) throw new DonationRuleViolation(`Maximum donation is ${formatAmount(max, minor)} USD`, 'AMOUNT_ABOVE_MAXIMUM');
    return { amount: value.toFixed(minor), min: min === null ? null : formatAmount(min, minor), max: max === null ? null : formatAmount(max, minor) };
  }

  /** Phase 14 — public USD limits for the giving forms (display only; the server re-validates). */
  async hostedLimits() {
    const currency = await this.prisma.currency.findUnique({ where: { code: 'USD' } });
    const donation = await this.settings.getDonation();
    const minor = currency?.minorUnits ?? 2;
    const isDefault = donation.defaultCurrency === 'USD';
    const min = currency?.minAmount ?? (isDefault ? donation.minAmount : null);
    const max = currency?.maxAmount ?? (isDefault ? donation.maxAmount : null);
    const suggested = ((currency?.suggestedAmounts as string[] | null) ?? []).map((a) => formatAmount(a, minor));
    return { currency: 'USD' as const, min: min === null ? null : formatAmount(min, minor), max: max === null ? null : formatAmount(max, minor), suggested };
  }

  async assertRecurringAllowed(adapter: PaymentProviderAdapter) {
    const donation = await this.settings.getDonation();
    const provider = await this.prisma.paymentProvider.findUnique({ where: { code: adapter.code } });
    if (!donation.allowRecurring || !provider?.supportsRecurring || !adapter.capabilities.recurring) {
      throw new DonationRuleViolation('Monthly donations are not available', 'RECURRING_NOT_AVAILABLE');
    }
  }

  /**
   * Campaign donations require: PUBLISHED, recorded approval, not DEMO, not deleted, donationsOpen,
   * published programme, within its dates, and the donation currency = campaign currency.
   * Donation operations never modify the campaign.
   */
  async resolveDesignation(dto: Pick<CreateDonationDto, 'designation' | 'campaignSlug' | 'programmeSlug' | 'currency'>): Promise<ResolvedDesignation> {
    this.assertDesignationAuthorized(dto.designation);
    if (dto.designation === 'GENERAL_FUND') {
      if (dto.campaignSlug || dto.programmeSlug) throw new BadRequestException('GENERAL_FUND donations must not name a campaign or programme');
      return { designation: 'GENERAL_FUND', campaign: null, programme: null };
    }
    if (dto.designation === 'CAMPAIGN') {
      if (!dto.campaignSlug || dto.programmeSlug) throw new BadRequestException('CAMPAIGN donations require campaignSlug only');
      const now = new Date();
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          slug: dto.campaignSlug,
          deletedAt: null,
          status: 'PUBLISHED',
          approvedAt: { not: null },
          provenance: { not: 'DEMO' },
          donationsOpen: true,
          programme: { status: 'PUBLISHED', deletedAt: null },
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
      });
      if (!campaign) throw new DonationRuleViolation('This campaign is not accepting donations', 'CAMPAIGN_NOT_ACCEPTING_DONATIONS');
      if (campaign.currency !== dto.currency) {
        throw new DonationRuleViolation(`This campaign accepts ${campaign.currency} only`, 'CAMPAIGN_CURRENCY_MISMATCH', { currency: campaign.currency });
      }
      const programme = campaign.programmeId ? await this.prisma.programme.findUnique({ where: { id: campaign.programmeId } }) : null;
      return { designation: 'CAMPAIGN', campaign, programme };
    }
    if (!dto.programmeSlug || dto.campaignSlug) throw new BadRequestException('PROGRAMME donations require programmeSlug only');
    const programme = await this.prisma.programme.findFirst({
      where: { slug: dto.programmeSlug, deletedAt: null, status: 'PUBLISHED', kind: 'PROGRAMME', provenance: { not: 'DEMO' } },
    });
    if (!programme) throw new DonationRuleViolation('This programme is not accepting donations', 'PROGRAMME_NOT_ACCEPTING_DONATIONS');
    return { designation: 'PROGRAMME', campaign: null, programme };
  }
}
