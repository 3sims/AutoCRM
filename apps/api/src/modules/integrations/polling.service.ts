import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { ConfigService } from '@nestjs/config'
import { LeadsService } from '../leads/leads.service'
import axios from 'axios'

/**
 * PollingService — pulls leads from portals that don't support webhooks.
 *
 * Portals: Leboncoin Pro, AutoScout24 (via OAuth2), ParuVendu
 *
 * Future extraction: becomes a standalone worker microservice.
 * Reads from DB (integration config table) to discover active integrations.
 */
@Injectable()
export class PollingService {
  private readonly logger = new Logger(PollingService.name)

  constructor(
    private readonly leadsService: LeadsService,
    private readonly config: ConfigService,
  ) {}

  // ── Leboncoin Pro ─────────────────────────────────────────────────────────

  @Cron('0 */15 * * * *')
  async pollLeboncoin() {
    const apiKey    = this.config.get('LEBONCOIN_API_KEY')
    const sellerId  = this.config.get('LEBONCOIN_SELLER_ID')
    if (!apiKey || !sellerId) return

    try {
      const { data } = await axios.get(`https://api.leboncoin.fr/api/v2/leads`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: { seller_id: sellerId, status: 'new', limit: 50 },
      })

      for (const lead of data.leads ?? []) {
        await this.leadsService.create({
          firstName: lead.contact?.firstname ?? '',
          lastName:  lead.contact?.lastname  ?? '',
          email:     lead.contact?.email     ?? '',
          phone:     lead.contact?.phone     ?? '',
          source: 'Leboncoin',
          budget: lead.ad?.price ?? 0,
          assignedTo: '',
          notes: `Leboncoin lead — annonce: ${lead.ad?.subject ?? ''}\n${lead.message ?? ''}`,
        }, { id: 'system', role: 'admin', companyId: 'company_01', name: 'System' } as any)
      }

      this.logger.log(`Leboncoin: ${data.leads?.length ?? 0} leads imported`)
    } catch (err: any) {
      this.logger.error(`Leboncoin poll failed: ${err.message}`)
    }
  }

  // ── AutoScout24 ──────────────────────────────────────────────────────────

  @Cron('0 */15 * * * *')
  async pollAutoScout24() {
    const clientId     = this.config.get('AUTOSCOUT24_CLIENT_ID')
    const clientSecret = this.config.get('AUTOSCOUT24_CLIENT_SECRET')
    const dealerId     = this.config.get('AUTOSCOUT24_DEALER_ID')
    if (!clientId || !clientSecret || !dealerId) return

    try {
      // 1. Get OAuth2 token
      const tokenRes = await axios.post('https://auth.autoscout24.com/oauth/token', {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'leads:read',
      })
      const accessToken = tokenRes.data.access_token

      // 2. Fetch new leads
      const { data } = await axios.get(
        `https://api.autoscout24.com/v2/dealers/${dealerId}/leads`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { status: 'new', page: 1, pageSize: 50 },
        }
      )

      for (const lead of data.items ?? []) {
        await this.leadsService.create({
          firstName: lead.contactData?.firstName ?? '',
          lastName:  lead.contactData?.lastName  ?? '',
          email:     lead.contactData?.email     ?? '',
          phone:     lead.contactData?.phone     ?? '',
          source: 'AutoScout24',
          budget: lead.listing?.price?.value ?? 0,
          assignedTo: '',
          notes: `AutoScout24 — ${lead.listing?.make} ${lead.listing?.model}\n${lead.message ?? ''}`,
        }, { id: 'system', role: 'admin', companyId: 'company_01', name: 'System' } as any)
      }

      this.logger.log(`AutoScout24: ${data.items?.length ?? 0} leads imported`)
    } catch (err: any) {
      this.logger.error(`AutoScout24 poll failed: ${err.message}`)
    }
  }
}
