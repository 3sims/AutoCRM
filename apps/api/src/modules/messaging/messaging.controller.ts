import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard, TenantGuard } from '../auth/guards/jwt-auth.guard'
import { MessagingService } from './messaging.service'

class SendEmailDto { to!: string; subject!: string; html?: string; templateId?: string; leadId!: string; vars?: Record<string, string> }
class SendSmsDto   { to!: string; body!: string; leadId!: string }

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @ApiOperation({ summary: 'Send email to a lead contact' })
  @Post('email')
  async sendEmail(@Body() dto: SendEmailDto, @Request() req: any) {
    const html = dto.templateId
      ? this.messagingService.renderTemplate(dto.templateId, dto.vars ?? {})
      : dto.html ?? ''
    await this.messagingService.sendEmail({ ...dto, html }, req.user)
    return { sent: true }
  }

  @ApiOperation({ summary: 'Send SMS to a lead contact' })
  @Post('sms')
  async sendSms(@Body() dto: SendSmsDto, @Request() req: any) {
    await this.messagingService.sendSms(dto, req.user)
    return { sent: true }
  }
}
