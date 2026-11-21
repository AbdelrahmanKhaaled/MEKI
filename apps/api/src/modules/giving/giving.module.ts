import { Body, Controller, Get, Header, Headers, HttpCode, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Actor, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { DONATION_THROTTLE, STATUS_THROTTLE } from '../../common/rate-limit';
import type { ActorContext, AuthUser } from '../../common/types/auth-request';
import { SLUG_PATTERN } from '../../common/utils';
import { DonationsModule } from '../donations/donations.module';
import { AMOUNT_PATTERN } from '../donations/money';
import { FundraisingModule } from '../fundraising/fundraising.module';
import { SafeIdPipe } from '../gala/gala-support';
import { CLASSIFICATIONS, DONATION_INTENT_TYPES, type Classification, type DonationIntentType } from './giving.rules';
import { GivingService } from './giving.service';
import { ZAKAT_TARGET_TYPES, ZakatEligibilityService, type ZakatTargetType } from './zakat-eligibility.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class IntentDonorDto {
  @ApiProperty({ example: 'Amina Hassan' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @ApiProperty({ example: 'donor@example.org' }) @Transform(trim) @IsEmail() @MaxLength(191) email!: string;
}

export class CreateDonationIntentDto {
  @ApiProperty({ enum: DONATION_INTENT_TYPES }) @IsIn(DONATION_INTENT_TYPES) intentType!: DonationIntentType;
  @ApiPropertyOptional({ description: 'PROGRAM_DONATION only' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(100) programmeSlug?: string;
  @ApiPropertyOptional({ description: 'GALA_DONATION only (e.g. gala-night)' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(120) eventSlug?: string;
  @ApiProperty({ example: '100.00', description: 'Decimal string (the INTENDED amount; SDI\'s form charges)' }) @Matches(AMOUNT_PATTERN) amount!: string;
  @ApiProperty({ enum: ['USD'] }) @IsIn(['USD']) currency!: 'USD';
  @ApiProperty({ enum: CLASSIFICATIONS }) @IsIn(CLASSIFICATIONS) classification!: Classification;
  @ApiProperty({ type: IntentDonorDto }) @ValidateNested() @Type(() => IntentDonorDto) donor!: IntentDonorDto;
  @ApiProperty({ description: 'The donor confirmed the review screen and terms' }) @IsBoolean() @Equals(true) acceptTerms!: boolean;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
  @ApiPropertyOptional({ description: 'Phase 14B Gala-only mode (GALA_DONATION only): the option the donor started from — "general" or a programme slug' })
  @IsOptional() @Matches(/^(?:general|[a-z0-9-]{2,100})$/) sourceInterest?: string;
  @ApiPropertyOptional({ description: 'Phase 14B: the donor accepted that the gift goes to the approved Gala project instead (required with sourceInterest)' })
  @IsOptional() @IsBoolean() acknowledgeGalaDestination?: boolean;
}

class LocaleQ {
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
}
class StatusQ extends LocaleQ {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) token?: string;
}

class IntentAdminQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: DONATION_INTENT_TYPES }) @IsOptional() @IsIn(DONATION_INTENT_TYPES) intentType?: string;
  @ApiPropertyOptional({ enum: CLASSIFICATIONS }) @IsOptional() @IsIn(CLASSIFICATIONS) classification?: string;
  @ApiPropertyOptional({ enum: ['AWAITING_REPORT', 'VERIFIED', 'NEEDS_REVIEW', 'REPORTED_UNPAID'] }) @IsOptional() @IsIn(['AWAITING_REPORT', 'VERIFIED', 'NEEDS_REVIEW', 'REPORTED_UNPAID']) reconciliationStatus?: string;
  @ApiPropertyOptional({ enum: ['PENDING_AUTHORIZATION', 'AUTHORIZED', 'REJECTED'] }) @IsOptional() @IsIn(['PENDING_AUTHORIZATION', 'AUTHORIZED', 'REJECTED']) allocationStatus?: string;
  @ApiPropertyOptional({ description: 'Include test/synthetic intents (development data)' }) @IsOptional() @IsIn(['true', 'false']) includeTest?: string;
}

export class AllocationDecisionDto {
  @ApiProperty({ enum: ['AUTHORIZE', 'REJECT'] }) @IsIn(['AUTHORIZE', 'REJECT']) decision!: 'AUTHORIZE' | 'REJECT';
  @ApiPropertyOptional({ description: 'Authorized fund / destination (required to authorize)' }) @IsOptional() @IsString() @MaxLength(160) fund?: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) note!: string;
}

export class ZakatRequestDto {
  @ApiProperty({ enum: ZAKAT_TARGET_TYPES }) @IsIn(ZAKAT_TARGET_TYPES) targetType!: ZakatTargetType;
  @ApiProperty() @IsString() @MaxLength(30) @Matches(/^[a-z0-9]+$/) targetId!: string;
  @ApiProperty({ description: 'true = Zakat-eligible; false = not eligible' }) @IsBoolean() eligible!: boolean;
  @ApiPropertyOptional({ description: "MEKI religious/finance authority decision (document / date / signatory) — required when eligible" }) @IsOptional() @IsString() @MaxLength(255) authorityReference?: string;
  @ApiPropertyOptional({ description: "SDI's written acceptance of the Zakat accounting restriction — required when eligible" }) @IsOptional() @IsString() @MaxLength(255) sdiAcceptanceReference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class ZakatDecisionNoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class ZakatRejectDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
class ZakatRevokeDto {
  @ApiProperty({ enum: ZAKAT_TARGET_TYPES }) @IsIn(ZAKAT_TARGET_TYPES) targetType!: ZakatTargetType;
  @ApiProperty() @IsString() @MaxLength(30) @Matches(/^[a-z0-9]+$/) targetId!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

const canSeeDonor = (u: AuthUser) => u.isSuperAdmin || u.permissions.includes('donors.read');

@ApiTags('Public · Giving (SDI hosted)')
@Public()
@Controller('public')
export class PublicGivingController {
  constructor(private readonly giving: GivingService) {}

  @Get('giving/options')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'General / programme giving: channels, payable programmes, Zakat availability per programme, USD limits. Information only.' })
  options(@Query() q: LocaleQ) {
    return this.giving.options(q.locale ?? 'en');
  }

  @Get('events/:slug/giving-options')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Gala donation options (the single approved Gala project, Zakat only if that project is approved for Zakat)' })
  galaOptions(@Param('slug') slug: string, @Query() q: LocaleQ) {
    if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new NotFoundException('Event not found');
    return this.giving.galaOptions(slug, q.locale ?? 'en');
  }

  @Post('donation-intents')
  @Throttle(DONATION_THROTTLE)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Client-generated unique key (16-80 chars). Replays return the same reference.' })
  @ApiOperation({ summary: "Record a donation INTENT and issue a MEKI donation reference (DN-…) before the hand-off to SDI's form. No payment; 409 GIVING_CHANNEL_DISABLED unless that channel is authorized." })
  create(@Body() dto: CreateDonationIntentDto, @Headers('idempotency-key') key: string | undefined) {
    return this.giving.createIntent(dto, key);
  }

  @Get('donation-intents/:reference/status')
  @Throttle(STATUS_THROTTLE)
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'X-Donation-Token', required: false })
  @ApiOperation({ summary: 'Donor-facing status (no personal data). A return from Zeffy never verifies a payment: only an approved SDI report does.' })
  status(@Param('reference') reference: string, @Headers('x-donation-token') header: string | undefined, @Query() q: StatusQ) {
    return this.giving.publicStatus(reference, header ?? q.token, q.locale ?? 'en');
  }
}

