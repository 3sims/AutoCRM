'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CreateLeadDto, UpdateLeadDto, LeadStage } from '@autocrm/shared-types'

export const LEADS_KEY = ['leads'] as const

export function useLeads(params?: {
  stage?: LeadStage; assignedTo?: string; source?: string
  search?: string; page?: number; limit?: number
}) {
  return useQuery({
    queryKey: [...LEADS_KEY, params],
    queryFn: () => apiClient.leads.findAll(params),
    staleTime: 30_000,
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateLeadDto) => apiClient.leads.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateLeadDto }) =>
      apiClient.leads.update(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}

export function useChangeLeadStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) =>
      apiClient.leads.changeStage(id, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiClient.leads.addNote(id, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}

export function useAssignLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      apiClient.leads.assign(id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_KEY }),
  })
}
