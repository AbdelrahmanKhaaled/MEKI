import { CallHandler, Controller, ExecutionContext, Get, Global, HttpCode, Injectable, Module, NestInterceptor, Post, Query, SetMetadata } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { Request, Response } from 'express';
import { mergeMap, type Observable } from 'rxjs';
import { RequirePermissions } from '../../common/decorators';
import { RevalidationService } from './revalidation.service';
import type { PublicScope } from './revalidation.tags';

export const REVALIDATES_KEY = 'revalidatesPublic';
/** Response header carrying the outcome to the admin: revalidated | pending | disabled. */
export const REVALIDATION_HEADER = 'X-Meki-Revalidation';

/**
 * Marks an admin route (or a whole controller) whose successful MUTATIONS change public website content. After the handler
 * has committed, the website caches for these scopes are invalidated. GET requests and failed requests never trigger anything.
 * `@RevalidatesPublic()` with no scope on a method opts it out of a controller-level scope.
 */
export const RevalidatesPublic = (...scopes: PublicScope[]) => SetMetadata(REVALIDATES_KEY, scopes);

@Injectable()
export class RevalidationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly revalidation: RevalidationService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const scopes = this.reflector.getAllAndOverride<PublicScope[] | undefined>(REVALIDATES_KEY, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!scopes?.length || req.method === 'GET' || req.method === 'HEAD') return next.handle();
    const res = ctx.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      mergeMap(async (value) => {
        // The mutation has succeeded (and committed) at this point; the refresh outcome never changes its status code.
        const tags = await this.revalidation.tagsFor(scopes, req.params as Record<string, string>);
        const outcome = await this.revalidation.revalidate(tags);
        if (!res.headersSent) res.setHeader(REVALIDATION_HEADER, outcome);
        return value;
      }),
    );
  }
}

class RetryQuery {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'true = refresh every public page, not only what is pending' })
  @IsOptional() @IsIn(['true', 'false'])
  all?: string;
}

@ApiTags('Admin · CMS')
@ApiCookieAuth()
@Controller('admin/cms/revalidation')
export class RevalidationController {
  constructor(private readonly revalidation: RevalidationService) {}

  @Get()
  @RequirePermissions('content.read')
  @ApiOperation({ summary: 'Live-website refresh status: ok | pending (with the pending cache tags and last error code) | disabled' })
  status() {
    return this.revalidation.status();
  }

  @Post('retry')
  @HttpCode(200)
  @RequirePermissions('content.publish')
  @ApiOperation({ summary: 'Retry the pending website refresh now (no republish needed); ?all=true refreshes every public page' })
  retry(@Query() q: RetryQuery) {
    return this.revalidation.retry(q.all === 'true');
  }
}

@Global()
@Module({
  controllers: [RevalidationController],
  providers: [RevalidationService, { provide: APP_INTERCEPTOR, useClass: RevalidationInterceptor }],
  exports: [RevalidationService],
})
export class RevalidationModule {}
