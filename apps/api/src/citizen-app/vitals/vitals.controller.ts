import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { AddVitalReadingRequestSchema, VitalKindSchema } from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { VitalsService } from './vitals.service'

/** Home vitals (self-reported readings and the targets the doctor set). */
@Controller('api/v1/citizen/vitals')
@Roles(Role.CITIZEN)
export class VitalsController {
  constructor(private readonly vitals: VitalsService) {}

  /** GET /api/v1/citizen/vitals/summary -> VitalsSummaryResponse (latest cards, BP 30-day stats, BMI, HbA1c, targets) */
  @Get('summary')
  summary(@Req() req: CitizenReq) {
    return this.vitals.summary(citizenOf(req))
  }

  /** GET /api/v1/citizen/vitals/readings?kind=bp&days=30&limit=50 -> VitalReadingDto[] */
  @Get('readings')
  readings(@Req() req: CitizenReq, @Query('kind') kind?: string, @Query('days') days?: string, @Query('limit') limit?: string) {
    const k = kind ? parseWith(VitalKindSchema, kind) : undefined
    return this.vitals.readings(citizenOf(req), {
      kind: k,
      days: Math.min(Math.max(Number(days) || 30, 1), 730),
      limit: Math.min(Math.max(Number(limit) || 50, 1), 500),
    })
  }

  /** GET /api/v1/citizen/vitals/targets -> VitalTargetDto[] (set by the doctor) */
  @Get('targets')
  targets(@Req() req: CitizenReq) {
    return this.vitals.targets(citizenOf(req))
  }

  /** POST /api/v1/citizen/vitals/readings -> AddVitalReadingResponse (flagged readings alert the doctor) */
  @Post('readings')
  add(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.vitals.addReading(citizenOf(req), parseWith(AddVitalReadingRequestSchema, body))
  }
}
