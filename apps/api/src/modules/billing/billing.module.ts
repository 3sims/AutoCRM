import { Module } from '@nestjs/common'
// Domain: billing — Subscriptions, plan limits, Stripe integration
// Expand with: SubscriptionEntity, BillingService, BillingController
// Future microservice: highest extraction priority — no shared DB tables
@Module({ imports: [], providers: [], controllers: [], exports: [] })
export class BillingModule {}
