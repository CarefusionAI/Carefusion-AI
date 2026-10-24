import { Module } from '@nestjs/common'
import { EventsModule } from '../../events/events.module'
import { AiChatController } from './ai-chat.controller'
import { AiChatService } from './ai-chat.service'

@Module({
  imports: [EventsModule],
  controllers: [AiChatController],
  providers: [AiChatService],
})
export class AiChatModule {}
