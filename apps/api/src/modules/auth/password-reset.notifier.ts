import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export const PASSWORD_RESET_NOTIFIER = Symbol('PASSWORD_RESET_NOTIFIER');

export interface PasswordResetNotifier {
  send(email: string, token: string, expiresAt: Date): Promise<void>;
}

/**
 * Foundation only: no e-mail provider is configured yet (client dependency).
 * In development the token is written to the server log; in other environments it is never logged.
 */
@Injectable()
export class LogPasswordResetNotifier implements PasswordResetNotifier {
  private readonly logger = new Logger('PasswordReset');
  constructor(private readonly config: AppConfigService) {}

  async send(email: string, token: string, expiresAt: Date) {
    if (this.config.get('NODE_ENV') === 'development') {
      this.logger.warn(`[DEV ONLY] reset token for ${email}: ${token} (expires ${expiresAt.toISOString()})`);
    } else {
      this.logger.warn(`Password reset requested for an account, but no e-mail provider is configured.`);
    }
  }
}
