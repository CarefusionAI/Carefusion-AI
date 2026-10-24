import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { ComplaintsController } from './complaints.controller'
import { ComplaintsService } from './complaints.service'

@Module({
  imports: [EventsModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
