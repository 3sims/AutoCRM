import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bull'
import { AutomationService } from './automation.service'
import { AutomationProcessor } from './automation.processor'
import { LeadEntity } from '../leads/lead.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([LeadEntity]),
    BullModule.registerQueue({ name: 'automation' }),
  ],
  providers: [AutomationService, AutomationProcessor],
  exports: [AutomationService],
})
export class AutomationModule {}
