import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import {
  SendChatMessageRequestSchema,
  ShareChatRequestSchema,
  StartChatRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { AiChatService } from './ai-chat.service'

/** Simulated AI health chat (guidance only, never a diagnosis; results are explained only after a doctor reviewed them). */
@Controller('api/v1/citizen/ai-chat')
@Roles(Role.CITIZEN)
export class AiChatController {
  constructor(private readonly chat: AiChatService) {}

  /** GET /api/v1/citizen/ai-chat/context -> ChatContextResponse ("what the AI can see", suggestion chips) */
  @Get('context')
  context(@Req() req: CitizenReq) {
    return this.chat.context(citizenOf(req))
  }

  /** GET /api/v1/citizen/ai-chat/sessions -> ChatSessionDto[] (earlier chats, newest first) */
  @Get('sessions')
  list(@Req() req: CitizenReq) {
    return this.chat.listSessions(citizenOf(req))
  }

  /** POST /api/v1/citizen/ai-chat/sessions { text? } -> SendChatMessageResponse (or { session } when text is empty) */
  @Post('sessions')
  start(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.chat.startSession(citizenOf(req), parseWith(StartChatRequestSchema, body).text)
  }

  /** GET /api/v1/citizen/ai-chat/sessions/:id -> ChatSessionDetail (all messages) */
  @Get('sessions/:id')
  get(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getSession(citizenOf(req), id)
  }

  /** POST /api/v1/citizen/ai-chat/sessions/:id/messages { text } -> SendChatMessageResponse (simulated reply) */
  @Post('sessions/:id/messages')
  send(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.chat.sendMessage(citizenOf(req), id, parseWith(SendChatMessageRequestSchema, body).text)
  }

  /** POST /api/v1/citizen/ai-chat/sessions/:id/share { doctorUserId? } -> ChatSessionDto */
  @Post('sessions/:id/share')
  share(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.chat.share(citizenOf(req), id, parseWith(ShareChatRequestSchema, body).doctorUserId)
  }
}
