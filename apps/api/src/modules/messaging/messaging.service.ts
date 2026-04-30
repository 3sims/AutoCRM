import { Injectable, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { can } from '@autocrm/utils/permissions'
import { eventBus } from '@autocrm/events'

/**
 * MessagingService
 *
 * Adapter pattern: swap SendGrid / Mailgun / Twilio without changing callers.
 *
 * Future microservice path:
 *   Extract to a standalone messaging service.
 *   Receives jobs from a 'messaging' BullMQ queue.
 *   Exposes no HTTP — pure worker.
 */

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  leadId: string
  templateId?: string
}

export interface SendSmsParams {
  to: string
  body: string
  leadId: string
}

@Injectable()
export class MessagingService {
  private transporter: nodemailer.Transporter

  constructor(private readonly config: ConfigService) {
    // In production: use SendGrid transport
    // npm install nodemailer-sendgrid
    this.transporter = nodemailer.createTransport({
      host:   config.get('SMTP_HOST', 'smtp.sendgrid.net'),
      port:   config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: config.get('SMTP_USER', 'apikey'),
        pass: config.get('SENDGRID_API_KEY', ''),
      },
    })
  }

  // ── Email ─────────────────────────────────────────────────────────────────

  async sendEmail(params: SendEmailParams, user: any): Promise<void> {
    if (!can(user, 'messaging.send')) throw new ForbiddenException()

    try {
      await this.transporter.sendMail({
        from: `"${this.config.get('EMAIL_FROM_NAME', 'AutoCRM')}" <${this.config.get('EMAIL_FROM', 'noreply@moreau-auto.fr')}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      })

      eventBus.emit('messaging.email_sent', {
        leadId: params.leadId,
        userId: user.id,
        templateId: params.templateId,
      })
    } catch (err) {
      console.error('[MessagingService] Email send failed:', err)
      throw err
    }
  }

  // ── SMS (Twilio) ──────────────────────────────────────────────────────────

  async sendSms(params: SendSmsParams, user: any): Promise<void> {
    if (!can(user, 'messaging.send')) throw new ForbiddenException()

    const accountSid = this.config.get('TWILIO_ACCOUNT_SID')
    const authToken  = this.config.get('TWILIO_AUTH_TOKEN')
    const from       = this.config.get('TWILIO_FROM_NUMBER')

    if (!accountSid || !authToken) {
      console.warn('[MessagingService] Twilio not configured — SMS skipped')
      return
    }

    // Dynamic import to avoid hard dependency when not configured
    const twilio = await import('twilio')
    const client = twilio.default(accountSid, authToken)

    await client.messages.create({ body: params.body, from, to: params.to })

    eventBus.emit('messaging.sms_sent', { leadId: params.leadId, userId: user.id })
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  renderTemplate(templateId: string, vars: Record<string, string>): string {
    const templates: Record<string, string> = {
      'follow-up': `
        <p>Bonjour {{firstName}},</p>
        <p>Suite à votre intérêt pour un véhicule d'occasion, nous restons à votre disposition.</p>
        <p>N'hésitez pas à nous contacter au <strong>{{phone}}</strong>.</p>
        <p>Cordialement,<br>{{senderName}}<br>Groupe Moreau Automobiles</p>
      `,
      'appointment': `
        <p>Bonjour {{firstName}},</p>
        <p>Votre rendez-vous pour un essai est confirmé le <strong>{{date}}</strong>.</p>
        <p>Adresse : 47 Avenue Jean Jaurès, 69007 Lyon</p>
        <p>À bientôt,<br>{{senderName}}</p>
      `,
      'vehicle-available': `
        <p>Bonjour {{firstName}},</p>
        <p>Bonne nouvelle ! Le véhicule <strong>{{vehicle}}</strong> que vous avez consulté est toujours disponible.</p>
        <p>Prix : <strong>{{price}}</strong></p>
        <p>{{senderName}} — Groupe Moreau Automobiles</p>
      `,
    }

    let tpl = templates[templateId] ?? '<p>{{body}}</p>'
    for (const [key, val] of Object.entries(vars)) {
      tpl = tpl.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
    }
    return tpl
  }
}
