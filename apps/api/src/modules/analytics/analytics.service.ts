import { Injectable, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LeadEntity }    from '../leads/lead.entity'
import { VehicleEntity } from '../vehicles/vehicle.entity'
import { can } from '@autocrm/utils/permissions'

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadRepo: Repository<LeadEntity>,
    @InjectRepository(VehicleEntity)
    private readonly vehicleRepo: Repository<VehicleEntity>,
  ) {}

  async getDashboard(companyId: string, user: any) {
    const canViewAll = can(user, 'reports.view_all')

    // Lead query — scoped by role
    const leadQb = this.leadRepo.createQueryBuilder('l').where('l.company_id = :companyId', { companyId })
    if (!canViewAll) leadQb.andWhere('l.assigned_to = :userId', { userId: user.id })

    const leads = await leadQb.getMany()

    const total       = leads.length
    const open        = leads.filter(l => !['Gagné','Perdu'].includes(l.stage)).length
    const won         = leads.filter(l => l.stage === 'Gagné').length
    const lost        = leads.filter(l => l.stage === 'Perdu').length
    const slaBreached = leads.filter(l => l.slaBreached).length
    const convRate    = total > 0 ? Math.round((won / total) * 100) : 0

    // Stage breakdown
    const stageBreakdown = ['Nouveau','Contacté','Qualifié','Essai','Négociation','Gagné','Perdu'].map(stage => ({
      stage,
      count: leads.filter(l => l.stage === stage).length,
      value: leads.filter(l => l.stage === stage).reduce((a, l) => a + l.budget, 0),
    }))

    // Source ROI
    const sources = [...new Set(leads.map(l => l.source))]
    const sourceBreakdown = sources.map(source => {
      const sourceLeads = leads.filter(l => l.source === source)
      const sourceWon   = sourceLeads.filter(l => l.stage === 'Gagné').length
      return {
        source,
        total: sourceLeads.length,
        won: sourceWon,
        rate: sourceLeads.length > 0 ? Math.round((sourceWon / sourceLeads.length) * 100) : 0,
      }
    }).sort((a, b) => b.won - a.won)

    // Vehicle stats
    const vehicles = await this.vehicleRepo.find({ where: { companyId } })
    const vehicleStats = {
      total: vehicles.length,
      available: vehicles.filter(v => v.status === 'Disponible').length,
      reserved:  vehicles.filter(v => v.status === 'Réservé').length,
      sold:      vehicles.filter(v => v.status === 'Vendu').length,
      archived:  vehicles.filter(v => v.status === 'Archivé').length,
      totalStockValue: vehicles.filter(v => v.status === 'Disponible').reduce((a, v) => a + v.price, 0),
    }

    // Monthly trend (last 6 months)
    const now = new Date()
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const monthLeads = leads.filter(l => {
        const ca = new Date(l.createdAt)
        return ca >= d && ca < next
      })
      return {
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        leads: monthLeads.length,
        won: monthLeads.filter(l => l.stage === 'Gagné').length,
        value: monthLeads.reduce((a, l) => a + l.budget, 0),
      }
    })

    return {
      leads: { total, open, won, lost, slaBreached, convRate, stageBreakdown, sourceBreakdown, monthly },
      vehicles: vehicleStats,
    }
  }

  async getUserPerformance(companyId: string, user: any) {
    if (!can(user, 'reports.view_all')) throw new ForbiddenException()

    const leads = await this.leadRepo.find({ where: { companyId } })

    const userIds = [...new Set(leads.map(l => l.assignedTo).filter(Boolean))] as string[]
    return userIds.map(userId => {
      const userLeads = leads.filter(l => l.assignedTo === userId)
      const won = userLeads.filter(l => l.stage === 'Gagné').length
      return {
        userId,
        totalLeads: userLeads.length,
        won,
        lost: userLeads.filter(l => l.stage === 'Perdu').length,
        open: userLeads.filter(l => !['Gagné','Perdu'].includes(l.stage)).length,
        convRate: userLeads.length > 0 ? Math.round((won / userLeads.length) * 100) : 0,
        avgBudget: userLeads.length > 0 ? Math.round(userLeads.reduce((a, l) => a + l.budget, 0) / userLeads.length) : 0,
      }
    })
  }
}
