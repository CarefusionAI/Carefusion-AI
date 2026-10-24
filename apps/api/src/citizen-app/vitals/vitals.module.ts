import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { VitalsController } from './vitals.controller'
import { VitalsService } from './vitals.service'

@Module({
  imports: [EventsModule],
  controllers: [VitalsController],
  providers: [VitalsService],
})
export class VitalsModule {}
