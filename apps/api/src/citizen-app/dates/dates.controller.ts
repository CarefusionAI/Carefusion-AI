import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { CreateReminderRequestSchema, UpdateReminderRequestSchema } from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Public } from '../../auth/public.decorator'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { DatesService } from './dates.service'

/** Calendar and reminders (Dates screen). */
@Controller('api/v1/citizen/dates')
@Roles(Role.CITIZEN)
export class DatesController {
  constructor(
    private readonly dates: DatesService,
    private readonly config: ConfigService,
  ) {}

  /** GET /api/v1/citizen/dates/calendar?month=2026-10 -> CalendarResponse */
  @Get('calendar')
  calendar(@Req() req: CitizenReq, @Query('month') month?: string) {
    return this.dates.calendar(citizenOf(req), month)
  }

  /** GET /api/v1/citizen/dates/upcoming?limit=10 -> UpcomingResponse ("Coming up" list) */
  @Get('upcoming')
  upcoming(@Req() req: CitizenReq, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 10, 1), 50)
    return this.dates.upcoming(citizenOf(req), n)
  }

  /** POST /api/v1/citizen/dates/reminders -> DatedEventDto (personal reminder) */
  @Post('reminders')
  createReminder(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.dates.createReminder(citizenOf(req), parseWith(CreateReminderRequestSchema, body))
  }

  /** PATCH /api/v1/citizen/dates/reminders/:id (edit, snooze, done, cancel) -> DatedEventDto */
  @Patch('reminders/:id')
  updateReminder(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.dates.updateReminder(citizenOf(req), id, parseWith(UpdateReminderRequestSchema, body))
  }

  /** GET /api/v1/citizen/dates/calendar-feed -> { active, createdAt } */
  @Get('calendar-feed')
  feedStatus(@Req() req: CitizenReq) {
    return this.dates.feedStatus(citizenOf(req))
  }

  /** POST /api/v1/citizen/dates/calendar-feed -> { active, createdAt, url } (url shown once) */
  @Post('calendar-feed')
  createFeed(@Req() req: CitizenReq) {
    const base = this.config.get<string>('PUBLIC_API_URL', '').replace(/\/$/, '')
    return this.dates.createFeed(citizenOf(req), base)
  }

  /** DELETE /api/v1/citizen/dates/calendar-feed -> revokes the secret link */
  @Delete('calendar-feed')
  revokeFeed(@Req() req: CitizenReq) {
    return this.dates.revokeFeed(citizenOf(req))
  }
}

/** Public iCalendar feed: GET /api/v1/calendar/<token>.ics (the secret link, no login). */
@Controller('api/v1/calendar')
export class CalendarFeedController {
  constructor(private readonly dates: DatesService) {}

  @Public()
  @Get(':file')
  async feed(@Param('file') file: string, @Res({ passthrough: true }) res: Response) {
    const token = file.endsWith('.ics') ? file.slice(0, -4) : file
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) throw new NotFoundException()
    const ics = await this.dates.icsForToken(token)
    if (!ics) throw new NotFoundException()
    res.type('text/calendar; charset=utf-8')
    return ics
  }
}
