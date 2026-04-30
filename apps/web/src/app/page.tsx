'use client'

/**
 * Main entry point — renders the full AutoCRM app.
 * The App component is the root shell (sidebar + routing).
 * In production this connects to the NestJS API.
 *
 * For the demo / local dev: all logic is client-side with mock data.
 * Swap `useMockStore` for `useApiStore` to connect to the real backend.
 */

import { AutoCRMApp } from '@/components/AutoCRMApp'

export default function Home() {
  return <AutoCRMApp />
}
