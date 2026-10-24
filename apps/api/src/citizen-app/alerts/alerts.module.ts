import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { AlertsController } from './alerts.controller'
import { AlertsService } from './alerts.service'

@Module({
  imports: [EventsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
