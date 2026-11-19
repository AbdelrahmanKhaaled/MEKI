import { Controller, Get, Header, Module, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators';
import { LocaleQueryDto } from '../../common/dto/shared.dto';
import { localize } from '../../common/utils/localize';
import { CampaignsService } from '../campaigns/campaigns.service';
import { DonationsModule } from '../donations/donations.module';
import { AppConfigService } from '../../config/app-config.service';
import { parseProgrammeFormUrls } from '../../config/env.validation';
import { ProgrammeDetailService } from './programme-detail.service';
import { CmsService } from '../cms/cms.service';
import { FaqService } from '../faq/faq.module';
import { MediaService } from '../media/media.service';
import { ProgrammesService } from '../programmes/programmes.service';
import { SettingsService } from '../settings/settings.module';
import { StatisticsService } from '../statistics/statistics.module';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

class CampaignListQuery extends LocaleQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) featured?: string;
  @ApiPropertyOptional({ description: 'Programme slug' }) @IsOptional() @IsString() @MaxLength(100) programme?: string;
}
class FaqListQuery extends LocaleQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) category?: string;
}

/**
 * Read-only website API. Serves ONLY published, non-DEMO content; campaigns additionally require
 * a recorded approval; statistics additionally require VERIFIED. No authentication, cacheable.
 */
