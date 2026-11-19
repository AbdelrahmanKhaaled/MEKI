import { INestApplication, Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor, requestIdMiddleware, ResponseEnvelopeInterceptor } from './common/interceptors';

export const API_PREFIX = 'api';

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MEKI API')
    .setDescription(
      'MEKI core backend. Public endpoints (`/api/v1/public/*`) serve only published, non-demo content. ' +
        'Admin endpoints (`/api/v1/admin/*`) require the HttpOnly session cookie and, for mutations, the `X-CSRF-Token` header. ' +
        'Responses: `{ data }` or `{ data, meta }`; errors: `{ error: { statusCode, code, message, details? } }`.',
    )
    .setVersion('1.0')
    .addCookieAuth('meki_admin_sid')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Shared by main.ts and integration tests so both run the exact same pipeline. */
export function setupApp(app: NestExpressApplication) {
  const config = app.get(AppConfigService);

  // Proxy-aware client IPs (rate limiting, audit) only when explicitly configured — see parseTrustProxy.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // X-Booking-Token: the public booking pages (status, checkout, ticket PDF) send the purchaser token in this header (Phase 7 fix)
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'Idempotency-Key', 'X-Donation-Token', 'X-Booking-Token'],
    exposedHeaders: ['X-Request-Id'],
  });

  app.setGlobalPrefix(API_PREFIX, { exclude: [{ path: 'media/*path', method: RequestMethod.GET }] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseEnvelopeInterceptor());

  // Uploaded media is served by MediaFilesController (/media/*), which checks deletion and consent per request.

  if (config.get('SWAGGER_ENABLED') && !config.isProduction) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app), { jsonDocumentUrl: `${API_PREFIX}/docs-json` });
    Logger.log(`Swagger UI at /${API_PREFIX}/docs`, 'Bootstrap');
  }
  app.enableShutdownHooks();
  return app;
}
