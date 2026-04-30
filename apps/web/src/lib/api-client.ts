/**
 * API Client — typed HTTP client for the AutoCRM NestJS backend.
 *
 * Usage (in React components / hooks):
 *   import { apiClient } from '@/lib/api-client'
 *   const leads = await apiClient.leads.findAll({ stage: 'Nouveau' })
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import type {
  Lead, Vehicle, User, AuthTokens,
  CreateLeadDto, UpdateLeadDto,
  CreateVehicleDto, VehicleStatus,
  LeadStage, ApiResponse,
} from '@autocrm/shared-types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

class ApiClient {
  private http: AxiosInstance
  private refreshPromise: Promise<void> | null = null

  constructor() {
    this.http = axios.create({
      baseURL: `${BASE_URL}/api`,
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    })

    // ── Request interceptor: attach access token ──────────────────────────
    this.http.interceptors.request.use((config) => {
      const token = this.getAccessToken()
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })

    // ── Response interceptor: auto-refresh on 401 ─────────────────────────
    this.http.interceptors.response.use(
      (res) => res,
      async (err) => {
        const original = err.config
        if (err.response?.status === 401 && !original._retry) {
          original._retry = true
          await this.refreshTokens()
          return this.http(original)
        }
        return Promise.reject(err)
      }
    )
  }

  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('autocrm_access_token')
  }

  private setTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>) {
    localStorage.setItem('autocrm_access_token', tokens.accessToken)
    localStorage.setItem('autocrm_refresh_token', tokens.refreshToken)
  }

  private async refreshTokens(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = (async () => {
      const refreshToken = localStorage.getItem('autocrm_refresh_token')
      if (!refreshToken) throw new Error('No refresh token')
      const res = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken })
      this.setTokens(res.data)
    })().finally(() => { this.refreshPromise = null })
    return this.refreshPromise
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  auth = {
    login: async (email: string, password: string): Promise<AuthTokens> => {
      const { data } = await this.http.post<AuthTokens>('/auth/login', { email, password })
      this.setTokens(data)
      return data
    },
    logout: async (): Promise<void> => {
      await this.http.post('/auth/logout')
      localStorage.removeItem('autocrm_access_token')
      localStorage.removeItem('autocrm_refresh_token')
    },
    me: async (): Promise<User> => {
      const { data } = await this.http.get<User>('/auth/me')
      return data
    },
  }

  // ── Leads ───────────────────────────────────────────────────────────────

  leads = {
    findAll: async (params?: {
      stage?: LeadStage; assignedTo?: string; source?: string
      search?: string; page?: number; limit?: number
    }): Promise<ApiResponse<Lead[]>> => {
      const { data } = await this.http.get('/leads', { params })
      return data
    },
    findOne: async (id: string): Promise<Lead> => {
      const { data } = await this.http.get(`/leads/${id}`)
      return data
    },
    create: async (dto: CreateLeadDto): Promise<Lead> => {
      const { data } = await this.http.post('/leads', dto)
      return data
    },
    update: async (id: string, dto: UpdateLeadDto): Promise<Lead> => {
      const { data } = await this.http.patch(`/leads/${id}`, dto)
      return data
    },
    changeStage: async (id: string, stage: LeadStage): Promise<Lead> => {
      const { data } = await this.http.patch(`/leads/${id}/stage`, { stage })
      return data
    },
    addNote: async (id: string, content: string): Promise<Lead> => {
      const { data } = await this.http.post(`/leads/${id}/notes`, { content })
      return data
    },
    assign: async (id: string, userId: string): Promise<Lead> => {
      const { data } = await this.http.patch(`/leads/${id}/assign`, { userId })
      return data
    },
    remove: async (id: string): Promise<void> => {
      await this.http.delete(`/leads/${id}`)
    },
  }

  // ── Vehicles ────────────────────────────────────────────────────────────

  vehicles = {
    findAll: async (params?: {
      status?: VehicleStatus; fuel?: string; search?: string
      page?: number; limit?: number
    }): Promise<ApiResponse<Vehicle[]>> => {
      const { data } = await this.http.get('/vehicles', { params })
      return data
    },
    findOne: async (id: string): Promise<Vehicle> => {
      const { data } = await this.http.get(`/vehicles/${id}`)
      return data
    },
    create: async (dto: CreateVehicleDto): Promise<Vehicle> => {
      const { data } = await this.http.post('/vehicles', dto)
      return data
    },
    update: async (id: string, dto: Partial<CreateVehicleDto>): Promise<Vehicle> => {
      const { data } = await this.http.patch(`/vehicles/${id}`, dto)
      return data
    },
    transition: async (id: string, targetStatus: VehicleStatus, reason?: string): Promise<Vehicle> => {
      const { data } = await this.http.patch(`/vehicles/${id}/status`, { targetStatus, reason })
      return data
    },
    uploadPhotos: async (id: string, files: File[]): Promise<{ uploaded: number; photos: object[] }> => {
      const formData = new FormData()
      files.forEach(f => formData.append('photos', f))
      const { data } = await this.http.post(`/vehicles/${id}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    removePhoto: async (id: string, photoIndex: number): Promise<Vehicle> => {
      const { data } = await this.http.delete(`/vehicles/${id}/photos/${photoIndex}`)
      return data
    },
    remove: async (id: string): Promise<void> => {
      await this.http.delete(`/vehicles/${id}`)
    },
  }

  // ── Analytics ───────────────────────────────────────────────────────────

  analytics = {
    dashboard: async () => {
      const { data } = await this.http.get('/analytics/dashboard')
      return data
    },
    team: async () => {
      const { data } = await this.http.get('/analytics/team')
      return data
    },
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  messaging = {
    sendEmail: async (params: {
      to: string; subject: string; leadId: string
      templateId?: string; vars?: Record<string, string>; html?: string
    }) => {
      const { data } = await this.http.post('/messaging/email', params)
      return data
    },
    sendSms: async (params: { to: string; body: string; leadId: string }) => {
      const { data } = await this.http.post('/messaging/sms', params)
      return data
    },
  }

  // ── Audit ───────────────────────────────────────────────────────────────

  audit = {
    findAll: async (params?: { page?: number; limit?: number }) => {
      const { data } = await this.http.get('/audit', { params })
      return data
    },
  }
}

export const apiClient = new ApiClient()
