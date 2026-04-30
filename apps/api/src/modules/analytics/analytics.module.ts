// analytics.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalyticsService }    from './analytics.service'
import { AnalyticsController } from './analytics.controller'
import { LeadEntity }          from '../leads/lead.entity'
import { VehicleEntity }       from '../vehicles/vehicle.entity'

@Module({
  imports: [TypeOrmModule.forFeature([LeadEntity, VehicleEntity])],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
