import { can, getAllowedTransitions } from '../permissions'

const admin       = { id: 'u1', role: 'admin' as const }
const manager     = { id: 'u2', role: 'manager' as const }
const salesperson = { id: 'u3', role: 'salesperson' as const }
const otherSales  = { id: 'u4', role: 'salesperson' as const }

describe('Permission Engine — SoD', () => {

  // ── Vehicles ──────────────────────────────────────────────────────────────

  describe('vehicle.status.reserve', () => {
    it('allows admin to reserve', () => expect(can(admin, 'vehicle.status.reserve')).toBe(true))
    it('allows manager to reserve', () => expect(can(manager, 'vehicle.status.reserve')).toBe(true))
    it('allows salesperson to reserve', () => expect(can(salesperson, 'vehicle.status.reserve')).toBe(true))
  })

  describe('vehicle.status.unreserve (ownerOnly)', () => {
    const reservedByU3 = { reservedBy: 'u3' }
    const reservedByU4 = { reservedBy: 'u4' }

    it('admin can always unreserve', () => expect(can(admin, 'vehicle.status.unreserve', reservedByU4)).toBe(true))
    it('manager can always unreserve', () => expect(can(manager, 'vehicle.status.unreserve', reservedByU4)).toBe(true))
    it('salesperson can unreserve their OWN reservation', () => expect(can(salesperson, 'vehicle.status.unreserve', reservedByU3)).toBe(true))
    it('salesperson CANNOT unreserve someone else\'s reservation', () => expect(can(salesperson, 'vehicle.status.unreserve', reservedByU4)).toBe(false))
  })

  describe('vehicle.status.unsell', () => {
    it('only admin can unsell', () => expect(can(admin, 'vehicle.status.unsell')).toBe(true))
    it('manager CANNOT unsell', () => expect(can(manager, 'vehicle.status.unsell')).toBe(false))
    it('salesperson CANNOT unsell', () => expect(can(salesperson, 'vehicle.status.unsell')).toBe(false))
  })

  describe('vehicle.status.sell', () => {
    it('admin can sell', () => expect(can(admin, 'vehicle.status.sell')).toBe(true))
    it('manager can sell', () => expect(can(manager, 'vehicle.status.sell')).toBe(true))
    it('salesperson CANNOT sell', () => expect(can(salesperson, 'vehicle.status.sell')).toBe(false))
  })

  // ── Leads ─────────────────────────────────────────────────────────────────

  describe('lead.mark_won', () => {
    it('admin can mark won', () => expect(can(admin, 'lead.mark_won')).toBe(true))
    it('manager can mark won', () => expect(can(manager, 'lead.mark_won')).toBe(true))
    it('salesperson CANNOT mark won', () => expect(can(salesperson, 'lead.mark_won')).toBe(false))
  })

  describe('lead.reopen', () => {
    it('admin can reopen', () => expect(can(admin, 'lead.reopen')).toBe(true))
    it('manager can reopen', () => expect(can(manager, 'lead.reopen')).toBe(true))
    it('salesperson CANNOT reopen', () => expect(can(salesperson, 'lead.reopen')).toBe(false))
  })

  describe('lead.delete', () => {
    it('only admin can delete leads', () => expect(can(admin, 'lead.delete')).toBe(true))
    it('manager CANNOT delete leads', () => expect(can(manager, 'lead.delete')).toBe(false))
    it('salesperson CANNOT delete leads', () => expect(can(salesperson, 'lead.delete')).toBe(false))
  })

  describe('lead.reassign', () => {
    it('admin can reassign', () => expect(can(admin, 'lead.reassign')).toBe(true))
    it('manager CANNOT reassign', () => expect(can(manager, 'lead.reassign')).toBe(false))
  })

  // ── Reports ───────────────────────────────────────────────────────────────

  describe('reports.view_all', () => {
    it('admin can view all reports', () => expect(can(admin, 'reports.view_all')).toBe(true))
    it('manager can view all reports', () => expect(can(manager, 'reports.view_all')).toBe(true))
    it('salesperson CANNOT view all reports', () => expect(can(salesperson, 'reports.view_all')).toBe(false))
  })

  // ── Team ──────────────────────────────────────────────────────────────────

  describe('team.invite', () => {
    it('only admin can invite', () => expect(can(admin, 'team.invite')).toBe(true))
    it('manager CANNOT invite', () => expect(can(manager, 'team.invite')).toBe(false))
    it('salesperson CANNOT invite', () => expect(can(salesperson, 'team.invite')).toBe(false))
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('null user returns false', () => expect(can(null, 'lead.create')).toBe(false))
    it('undefined user returns false', () => expect(can(undefined, 'lead.create')).toBe(false))
    it('unknown action returns false', () => expect(can(admin, 'does.not.exist')).toBe(false))
  })

  // ── Status machine transitions ─────────────────────────────────────────────

  describe('getAllowedTransitions', () => {
    it('salesperson gets reserve from Disponible', () => {
      const transitions = getAllowedTransitions('Disponible', {}, salesperson)
      expect(transitions.map(t => t.targetStatus)).toContain('Réservé')
      expect(transitions.map(t => t.targetStatus)).not.toContain('Vendu')
    })

    it('manager gets sell and reserve from Disponible', () => {
      const transitions = getAllowedTransitions('Disponible', {}, manager)
      expect(transitions.map(t => t.targetStatus)).toContain('Réservé')
      expect(transitions.map(t => t.targetStatus)).toContain('Vendu')
    })

    it('only admin gets unsell from Vendu', () => {
      const adminT = getAllowedTransitions('Vendu', {}, admin)
      const managerT = getAllowedTransitions('Vendu', {}, manager)
      expect(adminT.map(t => t.targetStatus)).toContain('Disponible')
      expect(managerT).toHaveLength(0)
    })

    it('salesperson can unreserve their own reservation', () => {
      const transitions = getAllowedTransitions('Réservé', { reservedBy: 'u3' }, salesperson)
      expect(transitions.map(t => t.targetStatus)).toContain('Disponible')
    })

    it('salesperson CANNOT unreserve someone else\'s reservation', () => {
      const transitions = getAllowedTransitions('Réservé', { reservedBy: 'u4' }, salesperson)
      const unreserveTargets = transitions.filter(t => t.action === 'vehicle.status.unreserve')
      expect(unreserveTargets).toHaveLength(0)
    })
  })
})
