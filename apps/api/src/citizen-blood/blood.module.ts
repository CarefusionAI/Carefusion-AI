import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { BloodController } from './blood.controller'
import { BloodService } from './blood.service'

@Module({
  imports: [EventsModule],
  controllers: [BloodController],
  providers: [BloodService],
})
export class CitizenBloodModule {}
