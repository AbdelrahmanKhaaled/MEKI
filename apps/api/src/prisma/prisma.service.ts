import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { AppConfigService } from '../config/app-config.service';

/**
 * Phase 13A — connection-pool defaults for real deployments. The MariaDB driver's defaults (connectTimeout 1 s, acquireTimeout
 * 10 s) were measured to stall the API on staging: when a burst forces the pool to open several connections at once, handshakes
 * (MySQL 8 caching_sha2 auth, and TLS to a managed database) exceed 1 s, fail on the client while completing on the server, and
 * every waiting request then sits until the 10 s acquire timeout (30 concurrent requests: 10.7 s → 1.5 s with these defaults).
 * Values already present in DATABASE_URL always win; nothing else about the connection string is changed.
 */
export const POOL_DEFAULTS: Readonly<Record<string, string>> = { connectTimeout: '10000', acquireTimeout: '20000' };

export function withPoolDefaults(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl; // let the driver report a malformed URL exactly as before
  }
  for (const [k, v] of Object.entries(POOL_DEFAULTS)) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({ adapter: new PrismaMariaDb(withPoolDefaults(config.get('DATABASE_URL'))) });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
