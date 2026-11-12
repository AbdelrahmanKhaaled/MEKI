import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, StreamableFile } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { map, Observable, tap } from 'rxjs';
import type { AuthenticatedRequest } from '../types/auth-request';
import { Paginated } from '../utils';

/** Success envelope: { data } or { data, meta } for paginated lists. Empty (204) responses pass through. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (value instanceof StreamableFile || value === undefined) return value;
        if (value instanceof Paginated) return { data: value.items, meta: value.meta };
        return { data: value };
      }),
    );
  }
}

/** Access log line per request (never bodies, cookies or tokens). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const write = (status: number | string) =>
      this.logger.log(`${req.method} ${req.path} ${status} ${Date.now() - started}ms rid=${req.requestId ?? '-'} uid=${req.user?.id ?? '-'}`);
    return next.handle().pipe(tap({ next: () => write(res.statusCode), error: () => write('error') }));
  }
}

export function requestIdMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
