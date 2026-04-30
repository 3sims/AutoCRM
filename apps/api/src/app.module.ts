import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'

// Domain modules
import { IntegrationsModule } from './modules/integrations/integrations.module'
import { AuthModule } from './modules/auth/auth.module'
import { TenancyModule } from './modules/tenancy/tenancy.module'
import { UsersModule } from './modules/users/users.module'
import { LeadsModule } from './modules/leads/leads.module'
import { PipelineModule } from './modules/pipeline/pipeline.module'
import { VehiclesModule } from './modules/vehicles/vehicles.module'
import { MessagingModule } from './modules/messaging/messaging.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { BillingModule } from './modules/billing/billing.module'
import { AuditModule } from './modules/audit/audit.module'

// Conditional Bull imports
const bullImports: any[] = []
const optionalModules: any[] = []

if (process.env.REDIS_HOST) {
  // Only load Bull + Automation when Redis is available
  const { BullModule } = require('@nestjs/bull')
  const { AutomationModule } = require('./modules/automation/automation.module')

  bullImports.push(
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
        },
      }),
    }),
  )
  optionalModules.push(AutomationModule)
}

@Module({
  controllers: [AppController],
  imports: [
    // ── Config ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Rate limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ── Cron jobs ────────────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Database (PostgreSQL via TypeORM) ────────────────────────────────────
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get('DB_PORT', 5432),
        username: config.get('DB_USER', 'autocrm'),
        password: config.get('DB_PASS', 'autocrm'),
        database: config.get('DB_NAME', 'autocrm'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('DB_LOGGING') === 'true',
        ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),

    // ── Queue (Redis + BullMQ) — only if REDIS_HOST is set ───────────────────
    ...bullImports,

    // ── Domain modules ───────────────────────────────────────────────────────
    AuthModule,
    TenancyModule,
    UsersModule,
    LeadsModule,
    PipelineModule,
    VehiclesModule,
    MessagingModule,
    ...optionalModules,
    NotificationsModule,
    AnalyticsModule,
    BillingModule,
    AuditModule,
    IntegrationsModule,
  ],
})
export class AppModule {}