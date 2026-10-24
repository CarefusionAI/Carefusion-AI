import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import {
  BookAppointmentRequestSchema,
  CancelAppointmentRequestSchema,
  ProvidersQuerySchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { CareService } from './care.service'

/** Find care: doctors, free slots, booking, cancelling, past visits. */
@Controller('api/v1/citizen/care')
@Roles(Role.CITIZEN)
export class CareController {
  constructor(private readonly care: CareService) {}

  /** GET /api/v1/citizen/care/providers?q=&type=govt|private&telemedicine=&walkIn= -> ProviderDto[] (nearest first) */
  @Get('providers')
  providers(@Req() req: CitizenReq, @Query() query: unknown) {
    return this.care.providers(citizenOf(req), parseWith(ProvidersQuerySchema, query))
  }

  /** GET /api/v1/citizen/care/providers/:doctorUserId/slots?from=ISO&days=7 -> SlotDto[] */
  @Get('providers/:doctorUserId/slots')
  slots(
    @Req() req: CitizenReq,
    @Param('doctorUserId', ParseUUIDPipe) doctorUserId: string,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    return this.care.slots(citizenOf(req), doctorUserId, from, Math.min(Math.max(Number(days) || 7, 1), 31))
  }

  /** GET /api/v1/citizen/care/appointments?scope=upcoming|past|all -> AppointmentDto[] */
  @Get('appointments')
  appointments(@Req() req: CitizenReq, @Query('scope') scope?: string) {
    const s = scope === 'past' || scope === 'all' ? scope : 'upcoming'
    return this.care.appointments(citizenOf(req), s)
  }

  /** POST /api/v1/citizen/care/appointments { slotId, reason, visitType, shareKeyAtCheckIn } -> BookAppointmentResponse */
  @Post('appointments')
  book(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.care.book(citizenOf(req), parseWith(BookAppointmentRequestSchema, body))
  }

  /** POST /api/v1/citizen/care/appointments/:id/cancel { reason? } -> AppointmentDto */
  @Post('appointments/:id/cancel')
  cancel(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.care.cancel(citizenOf(req), id, parseWith(CancelAppointmentRequestSchema, body).reason)
  }

  /** GET /api/v1/citizen/care/visits/past?months=6 -> PastVisitDto[] */
  @Get('visits/past')
  past(@Req() req: CitizenReq, @Query('months') months?: string) {
    return this.care.pastVisits(citizenOf(req), Math.min(Math.max(Number(months) || 6, 1), 36))
  }
}
