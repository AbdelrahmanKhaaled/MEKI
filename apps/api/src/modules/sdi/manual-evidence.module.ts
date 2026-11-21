import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Actor, RequirePermissions } from "../../common/decorators";
import type { ActorContext } from "../../common/types/auth-request";
import { AMOUNT_PATTERN } from "../donations/money";
import { GalaModule } from "../gala/gala.module";
import { SafeIdPipe } from "../gala/gala-support";
import { ManualEvidenceService } from "./manual-evidence.service";

const REF = /^(?:DN|EB)-[A-Z0-9]{12}$/;
export class SubmitManualEvidenceDto {
  @ApiProperty() @Matches(REF) reference!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(REF) evidenceReference?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/)
  externalPaymentId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(AMOUNT_PATTERN) amount?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  occurredAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  formUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["ZAKAT", "SADAQAH"])
  classification?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  emailMessageId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  emailFrom?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  emailTo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  emailReceivedAt?: string;
  @ApiPropertyOptional({
    description:
      "Opaque reference in the finance-only SDI original-email archive; no public URLs or card data",
  })
  @IsOptional()
  @Matches(/^sdi-evidence:[A-Za-z0-9_./-]{3,230}$/)
  protectedReference?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() originalSdiEmail?: boolean;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(500) note!: string;
}
class EvidenceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["PENDING_REVIEW", "AWAITING_APPROVAL", "APPROVED", "REJECTED"])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(REF) reference?: string;
}
class EvidenceDecisionDto {
  @ApiProperty() @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(500) note!: string;
}

@ApiTags("Admin · Private SDI payment evidence")
@ApiCookieAuth()
@Controller("admin/sdi/payment-evidence")
export class ManualEvidenceController {
  constructor(private readonly evidence: ManualEvidenceService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @RequirePermissions("sdi.reports.upload")
  list(@Query() q: EvidenceQueryDto) {
    return this.evidence.list(q.status, q.reference);
  }
  @Get(":id")
  @Header("Cache-Control", "no-store")
  @RequirePermissions("sdi.reports.upload")
  detail(@Param("id", SafeIdPipe) id: string) {
    return this.evidence.detail(id);
  }
  @Post()
  @RequirePermissions("sdi.reports.upload")
  submit(@Body() dto: SubmitManualEvidenceDto, @Actor() actor: ActorContext) {
    return this.evidence.submit(dto, actor);
  }
  @Post(":id/decision")
  @HttpCode(200)
  @RequirePermissions("sdi.reports.upload", "sdi.reports.approve")
  decide(
    @Param("id", SafeIdPipe) id: string,
    @Body() dto: EvidenceDecisionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.evidence.decide(id, dto.decision, dto.note, actor);
  }
}

@Module({
  imports: [GalaModule],
  controllers: [ManualEvidenceController],
  providers: [ManualEvidenceService],
})
export class ManualEvidenceModule {}
