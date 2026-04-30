import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { VehicleEntity } from './vehicle.entity'
import { eventBus } from '@autocrm/events'
import { can, getAllowedTransitions, STATUS_TRANSITIONS } from '@autocrm/utils/permissions'
import type { CreateVehicleDto, VehicleStatus, VehiclePhoto } from '@autocrm/shared-types'

interface RequestUser {
  id: string
  name: string
  role: 'admin' | 'manager' | 'salesperson'
  companyId: string
}

interface FindVehiclesOptions {
  status?: VehicleStatus
  fuel?: string
  search?: string
  page?: number
  limit?: number
}

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly vehicleRepo: Repository<VehicleEntity>,
  ) {}

  // ── Find ─────────────────────────────────────────────────────────────────

  async findAll(companyId: string, opts: FindVehiclesOptions = {}) {
    const { status, fuel, search, page = 1, limit = 50 } = opts

    const qb = this.vehicleRepo.createQueryBuilder('v')
      .where('v.company_id = :companyId', { companyId })

    if (status) qb.andWhere('v.status = :status', { status })
    if (fuel)   qb.andWhere('v.fuel = :fuel', { fuel })
    if (search) {
      qb.andWhere(
        '(v.make ILIKE :q OR v.model ILIKE :q OR v.color ILIKE :q OR v.vin ILIKE :q)',
        { q: `%${search}%` },
      )
    }

    const [data, total] = await qb
      .orderBy('v.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return { data, total }
  }

  async findOne(id: string, companyId: string): Promise<VehicleEntity> {
    const v = await this.vehicleRepo.findOne({ where: { id, companyId } })
    if (!v) throw new NotFoundException(`Vehicle ${id} not found`)
    return v
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateVehicleDto, user: RequestUser): Promise<VehicleEntity> {
    if (!can(user, 'vehicle.create')) throw new ForbiddenException()

    const vehicle = this.vehicleRepo.create({
      ...dto,
      companyId: user.companyId,
      createdBy: user.id,
      status: 'Disponible',
      photos: [],
      statusHistory: [],
      features: dto.features ?? [],
    })

    await this.vehicleRepo.save(vehicle)
    eventBus.emit('vehicle.created', { vehicleId: vehicle.id, companyId: user.companyId })
    return vehicle
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: Partial<CreateVehicleDto>, user: RequestUser): Promise<VehicleEntity> {
    if (!can(user, 'vehicle.edit')) throw new ForbiddenException()
    const vehicle = await this.findOne(id, user.companyId)
    Object.assign(vehicle, dto)
    return this.vehicleRepo.save(vehicle)
  }

  // ── Status transition (core SoD logic) ───────────────────────────────────

  async transition(
    id: string,
    targetStatus: VehicleStatus,
    user: RequestUser,
    reason?: string,
  ): Promise<VehicleEntity> {
    const vehicle = await this.findOne(id, user.companyId)

    // Find the matching transition definition
    const transitions = STATUS_TRANSITIONS[vehicle.status] ?? []
    const transition = transitions.find(t => t.targetStatus === targetStatus)

    if (!transition) {
      throw new ForbiddenException(
        `Transition from "${vehicle.status}" to "${targetStatus}" is not defined`,
      )
    }

    // SoD permission check
    if (!can(user, transition.action, vehicle)) {
      throw new ForbiddenException(
        `Action "${transition.action}" not allowed for role "${user.role}"`,
      )
    }

    // ownerOnly check: only the person who reserved can unreserve (unless admin/manager)
    if (
      transition.ownerSensitive &&
      user.role === 'salesperson' &&
      vehicle.reservedBy !== user.id
    ) {
      throw new ForbiddenException(
        'Only the salesperson who made the reservation (or a manager) can cancel it',
      )
    }

    // Append immutable status history entry
    const historyEntry = {
      from: vehicle.status,
      to: targetStatus,
      by: user.id,
      byName: user.name,
      at: new Date().toISOString(),
      action: transition.action,
      reason: reason ?? null,
    }
    vehicle.statusHistory = [...vehicle.statusHistory, historyEntry as any]

    // Update status and ownership fields
    const prevStatus = vehicle.status
    vehicle.status = targetStatus

    switch (targetStatus) {
      case 'Réservé':
        vehicle.reservedBy = user.id
        vehicle.reservedAt = new Date()
        break
      case 'Disponible':
        vehicle.reservedBy = null
        vehicle.reservedAt = null
        if (prevStatus === 'Vendu') {
          vehicle.soldBy = null
          vehicle.soldAt = null
        }
        break
      case 'Vendu':
        vehicle.soldBy = user.id
        vehicle.soldAt = new Date()
        break
    }

    await this.vehicleRepo.save(vehicle)

    // Emit domain event
    const eventName = targetStatus === 'Vendu'
      ? 'vehicle.sold'
      : targetStatus === 'Réservé'
        ? 'vehicle.reserved'
        : 'vehicle.status_changed'

    if (targetStatus === 'Vendu') {
      eventBus.emit('vehicle.sold', { vehicleId: id, soldBy: user.id, price: vehicle.price })
    } else if (targetStatus === 'Réservé') {
      eventBus.emit('vehicle.reserved', { vehicleId: id, reservedBy: user.id })
    } else if (prevStatus === 'Réservé' && targetStatus === 'Disponible') {
      eventBus.emit('vehicle.unreserved', { vehicleId: id, unreservedBy: user.id })
    } else {
      eventBus.emit('vehicle.status_changed', {
        vehicleId: id, from: prevStatus, to: targetStatus, userId: user.id,
      })
    }

    return vehicle
  }

  // ── Photos ────────────────────────────────────────────────────────────────

  async addPhoto(id: string, photo: VehiclePhoto, user: RequestUser): Promise<VehicleEntity> {
    if (!can(user, 'vehicle.add_photos')) throw new ForbiddenException()
    const vehicle = await this.findOne(id, user.companyId)
    vehicle.photos = [...vehicle.photos, photo]
    await this.vehicleRepo.save(vehicle)
    eventBus.emit('vehicle.photo_added', { vehicleId: id, userId: user.id })
    return vehicle
  }

  async removePhoto(id: string, photoIndex: number, user: RequestUser): Promise<VehicleEntity> {
    if (!can(user, 'vehicle.delete_photos')) throw new ForbiddenException()
    const vehicle = await this.findOne(id, user.companyId)
    vehicle.photos = vehicle.photos.filter((_, i) => i !== photoIndex)
    return this.vehicleRepo.save(vehicle)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async remove(id: string, user: RequestUser): Promise<void> {
    if (!can(user, 'vehicle.delete')) throw new ForbiddenException()
    const vehicle = await this.findOne(id, user.companyId)
    await this.vehicleRepo.remove(vehicle)
  }
}
