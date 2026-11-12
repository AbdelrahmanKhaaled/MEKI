import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupApp } from './setup-app';

async function bootstrap() {
  const level = process.env.LOG_LEVEL;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true, // webhook signatures are verified on the exact raw bytes
    logger: level === 'error' ? ['error'] : level === 'warn' ? ['error', 'warn'] : ['error', 'warn', 'log'],
  });
  setupApp(app);
  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);
  Logger.log(`MEKI API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
