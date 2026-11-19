import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupApp } from './setup-app';

async function bootstrap() {
  const level = process.env.LOG_LEVEL;
  const logLevels: ('error' | 'warn' | 'log')[] = level === 'error' ? ['error'] : level === 'warn' ? ['error', 'warn'] : ['error', 'warn', 'log'];
  // Phase 9A: LOG_FORMAT=json emits one JSON object per line (for log collectors); messages are already sanitised at the source.
  const logger = process.env.LOG_FORMAT === 'json' ? new ConsoleLogger({ json: true, logLevels, colors: false }) : logLevels;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true, // webhook signatures are verified on the exact raw bytes
    logger,
  });
  setupApp(app);
  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);
  Logger.log(`MEKI API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
