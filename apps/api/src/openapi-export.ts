/**
 * Writes the OpenAPI document to packages/api-client/openapi.json (input for the typed client).
 * Boots the compiled Nest app without listening (needs decorator metadata, so run from dist):
 *   pnpm --filter @meki/api openapi:export   (requires a reachable DATABASE_URL)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { buildOpenApiDocument, setupApp } from './setup-app';

async function main() {
  process.env.SWAGGER_ENABLED = 'false';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'], rawBody: true });
  setupApp(app);
  await app.init();
  const doc = buildOpenApiDocument(app);
  const out = resolve(__dirname, '../../../packages/api-client/openapi.json');
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`OpenAPI written to ${out} (${Object.keys(doc.paths).length} paths)`);
  await app.close();
}

void main();