@ApiTags('Public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly settings: SettingsService,
    private readonly cms: CmsService,
    private readonly programmes: ProgrammesService,
    private readonly campaigns: CampaignsService,
    private readonly stats: StatisticsService,
    private readonly faq: FaqService,
    private readonly media: MediaService,
    private readonly programmeDetail: ProgrammeDetailService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Phase 12 — SDI hosted forms the public site may link to. Only SDI-approved Zeffy URLs from configuration, and only where the
   * matching switch is on. Programme giving additionally requires SDI to have confirmed how the designation is captured.
   */
  @Get('hosted-forms')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'SDI hosted-form availability: general giving, programme giving (per slug) — URLs only when enabled and SDI-approved' })
  async hostedForms() {
    const c = this.appConfig;
    const general = c.get('SDI_GENERAL_GIVING_ENABLED') && !!c.get('ZEFFY_DONATION_FORM_URL');
    const programmeOn = c.get('SDI_PROGRAMME_GIVING_ENABLED') && c.get('SDI_PROGRAMME_DESIGNATION_CONFIRMED');
    const urls = parseProgrammeFormUrls(c.get('SDI_PROGRAMME_FORM_URLS'));
    const programmes = (await this.programmes.listPublished()).filter((p) => p.kind === 'PROGRAMME');
    return {
      mode: 'sdi_hosted_forms',
      general: { available: general, url: general ? c.get('ZEFFY_DONATION_FORM_URL') : null },
      programmeDesignationConfirmed: c.get('SDI_PROGRAMME_DESIGNATION_CONFIRMED'),
      programmes: programmes.map((p) => ({ slug: p.slug, code: p.code, available: programmeOn && !!urls[p.slug], url: programmeOn && urls[p.slug] ? urls[p.slug] : null })),
    };
  }

  private async siteView() {
    const s = await this.settings.getSite();
    return {
      orgNameEn: s.orgNameEn,
      orgNameAr: s.orgNameAr,
      taglineEn: s.taglineEn,
      taglineAr: s.taglineAr,
      legacyLineEn: s.legacyLineEn,
      legacyLineAr: s.legacyLineAr,
      logos: { primary: s.logoPrimaryUrl, inverse: s.logoInverseUrl, icon: s.logoIconUrl },
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      addressEn: s.addressEn,
      addressAr: s.addressAr,
      socialLinks: s.socialLinks ?? [],
      defaultLocale: s.defaultLocale,
      supportedLocales: s.supportedLocales,
      footerTextEn: s.footerTextEn,
      footerTextAr: s.footerTextAr,
      footerNoteEn: s.footerNoteEn,
      footerNoteAr: s.footerNoteAr,
      copyrightEn: s.copyrightEn,
      copyrightAr: s.copyrightAr,
      seoTitleEn: s.seoTitleEn,
      seoTitleAr: s.seoTitleAr,
      seoDescriptionEn: s.seoDescriptionEn,
      seoDescriptionAr: s.seoDescriptionAr,
      ogImageUrl: s.ogImage && !s.ogImage.deletedAt ? s.ogImage.url : null,
    };
  }

  private async donationView() {
    const d = await this.settings.getDonation();
    return {
      defaultCurrency: d.defaultCurrency,
      displayCurrencies: d.displayCurrencies,
      suggestedAmounts: d.suggestedAmounts,
      allowCustomAmount: d.allowCustomAmount,
      minAmount: d.minAmount,
      maxAmount: d.maxAmount,
      allowOneTime: d.allowOneTime,
      allowRecurring: d.allowRecurring,
      paymentsEnabled: d.paymentsEffective,
      previewNoticeEn: d.previewNoticeEn,
      previewNoticeAr: d.previewNoticeAr,
    };
  }

  @Get('site')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Public site settings (organisation, logos, contact, social, footer, SEO) + donation config' })
  async site(@Query() q: LocaleQueryDto) {
    return localize({ ...(await this.siteView()), donation: await this.donationView() }, q.locale);
  }

  @Get('donation-config')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Donation configuration. paymentsEnabled=false until a provider is approved.' })
  async donationConfig(@Query() q: LocaleQueryDto) {
    return localize(await this.donationView(), q.locale);
  }

  @Get('home')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Everything the landing page needs in one call' })
  async home(@Query() q: LocaleQueryDto) {
    const [site, donation, page, programmes, campaigns, statistics, faqs] = await Promise.all([
      this.siteView(),
      this.donationView(),
      this.cms.getPublishedPage('home'),
      this.programmes.listPublished(),
      this.campaigns.listPublished({}),
      this.stats.listPublished(),
      this.faq.listPublished(),
    ]);
    return localize({ site, donation, page, programmes, campaigns, statistics, faqs }, q.locale);
  }

  @Get('pages/:slug')
  @Header('Cache-Control', CACHE)
  async page(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.cms.getPublishedPage(slug), q.locale);
  }

  @Get('programmes')
  @Header('Cache-Control', CACHE)
  async listProgrammes(@Query() q: LocaleQueryDto) {
    return localize(await this.programmes.listPublished(), q.locale);
  }

  /**
   * Phase 11A: the single programme page in one response — programme, approved goal + verified fundraising summary, published
   * causes with their approved campaigns, verified programme statistics and the consent-filtered gallery. 404 unless PUBLISHED
   * and not DEMO. Declared before programmes/:slug so the more specific route wins.
   */
  @Get('programmes/:slug/detail')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Programme page: approved goal, verified collected totals (per currency), published causes and campaigns' })
  async programmePage(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.programmeDetail.detail(slug), q.locale);
  }

  @Get('programmes/:slug')
  @Header('Cache-Control', CACHE)
  async programme(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.programmes.getPublishedBySlug(slug), q.locale);
  }

  @Get('campaigns')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Approved, published campaigns only (empty until MEKI approves campaigns)' })
  async listCampaigns(@Query() q: CampaignListQuery) {
    return localize(await this.campaigns.listPublished({ featured: q.featured === 'true', programmeSlug: q.programme }), q.locale);
  }

  @Get('campaigns/:slug')
  @Header('Cache-Control', CACHE)
  async campaign(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.campaigns.getPublishedBySlug(slug), q.locale);
  }

  @Get('statistics')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Published AND verified impact statistics with attribution' })
  async statistics(@Query() q: LocaleQueryDto) {
    return localize(await this.stats.listPublished(), q.locale);
  }

  @Get('faqs')
  @Header('Cache-Control', CACHE)
  async faqs(@Query() q: FaqListQuery) {
    return localize(await this.faq.listPublished(q.category), q.locale);
  }
}

@Module({ imports: [DonationsModule], controllers: [PublicController], providers: [ProgrammeDetailService] })
export class PublicModule {}
