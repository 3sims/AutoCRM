import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, FindManyOptions, ILike } from 'typeorm'
import { LeadEntity } from './lead.entity'
import { eventBus } from '@autocrm/events'
import { can } from '@autocrm/utils/permissions'
import type { CreateLeadDto, UpdateLeadDto, LeadStage } from '@autocrm/shared-types'

interface RequestUser {
  id: string
  role: 'admin' | 'manager' | 'salesperson'
  companyId: string
}

interface FindLeadsOptions {
  companyId: string
  stage?: LeadStage
  assignedTo?: string
  source?: string
  search?: string
  page?: number
  limit?: number
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadRepo: Repository<LeadEntity>,
  ) {}

  // ── Tenant-scoped find ────────────────────────────────────────────────────

  async findAll(opts: FindLeadsOptions, user: RequestUser): Promise<{ data: LeadEntity[]; total: number }> {
    const { companyId, stage, assignedTo, source, search, page = 1, limit = 50 } = opts

    const where: any = { companyId }

    // Salesperson: only their leads
    if (user.role === 'salesperson') where.assignedTo = user.id
    else if (assignedTo) where.assignedTo = assignedTo

    if (stage) where.stage = stage
    if (source) where.source = source

    const qb = this.leadRepo.createQueryBuilder('lead')
      .where('lead.company_id = :companyId', { companyId })

    if (user.role === 'salesperson') qb.andWhere('lead.assigned_to = :userId', { userId: user.id })
    else if (assignedTo) qb.andWhere('lead.assigned_to = :assignedTo', { assignedTo })

    if (stage)  qb.andWhere('lead.stage = :stage', { stage })
    if (source) qb.andWhere('lead.source = :source', { source })
    if (search) {
      qb.andWhere(
        '(lead.first_name ILIKE :q OR lead.last_name ILIKE :q OR lead.email ILIKE :q OR lead.phone ILIKE :q)',
        { q: `%${search}%` }
      )
    }

    const [data, total] = await qb
      .orderBy('lead.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return { data, total }
  }

  async findOne(id: string, companyId: string): Promise<LeadEntity> {
    const lead = await this.leadRepo.findOne({ where: { id, companyId } })
    if (!lead) throw new NotFoundException(`Lead ${id} not found`)
    return lead
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateLeadDto, user: RequestUser): Promise<LeadEntity> {
    if (!can(user, 'lead.create')) throw new ForbiddenException()

    // Salesperson can only assign to themselves
    const assignedTo = user.role === 'salesperson' ? user.id : (dto.assignedTo ?? user.id)

    const lead = this.leadRepo.create({
      ...dto,
      companyId: user.companyId,
      assignedTo,
      createdBy: user.id,
      stage: dto.stage ?? 'Nouveau',
      slaHours: 24,
      slaBreached: false,
      activities: [],
      tags: dto.tags ?? [],
    })

    await this.leadRepo.save(lead)

    eventBus.emit('lead.created', {
      leadId: lead.id,
      companyId: user.companyId,
      assignedTo: lead.assignedTo ?? '',
      source: lead.source,
    })

    return lead
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateLeadDto, user: RequestUser): Promise<LeadEntity> {
    const lead = await this.findOne(id, user.companyId)

    if (!can(user, 'lead.edit', lead)) throw new ForbiddenException('Cannot edit this lead')

    // Stage change validation (SoD)
    if (dto.stage && dto.stage !== lead.stage) {
      await this.validateStageChange(lead, dto.stage, user)
    }

    Object.assign(lead, dto)
    await this.leadRepo.save(lead)

    eventBus.emit('lead.stage_changed', {
      leadId: lead.id,
      from: lead.stage,
      to: dto.stage ?? lead.stage,
      userId: user.id,
    })

    return lead
  }

  async changeStage(id: string, newStage: LeadStage, user: RequestUser): Promise<LeadEntity> {
    const lead = await this.findOne(id, user.companyId)
    await this.validateStageChange(lead, newStage, user)

    const prevStage = lead.stage
    lead.stage = newStage
    await this.leadRepo.save(lead)

    eventBus.emit('lead.stage_changed', { leadId: id, from: prevStage, to: newStage, userId: user.id })

    if (newStage === 'Gagné') eventBus.emit('lead.won', { leadId: id, value: lead.budget })
    if (newStage === 'Perdu') eventBus.emit('lead.lost', { leadId: id })

    return lead
  }

  private async validateStageChange(lead: LeadEntity, newStage: LeadStage, user: RequestUser) {
    const wasClosedStage = ['Gagné', 'Perdu'].includes(lead.stage)
    const willReopen = wasClosedStage && !['Gagné', 'Perdu'].includes(newStage)

    if (willReopen && !can(user, 'lead.reopen')) {
      throw new ForbiddenException('Only managers can reopen closed leads')
    }
    if (newStage === 'Gagné' && !can(user, 'lead.mark_won')) {
      throw new ForbiddenException('Only managers can mark a lead as Won')
    }
    if (newStage === 'Perdu' && !can(user, 'lead.mark_lost', lead)) {
      throw new ForbiddenException('Cannot mark this lead as Lost')
    }
    if (!can(user, 'lead.change_stage', lead)) {
      throw new ForbiddenException('Cannot change stage of this lead')
    }
  }

  // ── Add activity / note ───────────────────────────────────────────────────

  async addNote(id: string, content: string, user: RequestUser): Promise<LeadEntity> {
    if (!can(user, 'lead.add_note')) throw new ForbiddenException()
    const lead = await this.findOne(id, user.companyId)

    const note = { id: Date.now(), type: 'note', content, authorId: user.id, createdAt: new Date().toISOString() }
    lead.activities = [...lead.activities, note] as any

    await this.leadRepo.save(lead)
    eventBus.emit('lead.note_added', { leadId: id, userId: user.id })
    return lead
  }

  // ── Assign ────────────────────────────────────────────────────────────────

  async assign(id: string, toUserId: string, user: RequestUser): Promise<LeadEntity> {
    const lead = await this.findOne(id, user.companyId)

    const isReassign = lead.assignedTo && lead.assignedTo !== toUserId
    const perm = isReassign ? 'lead.reassign' : 'lead.assign'

    if (!can(user, perm)) throw new ForbiddenException(`Permission "${perm}" required`)

    const fromUserId = lead.assignedTo
    lead.assignedTo = toUserId
    await this.leadRepo.save(lead)

    eventBus.emit('lead.assigned', { leadId: id, fromUserId, toUserId })
    return lead
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async remove(id: string, user: RequestUser): Promise<void> {
    if (!can(user, 'lead.delete')) throw new ForbiddenException('Only admins can delete leads')
    const lead = await this.findOne(id, user.companyId)
    await this.leadRepo.remove(lead)
  }

  // ── SLA checker (called by automation cron) ───────────────────────────────

  async checkSla(companyId: string): Promise<void> {
    const openLeads = await this.leadRepo
      .createQueryBuilder('lead')
      .where('lead.company_id = :companyId', { companyId })
      .andWhere("lead.stage NOT IN ('Gagné', 'Perdu')")
      .andWhere('lead.sla_breached = false')
      .getMany()

    const now = Date.now()
    for (const lead of openLeads) {
      const ageHours = (now - lead.createdAt.getTime()) / 3_600_000
      if (ageHours > lead.slaHours) {
        lead.slaBreached = true
        await this.leadRepo.save(lead)
        eventBus.emit('lead.sla_breached', { leadId: lead.id, hoursOverdue: Math.floor(ageHours - lead.slaHours) })
      }
    }
  }
}
