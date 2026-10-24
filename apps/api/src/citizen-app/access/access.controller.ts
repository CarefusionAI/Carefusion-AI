import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common'
import {
  AccessHistoryQuerySchema,
  AddFamilyMemberRequestSchema,
  ReportOpenRequestSchema,
  ShareCategoryKeySchema,
  UpdateAccessCategoryRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { AccessService } from './access.service'

/** Share and access: rotating key, live sessions, history, what a doctor can see, trusted family. */
@Controller('api/v1/citizen/access')
@Roles(Role.CITIZEN)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  /** GET /api/v1/citizen/access/overview -> AccessOverviewResponse (everything the Access screen needs) */
  @Get('overview')
  overview(@Req() req: CitizenReq) {
    return this.access.overview(citizenOf(req))
  }

  /** GET /api/v1/citizen/access/key -> AccessKeyResponse (call again when secondsLeft reaches 0) */
  @Get('key')
  key(@Req() req: CitizenReq) {
    return this.access.key(citizenOf(req))
  }

  /** GET /api/v1/citizen/access/sessions/live -> LiveSessionDto[] */
  @Get('sessions/live')
  live(@Req() req: CitizenReq) {
    return this.access.liveSessions(citizenOf(req))
  }

  /** POST /api/v1/citizen/access/sessions/:id/end -> { ended, endedAt } (the doctor is told straight away) */
  @Post('sessions/:id/end')
  end(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.endSession(citizenOf(req), id)
  }

  /** POST /api/v1/citizen/access/sessions/:id/report { text } -> ComplaintDto ("report an open") */
  @Post('sessions/:id/report')
  report(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.access.reportOpen(citizenOf(req), id, parseWith(ReportOpenRequestSchema, body).text)
  }

  /** GET /api/v1/citizen/access/history?filter=all|doctors|staff&limit=50 -> AccessHistoryResponse */
  @Get('history')
  history(@Req() req: CitizenReq, @Query() query: unknown) {
    return this.access.history(citizenOf(req), parseWith(AccessHistoryQuerySchema, query))
  }

  /** GET /api/v1/citizen/access/categories -> AccessCategoryDto[] ("what a doctor can see" switches) */
  @Get('categories')
  categories(@Req() req: CitizenReq) {
    return this.access.categories(citizenOf(req))
  }

  /** PUT /api/v1/citizen/access/categories/:key { enabled } -> AccessCategoryDto[] (key: lab|rx|vitals|imaging|genomic|mental_health) */
  @Put('categories/:key')
  setCategory(@Req() req: CitizenReq, @Param('key') key: string, @Body() body: unknown) {
    const k = key === 'emg' ? 'emg' : parseWith(ShareCategoryKeySchema, key)
    return this.access.setCategory(citizenOf(req), k, parseWith(UpdateAccessCategoryRequestSchema, body).enabled)
  }

  /** GET /api/v1/citizen/access/family -> FamilyMemberDto[] */
  @Get('family')
  family(@Req() req: CitizenReq) {
    return this.access.family(citizenOf(req))
  }

  /** POST /api/v1/citizen/access/family { abhaId, relation } -> FamilyMemberDto[] (pending until they accept) */
  @Post('family')
  addFamily(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.access.addFamily(citizenOf(req), parseWith(AddFamilyMemberRequestSchema, body))
  }

  /** DELETE /api/v1/citizen/access/family/:id -> FamilyMemberDto[] */
  @Delete('family/:id')
  removeFamily(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.removeFamily(citizenOf(req), id)
  }
}
