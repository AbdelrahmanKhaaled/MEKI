import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppConfigService } from '../../config/app-config.service';
import type { ComposedEmail } from './gala-email.composer';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Thrown by a transport that cannot deliver because no provider is configured (job is parked as SKIPPED, not failed). */
export class MailNotConfiguredError extends Error {}

/**
 * Port for outbound e-mail. NO commercial provider is chosen or implemented: a real adapter (SMTP / API provider,
 * approved by MEKI) implements this interface and is bound to MAIL_TRANSPORT. Until then only the transports below exist.
 */
export interface MailTransport {
  readonly name: string;
  /** false = messages cannot be delivered; jobs are parked, nothing is claimed as sent */
  readonly delivers: boolean;
  send(message: ComposedEmail): Promise<void>;
}

/** Default: no provider. Delivery is impossible and says so. */
@Injectable()
export class NoMailTransport implements MailTransport {
  readonly name = 'none';
  readonly delivers = false;
  async send(): Promise<void> {
    throw new MailNotConfiguredError('No e-mail provider is configured (MAIL_TRANSPORT=none)');
  }
}

/**
 * DEVELOPMENT ONLY: writes each message to MAIL_DEV_OUTBOX_DIR as JSON (+ attachments as files) so templates and PDFs can be
 * inspected locally. Nothing leaves the machine. Env validation forbids it in staging/production.
 */
@Injectable()
export class DevFileMailTransport implements MailTransport {
  readonly name = 'dev-file';
  readonly delivers = true;
  private readonly logger = new Logger('DevMailOutbox');
  private readonly dir: string;

  constructor(config: AppConfigService) {
    this.dir = resolve(config.get('MAIL_DEV_OUTBOX_DIR'));
  }

  async send(m: ComposedEmail): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const id = createHash('sha256').update(`${Date.now()}${m.to}${m.subject}${Math.random()}`).digest('hex').slice(0, 16);
    const attachments: string[] = [];
    for (const [i, a] of m.attachments.entries()) {
      const file = `${id}-${i}-${a.filename.replace(/[^A-Za-z0-9._-]/g, '_')}`;
      await writeFile(resolve(this.dir, file), a.content);
      attachments.push(file);
    }
    await writeFile(resolve(this.dir, `${id}.json`), JSON.stringify({ to: m.to, subject: m.subject, locale: m.locale, text: m.text, html: m.html, attachments }, null, 2));
    this.logger.log(`dev outbox message ${id} written (not sent)`); // no recipient / content in logs
  }
}

/** TEST ONLY: captures messages in memory; `failNext` injects delivery failures to exercise retries. */
@Injectable()
export class MemoryMailTransport implements MailTransport {
  readonly name = 'memory';
  readonly delivers = true;
  readonly sent: ComposedEmail[] = [];
  failNext = 0;
  failMessage = 'simulated provider outage';

  async send(m: ComposedEmail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error(this.failMessage);
    }
    this.sent.push(m);
  }
}

export function createMailTransport(config: AppConfigService): MailTransport {
  switch (config.get('MAIL_TRANSPORT')) {
    case 'dev-file':
      return new DevFileMailTransport(config);
    case 'memory':
      return new MemoryMailTransport();
    default:
      return new NoMailTransport();
  }
}
