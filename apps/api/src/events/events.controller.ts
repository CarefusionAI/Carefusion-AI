import { BadRequestException, Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import {
  EmitEventRequestSchema,
  ListEventsQuerySchema,
  MarkEventsReadRequestSchema,
} from '@carefusion/shared/dist/events.js'
import type { AuthenticatedUser } from '../auth/types'
import { EventsService } from './events.service'
import { parseWith } from './validation'

type Req_ = { user?: AuthenticatedUser }

function me(req: Req_): AuthenticatedUser {
  if (!req.user) throw new BadRequestException('Not signed in')
  return req.user
}

/** Cross-role event feed. Any signed-in role; row-level security decides which events are visible. */
@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** GET /api/v1/events?role=doctor&limit=50&unreadOnly=true  -> EventDto[] (newest first) */
  @Get()
  list(@Req() req: Req_, @Query() query: unknown) {
    const q = parseWith(ListEventsQuerySchema, query)
    return this.events.list(me(req), { role: q.role, limit: q.limit, unreadOnly: q.unreadOnly })
  }

  /** GET /api/v1/events/unread-count -> { count } */
  @Get('unread-count')
  async unreadCount(@Req() req: Req_) {
    return { count: await this.events.unreadCount(me(req)) }
  }

  /** POST /api/v1/events/read { ids?: uuid[] } -> { marked } */
  @Post('read')
  markRead(@Req() req: Req_, @Body() body: unknown) {
    const b = parseWith(MarkEventsReadRequestSchema, body)
    return this.events.markRead(me(req), b.ids)
  }

  /** POST /api/v1/events -> EventDto (from_role is taken from the signed-in account) */
  @Post()
  emit(@Req() req: Req_, @Body() body: unknown) {
    return this.events.emitForUser(me(req), parseWith(EmitEventRequestSchema, body))
  }
}
