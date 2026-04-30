/**
 * @package @autocrm/shared-types
 * Shared domain types used across web, api and services.
 * Single source of truth for all entities.
 */

// ─── Roles & Permissions ────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'salesperson'

export const ROLES = {
  ADMIN: 'admin' as UserRole,
  MANAGER: 'manager' as UserRole,
  SALESPERSON: 'salesperson' as UserRole,
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Directeur',
  manager: 'Manager',
  salesperson: 'Vendeur',
}

// ─── Vehicle ────────────────────────────────────────────────────────────────

export type VehicleStatus = 'Disponible' | 'Réservé' | 'Vendu' | 'Archivé'

export interface VehiclePhoto {
  url: string
  name: string
  size: number
  addedBy: string
  addedAt: string
}

export interface VehicleStatusHistoryEntry {
  from: VehicleStatus
  to: VehicleStatus
  by: string
  byName: string
  at: string
  action: string
}

export interface Vehicle {
  id: string
  companyId: string
  make: string
  model: string
  year: number
  price: number
  mileage: number
  fuel: VehicleFuel
  color: string
  vin: string
  status: VehicleStatus
  features: string[]
  photos: VehiclePhoto[]
  statusHistory: VehicleStatusHistoryEntry[]
  reservedBy: string | null
  reservedAt: string | null
  soldBy: string | null
  soldAt: string | null
  createdAt: string
  updatedAt: string
}

export type VehicleFuel = 'Diesel' | 'Essence' | 'Hybride' | 'Électrique' | 'GPL'

export const VEHICLE_STATUS: Record<string, VehicleStatus> = {
  AVAILABLE: 'Disponible',
  RESERVED: 'Réservé',
  SOLD: 'Vendu',
  ARCHIVED: 'Archivé',
}

// ─── Lead ───────────────────────────────────────────────────────────────────

export type LeadStage =
  | 'Nouveau'
  | 'Contacté'
  | 'Qualifié'
  | 'Essai'
  | 'Négociation'
  | 'Gagné'
  | 'Perdu'

export const LEAD_STAGES: LeadStage[] = [
  'Nouveau', 'Contacté', 'Qualifié', 'Essai', 'Négociation', 'Gagné', 'Perdu',
]

export type LeadSource =
  | 'Site web'
  | 'Leboncoin'
  | 'AutoScout24'
  | 'LaVieAuto'
  | 'Téléphone'
  | 'Passage'
  | 'Référence'
  | 'Facebook'
  | 'Google Ads'
  | 'ParuVendu'

export const LEAD_SOURCES: LeadSource[] = [
  'Site web', 'Leboncoin', 'AutoScout24', 'LaVieAuto',
  'Téléphone', 'Passage', 'Référence', 'Facebook', 'Google Ads', 'ParuVendu',
]

export interface LeadActivity {
  id: number
  type: 'note' | 'call' | 'email' | 'sms' | 'stage_change'
  content: string
  authorId: string
  createdAt: string
}

export interface Lead {
  id: string
  companyId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  stage: LeadStage
  source: LeadSource
  assignedTo: string
  createdBy: string
  vehicleInterest: string | null
  budget: number
  notes: string
  tags: string[]
  activities: LeadActivity[]
  slaHours: number
  slaBreached: boolean
  createdAt: string
  updatedAt: string
  lastContact: string | null
}

// ─── User ───────────────────────────────────────────────────────────────────

export interface User {
  id: string
  companyId: string
  name: string
  email: string
  role: UserRole
  avatar: string
  phone: string
  active: boolean
  createdAt: string
}

// ─── Company / Tenant ───────────────────────────────────────────────────────

export type Plan = 'starter' | 'pro' | 'enterprise'

export interface FeatureFlags {
  automation: boolean
  sms: boolean
  advancedReports: boolean
}

export interface Company {
  id: string
  name: string
  plan: Plan
  address: string
  phone: string
  email: string
  featureFlags: FeatureFlags
  createdAt: string
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  companyId: string
  action: string
  resourceType: string
  resourceId: string
  userId: string
  metadata: Record<string, unknown>
  createdAt: string
}

// ─── Notification ───────────────────────────────────────────────────────────

export interface Notification {
  id: string
  companyId: string
  userId: string
  type: string
  message: string
  read: boolean
  createdAt: string
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  meta?: {
    total: number
    page: number
    limit: number
  }
}

export interface ApiError {
  statusCode: number
  message: string
  error: string
}

// ─── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateLeadDto {
  firstName: string
  lastName: string
  email: string
  phone: string
  source: LeadSource
  stage?: LeadStage
  assignedTo: string
  vehicleInterest?: string
  budget: number
  notes?: string
  tags?: string[]
}

export interface UpdateLeadDto extends Partial<CreateLeadDto> {
  stage?: LeadStage
  slaBreached?: boolean
}

export interface CreateVehicleDto {
  make: string
  model: string
  year: number
  price: number
  mileage: number
  fuel: VehicleFuel
  color: string
  vin: string
  features?: string[]
}

export interface UpdateVehicleStatusDto {
  status: VehicleStatus
  reason?: string
}

export interface LoginDto {
  email: string
  password: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: User
}
