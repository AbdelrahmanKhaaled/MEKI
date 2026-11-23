import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { createThrottlerStorage } from './common/rate-limit';
import { PrismaModule } from './prisma/prisma.module';
import { PublishingModule } from './common/publishing/publishing.policy';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CsrfGuard, PermissionsGuard, SessionAuthGuard } from './modules/auth/guards';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CmsModule } from './modules/cms/cms.module';
import { EventsModule } from './modules/events/events.module';
import { DonationsModule } from './modules/donations/donations.module';
import { GalaModule } from './modules/gala/gala.module';
import { ZeffyModule } from './modules/zeffy/zeffy.module';
import { SdiModule } from './modules/sdi/sdi.module';
import { ManualEvidenceModule } from './modules/sdi/manual-evidence.module';
import { FundraisingModule } from './modules/fundraising/fundraising.module';
import { GivingModule } from './modules/giving/giving.module';
import { FaqModule } from './modules/faq/faq.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { ProgrammesModule } from './modules/programmes/programmes.module';
import { PublicModule } from './modules/public/public.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { UsersModule } from './modules/users/users.module';
import { RevalidationModule } from './modules/revalidation/revalidation.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Global default: 300 requests/min per IP; login & password endpoints override with a strict limit.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage: createThrottlerStorage(config),
      }),
    }),
    PublishingModule,
    // CMS live publishing: invalidates the website cache after content mutations (interceptor + admin status/retry).
    RevalidationModule,
    AuditModule,
    AuthModule,
    UsersModule,
    MediaModule,
    SettingsModule,
    CmsModule,
    ProgrammesModule,
    CampaignsModule,
    StatisticsModule,
    FaqModule,
    EventsModule,
    DonationsModule,
    GalaModule,
    ZeffyModule,
    SdiModule,
    ManualEvidenceModule,
    FundraisingModule,
    GivingModule,
    PublicModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limit → session → CSRF → RBAC.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: SessionAuthGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AppModule {}
