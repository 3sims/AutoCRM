import { Injectable, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan } from 'typeorm'
import { LeadEntity } from '../leads/lead.entity'
import { eventBus } from '@autocrm/events'

/**
 * AutomationService
 *
 * Handles:
 *   1. SLA breach detection (cron every 15 min)
 *   2. Stale lead detection (cron every hour)
 *   3. Follow-up job scheduling via BullMQ
 *
 * Future microservice path:
 *   Extract this service to a standalone worker that reads from the DB
 *   and publishes events to Redis. No HTTP surface needed.
 */
@Injectable()
export class AutomationService implements OnModuleInit {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadRepo: Repository<LeadEntity>,
    @InjectQueue('automation')
    private readonly automationQueue: Queue,
  ) {}

  onModuleInit() {
    // Listen for lead.created → schedule 24h follow-up reminder
    eventBus.on('lead.created', async ({ leadId, assignedTo }) => {
      await this.automationQueue.add(
        'followup-reminder',
        { leadId, assignedTo },
        { delay: 24 * 60 * 60 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
    })

    // Listen for lead.contacted → reset stale timer
    eventBus.on('lead.contacted', async ({ leadId }) => {
      // Remove pending stale jobs for this lead
      const jobs = await this.automationQueue.getJobs(['delayed'])
      for (const job of jobs) {
        if (job.data.leadId === leadId && job.name === 'stale-alert') {
          await job.remove()
        }
      }
    })
  }

  // ── SLA breach checker — runs every 15 minutes ────────────────────────────

  @Cron('0 */15 * * * *')
  async checkSlaBreaches() {
    const now = new Date()
    const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24h ago

    const breachedLeads = await this.leadRepo
      .createQueryBuilder('lead')
      .where("lead.stage NOT IN ('Gagné', 'Perdu')")
      .andWhere('lead.sla_breached = false')
      .andWhere('lead.created_at < :threshold', { threshold })
      .getMany()

    for (const lead of breachedLeads) {
      const ageHours = (now.getTime() - lead.createdAt.getTime()) / 3_600_000
      lead.slaBreached = true
      await this.leadRepo.save(lead)
      eventBus.emit('lead.sla_breached', {
        leadId: lead.id,
        hoursOverdue: Math.floor(ageHours - lead.slaHours),
      })
    }
  }

  // ── Stale lead detector — runs every hour ─────────────────────────────────

  @Cron('0 0 * * * *')
  async checkStaleLeads() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

    const staleLeads = await this.leadRepo
      .createQueryBuilder('lead')
      .where("lead.stage NOT IN ('Gagné', 'Perdu')")
      .andWhere('lead.updated_at < :threshold', { threshold: threeDaysAgo })
      .getMany()

    for (const lead of staleLeads) {
      const days = Math.floor((Date.now() - lead.updatedAt.getTime()) / 86_400_000)
      eventBus.emit('lead.stale', { leadId: lead.id, daysSinceContact: days })
    }
  }

  // ── Schedule a follow-up job ───────────────────────────────────────────────

  async scheduleFollowup(leadId: string, delayMs: number, assignedTo: string) {
    const job = await this.automationQueue.add(
      'followup-reminder',
      { leadId, assignedTo },
      { delay: delayMs, attempts: 3 },
    )
    eventBus.emit('automation.followup_scheduled', {
      leadId,
      scheduledAt: new Date(Date.now() + delayMs).toISOString(),
    })
    return job
  }
}
