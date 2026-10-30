import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { CalendarFeedController, DatesController } from './dates.controller'
import { DatesService } from './dates.service'

@Module({
  imports: [EventsModule],
  controllers: [DatesController, CalendarFeedController],
  providers: [DatesService],
})
export class DatesModule {}
