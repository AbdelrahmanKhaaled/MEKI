import { Body, Controller, Get, Global, Injectable, Module, NotFoundException, Patch, UnprocessableEntityException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { PublishingPolicy } from '../../common/publishing/publishing.policy';
import { Actor, RequirePermissions } from '../../common/decorators';
import type { ActorContext } from '../../common/types/auth-request';
import { defined } from '../../common/utils';
import { UpdateDonationSettingsDto, UpdateSiteSettingsDto } from './settings.dto';

export const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly policy: PublishingPolicy,
    private readonly config: AppConfigService,
  ) {}

  async getSite() {
    const s = await this.prisma.siteSetting.findUnique({ where: { id: SETTINGS_ID }, include: { ogImage: true } });
    if (!s) throw new NotFoundException('Site settings have not been initialised (run the seed)');
    return { ...s, ogImage: this.media.present(s.ogImage) };
  }

  async updateSite(dto: UpdateSiteSettingsDto, actor: ActorContext) {
    await this.getSite();
    await this.media.assertExists([dto.ogImageId]);
    const { socialLinks, ...rest } = dto;
    await this.prisma.siteSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        ...defined(rest),
        ...(socialLinks ? { socialLinks: socialLinks as unknown as Prisma.InputJsonValue } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'settings.site_update', 'SiteSetting', SETTINGS_ID, { fields: AuditService.changedFields(dto) });
    return this.getSite();
  }

  /**
   * Payments are effective only when ALL hold: server env enables payments with an implemented provider,
   * and an admin has enabled that provider record. DonationSetting.paymentsEnabled is checked by the caller.
   */
  async providerActivated(): Promise<boolean> {
    const code = this.config.get('PAYMENT_PROVIDER');
    if (!this.policy.paymentsEnvEnabled || !code) return false;
    const provider = await this.prisma.paymentProvider.findUnique({ where: { code } });
    return !!provider?.isEnabled;
  }

  async getDonation() {
    const d = await this.prisma.donationSetting.findUnique({ where: { id: SETTINGS_ID } });
    if (!d) throw new NotFoundException('Donation settings have not been initialised (run the seed)');
    return { ...d, paymentsEffective: d.paymentsEnabled && (await this.providerActivated()) };
  }

  async updateDonation(dto: UpdateDonationSettingsDto, actor: ActorContext) {
    const current = await this.getDonation();
    if (dto.paymentsEnabled === true && !this.policy.paymentsEnvEnabled) {
      throw new UnprocessableEntityException({
        message: 'Payments cannot be enabled: no approved payment provider is configured on the server',
        code: 'PAYMENTS_NOT_CONFIGURED',
      });
    }
    const min = dto.minAmount ?? current.minAmount?.toNumber();
    const max = dto.maxAmount ?? current.maxAmount?.toNumber();
    if (min !== undefined && max !== undefined && min > max) throw new UnprocessableEntityException('minAmount must not exceed maxAmount');
    const currencies = dto.displayCurrencies ?? (current.displayCurrencies as string[]);
    const def = dto.defaultCurrency ?? current.defaultCurrency;
    if (!currencies.includes(def)) throw new UnprocessableEntityException('defaultCurrency must be one of displayCurrencies');

    const { displayCurrencies, suggestedAmounts, ...rest } = dto;
    await this.prisma.donationSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        ...defined(rest),
        ...(displayCurrencies ? { displayCurrencies } : {}),
        ...(suggestedAmounts ? { suggestedAmounts: [...suggestedAmounts].sort((a, b) => a - b) } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'settings.donation_update', 'DonationSetting', SETTINGS_ID, {
      fields: AuditService.changedFields(dto),
      paymentsEnabled: dto.paymentsEnabled,
    });
    return this.getDonation();
  }
}

@ApiTags('Admin · Settings')
@ApiCookieAuth()
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('site')
  @RequirePermissions('settings.read')
  getSite() {
    return this.settings.getSite();
  }

  @Patch('site')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update organisation info, logos, contacts, social links, footer and SEO metadata' })
  updateSite(@Body() dto: UpdateSiteSettingsDto, @Actor() actor: ActorContext) {
    return this.settings.updateSite(dto, actor);
  }

  @Get('donation')
  @RequirePermissions('settings.read')
  getDonation() {
    return this.settings.getDonation();
  }

  @Patch('donation')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update donation configuration. paymentsEnabled is refused until a provider is approved and configured.' })
  updateDonation(@Body() dto: UpdateDonationSettingsDto, @Actor() actor: ActorContext) {
    return this.settings.updateDonation(dto, actor);
  }
}

@Global()
@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
