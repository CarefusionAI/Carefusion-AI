import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common'
import { CitizenDoseToggleRequestSchema, CitizenFinderQuerySchema } from '@carefusion/shared/dist/citizen-extras.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import { parseWith } from '../events/validation'
import { CitizenReq, citizenOf } from '../citizen-app/common/citizen-request'
import { MedicinesService } from './medicines.service'

/** Medicines: today's doses, prescriptions and their journey, refills, pharmacy queue token, stock finder. */
@Controller('api/v1/citizen/medicines')
@Roles(Role.CITIZEN)
export class MedicinesController {
  constructor(private readonly medicines: MedicinesService) {}

  /** GET /api/v1/citizen/medicines/today -> CitizenMedicinesTodayResponse (dose slots with the taken state) */
  @Get('today')
  today(@Req() req: CitizenReq) {
    return this.medicines.today(citizenOf(req))
  }

  /** PATCH /api/v1/citizen/medicines/doses/:id { taken } -> CitizenMedicinesTodayResponse (tick or undo a dose) */
  @Patch('doses/:id')
  setDose(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.medicines.setDose(citizenOf(req), id, parseWith(CitizenDoseToggleRequestSchema, body).taken)
  }

  /** GET /api/v1/citizen/medicines/summary -> CitizenMedicinesSummaryResponse (counts, adherence, ready to collect) */
  @Get('summary')
  summary(@Req() req: CitizenReq) {
    return this.medicines.summary(citizenOf(req))
  }

  /** GET /api/v1/citizen/medicines/prescriptions -> CitizenPrescriptionsResponse { active (with journey), past } */
  @Get('prescriptions')
  prescriptions(@Req() req: CitizenReq) {
    return this.medicines.prescriptions(citizenOf(req))
  }

  /** GET /api/v1/citizen/medicines/refills -> CitizenRefillDto[] (soonest first) */
  @Get('refills')
  refills(@Req() req: CitizenReq) {
    return this.medicines.refills(citizenOf(req))
  }

  /** GET /api/v1/citizen/medicines/queue -> { queue: CitizenPharmacyQueueDto | null } (today's counter token) */
  @Get('queue')
  queue(@Req() req: CitizenReq) {
    return this.medicines.queue(citizenOf(req))
  }

  /** GET /api/v1/citizen/medicines/finder?q=&radiusKm=&govtOnly=&openNow= -> CitizenFinderResponse (published stock only) */
  @Get('finder')
  finder(@Req() req: CitizenReq, @Query() query: unknown) {
    return this.medicines.finder(citizenOf(req), parseWith(CitizenFinderQuerySchema, query))
  }
}
