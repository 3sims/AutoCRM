/**
 * @package @autocrm/events
 *
 * Domain Event Bus — decoupled inter-module communication.
 *
 * Design principles:
 * - Modules emit events; other modules subscribe
 * - No direct imports between service modules
 * - In-process for MVP; swap to BullMQ/Redis for microservices
 *
 * Event catalogue:
 *   auth.*          lead.*          vehicle.*
 *   pipeline.*      messaging.*     automation.*
 *   notification.*  audit.*         billing.*
 */

// ─── Event Catalogue (type-safe) ────────────────────────────────────────────

export interface DomainEvents {
  // Auth
  'auth.login': { userId: string; ip?: string }
  'auth.logout': { userId: string }
  'auth.password_reset': { userId: string }

  // Leads
  'lead.created': { leadId: string; companyId: string; assignedTo: string; source: string }
  'lead.assigned': { leadId: string; fromUserId: string | null; toUserId: string }
  'lead.stage_changed': { leadId: string; from: string; to: string; userId: string }
  'lead.contacted': { leadId: string; channel: 'email' | 'sms' | 'call' }
  'lead.won': { leadId: string; vehicleId?: string; value: number }
  'lead.lost': { leadId: string; reason?: string }
  'lead.sla_breached': { leadId: string; hoursOverdue: number }
  'lead.stale': { leadId: string; daysSinceContact: number }
  'lead.note_added': { leadId: string; userId: string }

  // Vehicles
  'vehicle.created': { vehicleId: string; companyId: string }
  'vehicle.reserved': { vehicleId: string; reservedBy: string }
  'vehicle.unreserved': { vehicleId: string; unreservedBy: string }
  'vehicle.sold': { vehicleId: string; soldBy: string; price: number }
  'vehicle.unsold': { vehicleId: string; userId: string }
  'vehicle.archived': { vehicleId: string }
  'vehicle.photo_added': { vehicleId: string; userId: string }
  'vehicle.status_changed': { vehicleId: string; from: string; to: string; userId: string }

  // Pipeline
  'pipeline.lead_moved': { leadId: string; from: string; to: string; userId: string }

  // Messaging
  'messaging.email_sent': { leadId: string; userId: string; templateId?: string }
  'messaging.sms_sent': { leadId: string; userId: string }

  // Automation
  'automation.rule_triggered': { ruleId: string; leadId: string }
  'automation.followup_scheduled': { leadId: string; scheduledAt: string }

  // Billing
  'billing.subscription_created': { companyId: string; plan: string }
  'billing.subscription_upgraded': { companyId: string; from: string; to: string }
  'billing.subscription_cancelled': { companyId: string }
  'billing.limit_reached': { companyId: string; resource: string }

  // Audit
  'audit.action': { action: string; userId: string; resourceId: string; metadata: Record<string, unknown> }
}

export type DomainEventName = keyof DomainEvents
export type DomainEventPayload<T extends DomainEventName> = DomainEvents[T]

type Listener<T> = (payload: T) => void | Promise<void>

// ─── EventBus ───────────────────────────────────────────────────────────────

export class EventBus {
  private listeners: Map<string, Array<Listener<unknown>>> = new Map()
  private wildcardListeners: Array<Listener<{ event: string; payload: unknown }>> = []

  /**
   * Emit a typed domain event.
   */
  emit<T extends DomainEventName>(event: T, payload: DomainEventPayload<T>): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EventBus] ${event}`, payload)
    }

    const handlers = this.listeners.get(event) || []
    handlers.forEach(fn => {
      try {
        fn(payload)
      } catch (err) {
        console.error(`[EventBus] Error in handler for ${event}:`, err)
      }
    })

    this.wildcardListeners.forEach(fn => {
      try {
        fn({ event, payload })
      } catch (err) {
        console.error(`[EventBus] Error in wildcard handler for ${event}:`, err)
      }
    })
  }

  /**
   * Subscribe to a typed domain event.
   * Returns an unsubscribe function.
   */
  on<T extends DomainEventName>(
    event: T,
    fn: Listener<DomainEventPayload<T>>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    const handlers = this.listeners.get(event)!
    handlers.push(fn as Listener<unknown>)

    return () => {
      const idx = handlers.indexOf(fn as Listener<unknown>)
      if (idx > -1) handlers.splice(idx, 1)
    }
  }

  /**
   * Subscribe to all events (useful for audit logging, analytics).
   */
  onAll(fn: Listener<{ event: string; payload: unknown }>): () => void {
    this.wildcardListeners.push(fn)
    return () => {
      const idx = this.wildcardListeners.indexOf(fn)
      if (idx > -1) this.wildcardListeners.splice(idx, 1)
    }
  }

  /**
   * One-time listener.
   */
  once<T extends DomainEventName>(
    event: T,
    fn: Listener<DomainEventPayload<T>>
  ): () => void {
    const unsub = this.on(event, (payload) => {
      fn(payload)
      unsub()
    })
    return unsub
  }

  /**
   * Remove all listeners (useful for testing).
   */
  clear(): void {
    this.listeners.clear()
    this.wildcardListeners = []
  }
}

// Singleton instance — shared across modules in the monolith
export const eventBus = new EventBus()

// ─── Future: BullMQ adapter ─────────────────────────────────────────────────
// When extracting to microservices, replace eventBus.emit() with:
//
//   await queue.add(event, payload, { attempts: 3, backoff: 'exponential' })
//
// And replace eventBus.on() with:
//
//   queue.process(event, async (job) => { ... })
//
// The interface stays the same — only the transport changes.
