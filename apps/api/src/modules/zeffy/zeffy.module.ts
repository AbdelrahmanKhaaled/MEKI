import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { Actor, Public, RequirePermissions, SkipCsrf } from '../../common/decorators';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { GalaModule } from '../gala/gala.module';
import { SafeIdPipe } from '../gala/gala-support';
import { ZeffyService } from './zeffy.service';

export class ProviderPaymentQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['UNMATCHED', 'NEEDS_REVIEW', 'MATCHED', 'CONFIRMED', 'IGNORED'] })
  @IsOptional() @IsIn(['UNMATCHED', 'NEEDS_REVIEW', 'MATCHED', 'CONFIRMED', 'IGNORED']) matchStatus?: string;
  @ApiPropertyOptional({ enum: ['CHARITABLE_DONATION', 'EVENT_TICKET_PAYMENT'] })
  @IsOptional() @IsIn(['CHARITABLE_DONATION', 'EVENT_TICKET_PAYMENT']) classification?: string;
}

export class ReconcileDto {
  @ApiPropertyOptional({ description: 'Look back this many days (1–400, default 30)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(400) days?: number;
}

/**
 * Zeffy webhook receiver. Separate path from the attempt-based `/webhooks/:provider` pipeline because Zeffy events do not carry
 * a MEKI attempt reference. Authentication = the documented Zeffy-Signature HMAC over the RAW body (rawBody: true in main.ts).
 */
@ApiTags('Integrations · Zeffy (SDI)')
@Public()
@SkipCsrf()
@SkipThrottle()
@Controller('integrations/zeffy')
export class ZeffyWebhookController {
  constructor(private readonly zeffy: ZeffyService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Zeffy webhook (payment.completed/created/updated/deleted). Signature verified on the raw body; events stored once per Zeffy event id.' })
  receive(@Req() req: RawBodyRequest<Request>) {
    return this.zeffy.ingestWebhook(req.rawBody, req.headers);
  }
}

@ApiTags('Admin · Zeffy (SDI) integration')
@ApiCookieAuth()
@Controller('admin/integrations/zeffy')
export class AdminZeffyController {
  constructor(private readonly zeffy: ZeffyService) {}

  @Get('status') @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'Runtime status: configuration flags (never values), live API check, verified webhook deliveries, last reconciliation, review queue' })
  status() {
    return this.zeffy.status();
  }

  @Get('payments') @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'Provider payments read from SDI’s Zeffy account, with their correlation state (no personal data)' })
  list(@Query() q: ProviderPaymentQueryDto) {
    return this.zeffy.list(q);
  }

  @Post('reconcile') @HttpCode(200) @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Read recent payments from Zeffy (GET only) and re-evaluate them. Idempotent; audited.' })
  reconcile(@Body() dto: ReconcileDto, @Actor() actor: ActorContext) {
    return this.zeffy.reconcile(actor, dto.days ?? 30);
  }

  @Post('payments/:id/recheck') @HttpCode(200) @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Re-read one payment from Zeffy and re-apply the same correlation rules (never marks anything paid by hand)' })
  recheck(@Param('id', SafeIdPipe) id: string, @Actor() actor: ActorContext) {
    return this.zeffy.recheck(id, actor);
  }
}

@Module({
  imports: [GalaModule],
  controllers: [ZeffyWebhookController, AdminZeffyController],
  providers: [ZeffyService],
  exports: [ZeffyService],
})
export class ZeffyModule {}
