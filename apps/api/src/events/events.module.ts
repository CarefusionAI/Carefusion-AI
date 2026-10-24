import { Module } from '@nestjs/common'
import { EventsController } from './events.controller'
import { EventsService } from './events.service'
import { RequestDbService } from './request-db.service'

/** Cross-role event feed. Exports EventsService (emit from other modules) and RequestDbService (RLS transactions). */
@Module({
  controllers: [EventsController],
  providers: [EventsService, RequestDbService],
  exports: [EventsService, RequestDbService],
})
export class EventsModule {}
