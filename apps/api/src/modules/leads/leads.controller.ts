import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TenantGuard } from '../auth/guards/jwt-auth.guard'
import { LeadsService } from './leads.service'
import type { CreateLeadDto, UpdateLeadDto, LeadStage } from '@autocrm/shared-types'

class AddNoteDto { content!: string }
class AssignDto   { userId!: string }
class ChangeStageDto { stage!: LeadStage }

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @ApiOperation({ summary: 'List leads (scoped by role + filters)' })
  @ApiQuery({ name: 'stage', required: false })
  @ApiQuery({ name: 'assignedTo', required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get()
  findAll(@Request() req: any, @Query() query: any) {
    return this.leadsService.findAll(
      { companyId: req.companyId, ...query },
      req.user,
    )
  }

  @ApiOperation({ summary: 'Get a single lead' })
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.leadsService.findOne(id, req.companyId)
  }

  @ApiOperation({ summary: 'Create a new lead' })
  @Post()
  create(@Body() dto: CreateLeadDto, @Request() req: any) {
    return this.leadsService.create(dto, req.user)
  }

  @ApiOperation({ summary: 'Update lead fields' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Request() req: any) {
    return this.leadsService.update(id, dto, req.user)
  }

  @ApiOperation({ summary: 'Change pipeline stage (SoD enforced)' })
  @Patch(':id/stage')
  changeStage(@Param('id') id: string, @Body() dto: ChangeStageDto, @Request() req: any) {
    return this.leadsService.changeStage(id, dto.stage, req.user)
  }

  @ApiOperation({ summary: 'Add a note / activity to a lead' })
  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @Request() req: any) {
    return this.leadsService.addNote(id, dto.content, req.user)
  }

  @ApiOperation({ summary: 'Assign or reassign a lead (SoD enforced)' })
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignDto, @Request() req: any) {
    return this.leadsService.assign(id, dto.userId, req.user)
  }

  @ApiOperation({ summary: 'Delete a lead (admin only)' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.leadsService.remove(id, req.user)
  }
}
