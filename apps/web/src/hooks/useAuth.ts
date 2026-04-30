'use client'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import type { User } from '@autocrm/shared-types'

/**
 * useAuth — connects the frontend AutoCRMApp to the real NestJS backend.
 *
 * In demo mode: mock auth (no API calls)
 * In production: calls /api/auth/login, stores JWT tokens
 */
export function useAuth() {
  const router = useRouter()

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const tokens = await apiClient.auth.login(email, password)
    return tokens.user
  }, [])

  const logout = useCallback(async () => {
    await apiClient.auth.logout()
    router.push('/login')
  }, [router])

  const getMe = useCallback(async (): Promise<User> => {
    return apiClient.auth.me()
  }, [])

  return { login, logout, getMe }
}
