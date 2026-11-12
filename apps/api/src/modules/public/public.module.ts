import { Controller, Get, Header, Module, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators';
import { LocaleQueryDto } from '../../common/dto/shared.dto';
import { localize } from '../../common/utils/localize';
import { CampaignsService } from '../campaigns/campaigns.service';
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
  ) {}

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

@Module({ controllers: [PublicController] })
export class PublicModule {}
