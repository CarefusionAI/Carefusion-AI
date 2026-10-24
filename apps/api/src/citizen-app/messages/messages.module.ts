import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'

@Module({
  imports: [EventsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
