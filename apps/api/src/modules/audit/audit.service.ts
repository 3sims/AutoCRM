import { Injectable, OnModuleInit, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLogEntity } from './audit.entity'
import { eventBus } from '@autocrm/events'
import { can } from '@autocrm/utils/permissions'

interface LogActionParams {
  companyId: string
  action: string
  resourceType: string
  resourceId: string
  userId: string
  userName: string
  userRole: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

/**
 * AuditService — append-only event log.
 *
 * Subscribes to ALL domain events via eventBus.onAll().
 * Records are NEVER updated or deleted (enforced at DB level via no UPDATE/DELETE grants).
 *
 * Future microservice path:
 *   Replace eventBus.onAll() with a BullMQ consumer on the 'audit' queue.
 */
@Injectable()
export class AuditService implements OnModuleInit {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  onModuleInit() {
    // Subscribe to all domain events and log them
    eventBus.onAll(async ({ event, payload }) => {
      try {
        const p = payload as any
        if (!p?.companyId && !p?.userId) return // skip system events without context

        await this.auditRepo.save(
          this.auditRepo.create({
            companyId: p.companyId ?? 'system',
            action: event,
            resourceType: this.inferResourceType(event),
            resourceId: p.leadId ?? p.vehicleId ?? p.userId ?? '',
            userId: p.userId ?? p.by ?? 'system',
            userName: p.userName ?? '',
            userRole: p.userRole ?? '',
            metadata: p,
          }),
        )
      } catch (err) {
        // Never throw from audit handler — log to stderr
        console.error('[AuditService] Failed to write audit log:', err)
      }
    })
  }

  private inferResourceType(event: string): string {
    if (event.startsWith('lead.'))    return 'lead'
    if (event.startsWith('vehicle.')) return 'vehicle'
    if (event.startsWith('auth.'))    return 'auth'
    if (event.startsWith('billing.')) return 'billing'
    return 'system'
  }

  async log(params: LogActionParams): Promise<AuditLogEntity> {
    const entry = this.auditRepo.create({
      ...params,
      metadata: params.metadata ?? {},
    })
    return this.auditRepo.save(entry)
  }

  async findAll(companyId: string, user: any, opts: { page?: number; limit?: number } = {}) {
    if (!can(user, 'audit.view')) throw new ForbiddenException()

    const { page = 1, limit = 100 } = opts
    const [data, total] = await this.auditRepo.findAndCount({
      where: { companyId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })
    return { data, total }
  }
}
