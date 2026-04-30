/**
 * Segregation of Duties (SoD) — Permission Engine
 *
 * Central authority for all action-level access control.
 * Used by both frontend (UI gating) and backend (guard middleware).
 *
 * Design:
 *   - Every action maps to allowed roles
 *   - ownerOnly: salesperson can only act on records they own
 *   - Backend MUST re-validate — frontend gating is UX only
 */

import type { UserRole } from '@autocrm/shared-types'

export interface Permission {
  roles: UserRole[]
  /** If true, a salesperson can only act on records they own (assignedTo / reservedBy / createdBy) */
  ownerOnly?: boolean
}

export const PERMISSIONS: Record<string, Permission> = {
  // ── Vehicles ──────────────────────────────────────────────────────────────
  'vehicle.create':                { roles: ['admin', 'manager'] },
  'vehicle.edit':                  { roles: ['admin', 'manager'] },
  'vehicle.delete':                { roles: ['admin'] },
  'vehicle.add_photos':            { roles: ['admin', 'manager', 'salesperson'] },
  'vehicle.delete_photos':         { roles: ['admin', 'manager'] },
  'vehicle.status.reserve':        { roles: ['admin', 'manager', 'salesperson'] },
  'vehicle.status.unreserve':      { roles: ['admin', 'manager', 'salesperson'], ownerOnly: true },
  'vehicle.status.sell':           { roles: ['admin', 'manager'] },
  'vehicle.status.unsell':         { roles: ['admin'] },
  'vehicle.status.archive':        { roles: ['admin', 'manager'] },
  'vehicle.status.unarchive':      { roles: ['admin', 'manager'] },
  'vehicle.status.make_available': { roles: ['admin'] },

  // ── Leads ─────────────────────────────────────────────────────────────────
  'lead.create':       { roles: ['admin', 'manager', 'salesperson'] },
  'lead.edit':         { roles: ['admin', 'manager', 'salesperson'], ownerOnly: true },
  'lead.delete':       { roles: ['admin'] },
  'lead.assign':       { roles: ['admin', 'manager'] },
  'lead.reassign':     { roles: ['admin'] },
  'lead.change_stage': { roles: ['admin', 'manager', 'salesperson'], ownerOnly: true },
  'lead.mark_won':     { roles: ['admin', 'manager'] },
  'lead.mark_lost':    { roles: ['admin', 'manager', 'salesperson'], ownerOnly: true },
  'lead.reopen':       { roles: ['admin', 'manager'] },
  'lead.add_note':     { roles: ['admin', 'manager', 'salesperson'] },
  'lead.delete_note':  { roles: ['admin'], ownerOnly: true },

  // ── Pipeline ──────────────────────────────────────────────────────────────
  'pipeline.view':      { roles: ['admin', 'manager', 'salesperson'] },
  'pipeline.move_own':  { roles: ['admin', 'manager', 'salesperson'], ownerOnly: true },
  'pipeline.move_any':  { roles: ['admin', 'manager'] },

  // ── Reports ───────────────────────────────────────────────────────────────
  'reports.view_own': { roles: ['admin', 'manager', 'salesperson'] },
  'reports.view_all': { roles: ['admin', 'manager'] },
  'reports.export':   { roles: ['admin', 'manager'] },

  // ── Team ──────────────────────────────────────────────────────────────────
  'team.view':        { roles: ['admin', 'manager'] },
  'team.invite':      { roles: ['admin'] },
  'team.deactivate':  { roles: ['admin'] },
  'team.change_role': { roles: ['admin'] },

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings.view':               { roles: ['admin', 'manager'] },
  'settings.edit_company':       { roles: ['admin'] },
  'settings.edit_plan':          { roles: ['admin'] },
  'settings.edit_notifications': { roles: ['admin', 'manager', 'salesperson'] },
  'settings.view_audit':         { roles: ['admin', 'manager'] },
  'settings.manage_integrations':{ roles: ['admin'] },

  // ── Messaging ─────────────────────────────────────────────────────────────
  'messaging.send':     { roles: ['admin', 'manager', 'salesperson'], ownerOnly: true },
  'messaging.view_all': { roles: ['admin', 'manager'] },
  'messaging.view_own': { roles: ['admin', 'manager', 'salesperson'] },

  // ── Billing ───────────────────────────────────────────────────────────────
  'billing.view':    { roles: ['admin'] },
  'billing.upgrade': { roles: ['admin'] },

  // ── Audit ─────────────────────────────────────────────────────────────────
  'audit.view': { roles: ['admin', 'manager'] },
}

