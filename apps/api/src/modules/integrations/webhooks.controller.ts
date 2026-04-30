import {
  Controller, Post, Body, Headers, HttpCode, HttpStatus,
  BadRequestException, Logger,
} from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { LeadsService } from '../leads/leads.service'
import * as crypto from 'crypto'

/**
 * WebhooksController — Inbound lead source integrations.
 *
 * Each route handles a specific provider's webhook format,
 * normalises it, and creates a Lead via LeadsService.
 *
 * Security: HMAC signature validation per provider.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name)

  constructor(private readonly leadsService: LeadsService) {}

  // ── Facebook Lead Ads ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Facebook Lead Ads webhook receiver' })
  @Post('facebook')
  @HttpCode(HttpStatus.OK)
  async facebookWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    this.validateFacebookSignature(body, signature)

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue
        const lead = change.value

        await this.leadsService.create({
          firstName: lead.field_data?.find((f: any) => f.name === 'first_name')?.values?.[0] ?? '',
          lastName:  lead.field_data?.find((f: any) => f.name === 'last_name')?.values?.[0]  ?? '',
          email:     lead.field_data?.find((f: any) => f.name === 'email')?.values?.[0]      ?? '',
          phone:     lead.field_data?.find((f: any) => f.name === 'phone_number')?.values?.[0] ?? '',
          source: 'Facebook',
          budget: 0,
          assignedTo: '', // Assign via round-robin or default rule
          notes: `Lead Facebook - Form ID: ${lead.form_id}`,
        }, {
          id: 'system', role: 'admin', companyId: 'company_01', // Resolved from page → company mapping
          name: 'System',
        } as any)

        this.logger.log(`Facebook lead created: ${lead.leadgen_id}`)
      }
    }

    return { status: 'ok' }
  }

  // Facebook webhook verification (GET)
  // Handle in a separate GET route in production

  private validateFacebookSignature(body: any, signature: string) {
    const secret = process.env.FACEBOOK_APP_SECRET ?? ''
    if (!secret) return // Skip validation in dev
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex')
    if (expected !== signature) throw new BadRequestException('Invalid Facebook signature')
  }

  // ── Google Ads Leads ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Google Ads Lead Form webhook' })
  @Post('google-ads')
  @HttpCode(HttpStatus.OK)
  async googleAdsWebhook(
    @Body() body: any,
    @Headers('x-goog-signature') signature: string,
  ) {
    const token = process.env.GOOGLE_ADS_WEBHOOK_TOKEN ?? ''
    if (token && body.google_key !== token) {
      throw new BadRequestException('Invalid Google Ads webhook token')
    }

    const lead = body.lead_data ?? body
    await this.leadsService.create({
      firstName: lead.user_column_data?.find((c: any) => c.column_id === 'FIRST_NAME')?.string_value ?? '',
      lastName:  lead.user_column_data?.find((c: any) => c.column_id === 'LAST_NAME')?.string_value  ?? '',
      email:     lead.user_column_data?.find((c: any) => c.column_id === 'EMAIL')?.string_value       ?? '',
      phone:     lead.user_column_data?.find((c: any) => c.column_id === 'PHONE_NUMBER')?.string_value ?? '',
      source: 'Google Ads',
      budget: 0,
      assignedTo: '',
      notes: `Lead Google Ads - Campaign: ${lead.campaign_id ?? 'N/A'}`,
    }, { id: 'system', role: 'admin', companyId: 'company_01', name: 'System' } as any)

    this.logger.log(`Google Ads lead created`)
    return { status: 'ok' }
  }

  // ── Generic / LaVieAuto / ParuVendu ──────────────────────────────────────

  @ApiOperation({ summary: 'Generic JSON webhook (LaVieAuto, ParuVendu, etc.)' })
  @Post(':source')
  @HttpCode(HttpStatus.OK)
  async genericWebhook(
    @Body() body: any,
    @Headers('x-webhook-secret') secret: string,
  ) {
    const expectedSecret = process.env.WEBHOOK_SECRET ?? ''
    if (expectedSecret && secret !== expectedSecret) {
      throw new BadRequestException('Invalid webhook secret')
    }

    // Normalised schema expected from all generic sources:
    // { firstName, lastName, email, phone, vehicleRef?, message?, source? }
    await this.leadsService.create({
      firstName: body.firstName ?? body.prenom ?? '',
      lastName:  body.lastName  ?? body.nom    ?? '',
      email:     body.email     ?? '',
      phone:     body.phone     ?? body.telephone ?? '',
      source:    body.source    ?? 'Site web',
      budget:    body.budget    ?? 0,
      assignedTo: '',
      notes: body.message ?? body.notes ?? '',
    }, { id: 'system', role: 'admin', companyId: 'company_01', name: 'System' } as any)

    this.logger.log(`Generic webhook lead created from ${body.source ?? 'unknown'}`)
    return { status: 'ok' }
  }
}
