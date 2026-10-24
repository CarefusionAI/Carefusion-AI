import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { ComplaintsModule } from '../complaints/complaints.module'
import { AccessController } from './access.controller'
import { AccessService } from './access.service'

@Module({
  imports: [EventsModule, ComplaintsModule],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}
