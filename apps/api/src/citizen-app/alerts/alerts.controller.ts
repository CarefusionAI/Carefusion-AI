import { Body, Controller, Get, Post, Put, Query, Req } from '@nestjs/common'
import {
  ListAlertsQuerySchema,
  MarkAlertsReadRequestSchema,
  UpdateNotificationPrefsRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { AlertsService } from './alerts.service'

/** Alerts (health department notices + care events) and notification preferences. */
@Controller('api/v1/citizen/alerts')
@Roles(Role.CITIZEN)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** GET /api/v1/citizen/alerts?group=emergency|health_dept|my_care|system&unreadOnly=true -> AlertsResponse */
  @Get()
  list(@Req() req: CitizenReq, @Query() query: unknown) {
    return this.alerts.list(citizenOf(req), parseWith(ListAlertsQuerySchema, query))
  }

  /** GET /api/v1/citizen/alerts/unread-count -> { count } */
  @Get('unread-count')
  async unread(@Req() req: CitizenReq) {
    return { count: await this.alerts.unreadCount(citizenOf(req)) }
  }

  /** POST /api/v1/citizen/alerts/read { ids? } -> { marked } (ids look like "alert:<uuid>" or "event:<uuid>") */
  @Post('read')
  read(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.alerts.markRead(citizenOf(req), parseWith(MarkAlertsReadRequestSchema, body).ids)
  }

  /** GET /api/v1/citizen/alerts/preferences -> NotificationPrefsResponse (emergency is locked on) */
  @Get('preferences')
  preferences(@Req() req: CitizenReq) {
    return this.alerts.preferences(citizenOf(req))
  }

  /** PUT /api/v1/citizen/alerts/preferences { prefs: [{category, channel, enabled}], quietHours? } */
  @Put('preferences')
  updatePreferences(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.alerts.updatePreferences(citizenOf(req), parseWith(UpdateNotificationPrefsRequestSchema, body))
  }
}