@ApiTags('Admin · Giving intents')
@ApiCookieAuth()
@Controller('admin/donation-intents')
export class AdminGivingController {
  constructor(private readonly giving: GivingService) {}

  @Get()
  @RequirePermissions('donations.read')
  @ApiOperation({ summary: 'Hosted donation intents (references, Zakat/Sadaqah, intended designation, verification, allocation). Donor data needs donors.read.' })
  list(@Query() q: IntentAdminQueryDto, @CurrentUser() user: AuthUser) {
    return this.giving.adminList({ ...q, includeTest: q.includeTest === 'true' }, canSeeDonor(user));
  }

  @Get('summary')
  @RequirePermissions('donations.read')
  @ApiOperation({ summary: 'Totals by intent type × Zakat/Sadaqah × verification × allocation (USD, test excluded). Ticket revenue excluded.' })
  summary() {
    return this.giving.summary();
  }

  @Get(':id')
  @RequirePermissions('donations.read')
  @ApiOperation({ summary: 'Intent detail with reconciliation evidence (SDI report rows, provider record) and audit history' })
  get(@Param('id', SafeIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.giving.adminDetail(id, canSeeDonor(user));
  }

  @Post(':id/allocation')
  @HttpCode(200)
  @RequirePermissions('donations.allocate')
  @ApiOperation({ summary: 'Authorize or reject the fund allocation of a VERIFIED gift (not by the SDI report approver)' })
  allocate(@Param('id', SafeIdPipe) id: string, @Body() dto: AllocationDecisionDto, @Actor() actor: ActorContext) {
    return this.giving.decideAllocation(id, dto, actor);
  }
}

@ApiTags('Admin · Zakat eligibility')
@ApiCookieAuth()
@Controller('admin/zakat-eligibility')
export class AdminZakatController {
  constructor(private readonly zakat: ZakatEligibilityService) {}

  @Get()
  @RequirePermissions('donations.read')
  @ApiOperation({ summary: 'Programmes, projects and campaigns with their effective Zakat eligibility (default: NOT eligible), pending requests and history' })
  overview() {
    return this.zakat.overview();
  }

  @Post()
  @RequirePermissions('zakat.manage')
  @ApiOperation({ summary: 'Request an eligibility change (eligible=true needs the MEKI authority AND SDI acceptance references)' })
  request(@Body() dto: ZakatRequestDto, @Actor() actor: ActorContext) {
    return this.zakat.request(dto, actor);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('zakat.approve')
  @ApiOperation({ summary: 'Approve a pending request (a different administrator than the requester)' })
  approve(@Param('id', SafeIdPipe) id: string, @Body() dto: ZakatDecisionNoteDto, @Actor() actor: ActorContext) {
    return this.zakat.approve(id, dto.note, actor);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('zakat.approve')
  reject(@Param('id', SafeIdPipe) id: string, @Body() dto: ZakatRejectDto, @Actor() actor: ActorContext) {
    return this.zakat.reject(id, dto.note, actor);
  }

  @Post('revoke')
  @HttpCode(200)
  @RequirePermissions('zakat.approve')
  @ApiOperation({ summary: 'Withdraw the current approval immediately (reduces what is offered)' })
  revoke(@Body() dto: ZakatRevokeDto, @Actor() actor: ActorContext) {
    return this.zakat.revoke(dto.targetType, dto.targetId, dto.reason, actor);
  }
}

@Module({
  imports: [DonationsModule, FundraisingModule],
  controllers: [PublicGivingController, AdminGivingController, AdminZakatController],
  providers: [GivingService, ZakatEligibilityService],
  exports: [GivingService, ZakatEligibilityService],
})
export class GivingModule {}
