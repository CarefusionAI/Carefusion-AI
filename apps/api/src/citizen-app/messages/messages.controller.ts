import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { SendMessageRequestSchema, StartThreadRequestSchema } from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { MessagesService } from './messages.service'

/** Secure messages with doctors, the appointments desk, lab, radiology and the health department. */
@Controller('api/v1/citizen/messages')
@Roles(Role.CITIZEN)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** GET /api/v1/citizen/messages/threads -> ThreadSummaryDto[] (newest first, with unread counts) */
  @Get('threads')
  threads(@Req() req: CitizenReq) {
    return this.messages.listThreads(citizenOf(req))
  }

  /** POST /api/v1/citizen/messages/threads -> ThreadDetailDto (start or reuse a doctor / hospital-desk thread) */
  @Post('threads')
  start(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.messages.startThread(citizenOf(req), parseWith(StartThreadRequestSchema, body))
  }

  /** GET /api/v1/citizen/messages/threads/:id -> ThreadDetailDto (messages oldest first) */
  @Get('threads/:id')
  thread(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.getThread(citizenOf(req), id)
  }

  /** POST /api/v1/citizen/messages/threads/:id/messages { text } -> MessageDto */
  @Post('threads/:id/messages')
  send(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.messages.send(citizenOf(req), id, parseWith(SendMessageRequestSchema, body).text)
  }

  /** POST /api/v1/citizen/messages/threads/:id/read -> { read: true } (clears the unread badge) */
  @Post('threads/:id/read')
  read(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.markRead(citizenOf(req), id)
  }
}
