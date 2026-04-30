import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard, TenantGuard } from '../auth/guards/jwt-auth.guard'
import { AuditService } from './audit.service'

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({ summary: 'Get audit logs (admin/manager only)' })
  @Get()
  findAll(@Request() req: any, @Query() query: any) {
    return this.auditService.findAll(req.companyId, req.user, query)
  }
}