// ─── Record ownership shape ──────────────────────────────────────────────────

export interface OwnableRecord {
  assignedTo?: string | null
  reservedBy?: string | null
  createdBy?: string | null
  authorId?: string | null
}

// ─── Permission check function ───────────────────────────────────────────────

export interface CanUser {
  id: string
  role: UserRole
}

/**
 * Check if a user has permission to perform an action.
 *
 * @param user    - The user attempting the action
 * @param action  - The permission key (e.g. 'vehicle.status.unreserve')
 * @param record  - Optional: the record being acted on (for ownerOnly checks)
 */
export function can(
  user: CanUser | null | undefined,
  action: string,
  record?: OwnableRecord | null
): boolean {
  if (!user) return false

  const perm = PERMISSIONS[action]
  if (!perm) {
    console.warn(`[SoD] Unknown permission: "${action}"`)
    return false
  }

  if (!perm.roles.includes(user.role)) return false

  // ownerOnly: admins and managers always pass; salesperson must own the record
  if (perm.ownerOnly && user.role === 'salesperson') {
    if (!record) return false
    const ownerId =
      record.assignedTo ?? record.reservedBy ?? record.createdBy ?? record.authorId
    if (!ownerId || ownerId !== user.id) return false
  }

  return true
}

// ─── Vehicle Status State Machine ────────────────────────────────────────────

export interface StatusTransition {
  action: string
  label: string
  icon: string
  targetStatus: string
  color: string
  /** Requires the acting user to be the one who set the current status */
  ownerSensitive?: boolean
  /** Displayed only to admin */
  adminOnly?: boolean
}

export const STATUS_TRANSITIONS: Record<string, StatusTransition[]> = {
  Disponible: [
    { action: 'vehicle.status.reserve',  label: 'Réserver',       icon: '🔒', targetStatus: 'Réservé',    color: '#F59E0B' },
    { action: 'vehicle.status.sell',     label: 'Marquer vendu',  icon: '✅', targetStatus: 'Vendu',      color: '#10B981' },
    { action: 'vehicle.status.archive',  label: 'Archiver',       icon: '📦', targetStatus: 'Archivé',    color: '#6B7280' },
  ],
  Réservé: [
    { action: 'vehicle.status.unreserve',      label: 'Annuler réservation',    icon: '🔓', targetStatus: 'Disponible', color: '#EF4444', ownerSensitive: true },
    { action: 'vehicle.status.sell',           label: 'Confirmer vente',        icon: '✅', targetStatus: 'Vendu',      color: '#10B981' },
    { action: 'vehicle.status.make_available', label: 'Forcer disponible',      icon: '⚡', targetStatus: 'Disponible', color: '#8B5CF6', adminOnly: true },
  ],
  Vendu: [
    { action: 'vehicle.status.unsell', label: 'Annuler la vente', icon: '↩️', targetStatus: 'Disponible', color: '#EF4444', adminOnly: true },
  ],
  Archivé: [
    { action: 'vehicle.status.unarchive', label: 'Désarchiver', icon: '📤', targetStatus: 'Disponible', color: '#3B82F6' },
  ],
}

/**
 * Get the allowed transitions for a vehicle given the current user.
 */
export function getAllowedTransitions(
  vehicleStatus: string,
  vehicle: OwnableRecord,
  user: CanUser
): StatusTransition[] {
  const transitions = STATUS_TRANSITIONS[vehicleStatus] ?? []
  return transitions.filter((t) => {
    if (!can(user, t.action, vehicle)) return false
    if (t.ownerSensitive && user.role === 'salesperson') {
      return (vehicle as { reservedBy?: string | null }).reservedBy === user.id
    }
    return true
  })
}
