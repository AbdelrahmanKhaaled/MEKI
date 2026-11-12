import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('Admin · Audit logs')
@ApiCookieAuth()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'List audit log entries (read-only; no update/delete endpoints exist)' })
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
