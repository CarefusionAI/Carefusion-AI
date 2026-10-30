import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { CareController } from './care.controller'
import { CareService } from './care.service'

@Module({
  imports: [EventsModule],
  controllers: [CareController],
  providers: [CareService],
})
export class CareModule {}
