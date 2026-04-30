'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CreateVehicleDto, VehicleStatus } from '@autocrm/shared-types'

export const VEHICLES_KEY = ['vehicles'] as const

export function useVehicles(params?: {
  status?: VehicleStatus; fuel?: string; search?: string
  page?: number; limit?: number
}) {
  return useQuery({
    queryKey: [...VEHICLES_KEY, params],
    queryFn: () => apiClient.vehicles.findAll(params),
    staleTime: 30_000,
  })
}

export function useCreateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateVehicleDto) => apiClient.vehicles.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useVehicleTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, targetStatus, reason }: { id: string; targetStatus: VehicleStatus; reason?: string }) =>
      apiClient.vehicles.transition(id, targetStatus, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useUploadVehiclePhotos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) =>
      apiClient.vehicles.uploadPhotos(id, files),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}
