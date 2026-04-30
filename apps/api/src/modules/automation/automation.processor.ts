import { Processor, Process } from '@nestjs/bull'
import { Job } from 'bull'
import { Logger } from '@nestjs/common'
import { eventBus } from '@autocrm/events'

/**
 * AutomationProcessor — BullMQ job handlers.
 *
 * Each job type is a discrete handler that can be extracted
 * to a standalone worker service when scaling.
 */
@Processor('automation')
export class AutomationProcessor {
  private readonly logger = new Logger(AutomationProcessor.name)

  @Process('followup-reminder')
  async handleFollowup(job: Job<{ leadId: string; assignedTo: string }>) {
    const { leadId, assignedTo } = job.data
    this.logger.log(`Follow-up reminder: lead=${leadId} assignee=${assignedTo}`)

    // Emit notification event (NotificationService subscribes to this)
    eventBus.emit('lead.stale', { leadId, daysSinceContact: 1 })
  }

  @Process('stale-alert')
  async handleStaleAlert(job: Job<{ leadId: string; days: number }>) {
    const { leadId, days } = job.data
    this.logger.log(`Stale lead alert: lead=${leadId} days=${days}`)
    eventBus.emit('lead.stale', { leadId, daysSinceContact: days })
  }

  @Process('sla-escalation')
  async handleSlaEscalation(job: Job<{ leadId: string; companyId: string }>) {
    const { leadId } = job.data
    this.logger.log(`SLA escalation: lead=${leadId}`)
    eventBus.emit('lead.sla_breached', { leadId, hoursOverdue: 0 })
  }
}
