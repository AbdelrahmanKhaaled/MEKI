import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { SLUG_PATTERN } from '../../common/utils';
import {
  DonationDesignation,
  DonationFrequency,
  DonationPaymentStatus,
  DonationStatus,
  DonorType,
  PaymentTransactionType,
  RecurringStatus,
  RefundStatus,
  WebhookEventStatus,
} from '../../generated/prisma/enums';
import { AMOUNT_PATTERN } from './money';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const AMOUNT_DOC = { example: '50.00', description: 'Decimal STRING in the original currency (no floats). Max 3 decimals, limited by the currency minor units.' };
const NAME = /^[\p{L}\p{M}' .-]{1,120}$/u;

// ───────────── public ─────────────

export class DonorInputDto {
  @ApiProperty() @Transform(trim) @IsString() @Matches(NAME, { message: 'firstName contains invalid characters' }) firstName!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(NAME, { message: 'lastName contains invalid characters' }) lastName!: string;
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(191) email!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[\d\s()-]{6,40}$/) phone?: string;
  @ApiPropertyOptional({ example: 'US' }) @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @ApiPropertyOptional({ enum: DonorType }) @IsOptional() @IsEnum(DonorType) donorType?: DonorType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) organizationName?: string;
}

export class AttributionDto {
  @ApiPropertyOptional({ example: 'landing-quick-donate' }) @IsOptional() @Matches(/^[a-z0-9_-]{1,60}$/) source?: string;
  @ApiPropertyOptional({ description: 'Slug of a public event that referred the donation' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(120) eventSlug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string;
}

export class CreateDonationDto {
  @ApiProperty(AMOUNT_DOC) @IsString() @Matches(AMOUNT_PATTERN, { message: 'amount must be a positive decimal string' }) amount!: string;
  @ApiProperty({ example: 'USD' }) @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @ApiPropertyOptional({ enum: DonationFrequency, default: 'ONE_TIME' }) @IsOptional() @IsEnum(DonationFrequency) frequency?: DonationFrequency;
  @ApiProperty({ enum: DonationDesignation }) @IsEnum(DonationDesignation) designation!: DonationDesignation;
  @ApiPropertyOptional({ description: 'Required when designation=CAMPAIGN' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(120) campaignSlug?: string;
  @ApiPropertyOptional({ description: 'Required when designation=PROGRAMME' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(100) programmeSlug?: string;
  @ApiProperty({ type: DonorInputDto }) @ValidateNested() @Type(() => DonorInputDto) donor!: DonorInputDto;
  @ApiProperty({ description: 'Must be true: the donor accepted the privacy notice' }) @Equals(true) privacyConsent!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) privacyPolicyVersion?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() marketingConsent?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) message?: string;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
  @ApiPropertyOptional({ type: AttributionDto }) @IsOptional() @ValidateNested() @Type(() => AttributionDto) attribution?: AttributionDto;
}

export class DonationTokenQueryDto {
  @ApiPropertyOptional({ description: 'Alternative to the X-Donation-Token header (return links)' }) @IsOptional() @IsString() @MaxLength(128) token?: string;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
}

// ───────────── admin ─────────────

const bool = ['true', 'false'];

export class DonationAdminQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: DonationStatus }) @IsOptional() @IsEnum(DonationStatus) status?: DonationStatus;
  @ApiPropertyOptional({ enum: DonationPaymentStatus }) @IsOptional() @IsEnum(DonationPaymentStatus) paymentStatus?: DonationPaymentStatus;
  @ApiPropertyOptional({ enum: DonationFrequency }) @IsOptional() @IsEnum(DonationFrequency) frequency?: DonationFrequency;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() campaignId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() donorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional({ description: 'Include mock/test-provider records (default false)' }) @IsOptional() @IsIn(bool) includeTest?: string;
}

export class DonorAdminQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(bool) includeAnonymized?: string;
}

export class UpdateDonorDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @Matches(NAME) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @Matches(NAME) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[\d\s()-]{6,40}$/) phone?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['en', 'ar']) preferredLocale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) organizationName?: string;
  @ApiPropertyOptional({ description: 'Withdrawing consent is always allowed; granting it requires the donor’s own action' })
  @IsOptional() @Equals(false) marketingConsent?: false;
}

export class AnonymizeDonorDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class TransactionQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) provider?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ enum: PaymentTransactionType }) @IsOptional() @IsEnum(PaymentTransactionType) type?: PaymentTransactionType;
  @ApiPropertyOptional({ enum: ['SUCCEEDED', 'FAILED'] }) @IsOptional() @IsIn(['SUCCEEDED', 'FAILED']) status?: 'SUCCEEDED' | 'FAILED';
  @ApiPropertyOptional() @IsOptional() @IsIn(bool) includeTest?: string;
}

export class WebhookEventQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: WebhookEventStatus }) @IsOptional() @IsEnum(WebhookEventStatus) status?: WebhookEventStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) provider?: string;
}

export class RecurringQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: RecurringStatus }) @IsOptional() @IsEnum(RecurringStatus) status?: RecurringStatus;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(bool) includeTest?: string;
}

export class ReasonDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class RequestRefundDto {
  @ApiProperty(AMOUNT_DOC) @IsString() @Matches(AMOUNT_PATTERN) amount!: string;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}

export class RefundDecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class RefundQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: RefundStatus }) @IsOptional() @IsEnum(RefundStatus) status?: RefundStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() donationId?: string;
}

export class ReceiptQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['ISSUED', 'VOID'] }) @IsOptional() @IsIn(['ISSUED', 'VOID']) status?: 'ISSUED' | 'VOID';
  @ApiPropertyOptional() @IsOptional() @IsString() donationId?: string;
}

export class IssueReceiptDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
}

export class ReceiptDocumentQueryDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
  @ApiPropertyOptional({ enum: ['html', 'pdf'], default: 'html' }) @IsOptional() @IsIn(['html', 'pdf']) format?: 'html' | 'pdf';
}

export class ReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(bool) includeTest?: string;
}

export class UpdateCurrencyDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isEnabled?: boolean;
  @ApiPropertyOptional({ type: [String], example: ['25', '50', '100'] })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ArrayUnique() @Matches(AMOUNT_PATTERN, { each: true })
  suggestedAmounts?: string[];
  @ApiPropertyOptional(AMOUNT_DOC) @IsOptional() @Matches(AMOUNT_PATTERN) minAmount?: string;
  @ApiPropertyOptional(AMOUNT_DOC) @IsOptional() @Matches(AMOUNT_PATTERN) maxAmount?: string;
}

export class UpdatePaymentProviderDto {
  @ApiProperty({ description: 'Administrative activation flag (server configuration must also allow the provider)' })
  @IsBoolean()
  isEnabled!: boolean;
}
