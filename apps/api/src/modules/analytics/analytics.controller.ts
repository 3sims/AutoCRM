import { Controller, Get, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard, TenantGuard } from '../auth/guards/jwt-auth.guard'
import { AnalyticsService } from './analytics.service'

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @ApiOperation({ summary: 'Dashboard KPIs (role-scoped)' })
  @Get('dashboard')
  dashboard(@Request() req: any) {
    return this.analyticsService.getDashboard(req.companyId, req.user)
  }

  @ApiOperation({ summary: 'Per-salesperson performance (admin/manager only)' })
  @Get('team')
  team(@Request() req: any) {
    return this.analyticsService.getUserPerformance(req.companyId, req.user)
  }
}
