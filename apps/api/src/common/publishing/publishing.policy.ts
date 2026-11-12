import { Global, Injectable, Module, UnprocessableEntityException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import type { Provenance } from '../../generated/prisma/enums';

export class PublishRuleViolation extends UnprocessableEntityException {
  constructor(message: string, code = 'PUBLISH_RULE_VIOLATION', details?: unknown) {
    super({ message, code, details });
  }
}

/**
 * Central rules for anything that becomes publicly visible.
 *  - DEMO content is never publishable in production; on staging only with ALLOW_DEMO_PUBLISH=true.
 *  - Money collection requires env PAYMENTS_ENABLED + approved provider AND DonationSetting.paymentsEnabled.
 */
@Injectable()
export class PublishingPolicy {
  constructor(private readonly config: AppConfigService) {}

  assertProvenancePublishable(provenance: Provenance) {
    if (provenance !== 'DEMO') return;
    if (this.config.isProduction || !this.config.get('ALLOW_DEMO_PUBLISH')) {
      throw new PublishRuleViolation('DEMO content cannot be published', 'DEMO_NOT_PUBLISHABLE');
    }
  }

  assertRequired(fields: Record<string, unknown>) {
    const missing = Object.entries(fields)
      .filter(([, v]) => v === null || v === undefined || (typeof v === 'string' && v.trim() === ''))
      .map(([k]) => k);
    if (missing.length) throw new PublishRuleViolation('Required fields are missing for publication', 'MISSING_FIELDS', { missing });
  }

  get paymentsEnvEnabled() {
    return this.config.paymentsEnvEnabled;
  }
}

@Global()
@Module({ providers: [PublishingPolicy], exports: [PublishingPolicy] })
export class PublishingModule {}
