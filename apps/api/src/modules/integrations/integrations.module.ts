import { Module } from '@nestjs/common'
import { WebhooksController } from './webhooks.controller'
import { PollingService }     from './polling.service'
import { LeadsModule }        from '../leads/leads.module'

@Module({
  imports: [LeadsModule],
  controllers: [WebhooksController],
  providers: [PollingService],
})
export class IntegrationsModule {}
