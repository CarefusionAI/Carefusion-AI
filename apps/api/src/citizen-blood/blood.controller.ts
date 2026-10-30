import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common'
import {
  CitizenBloodAvailabilityRequestSchema,
  CitizenBloodChecklistRequestSchema,
  CitizenBloodRespondRequestSchema,
} from '@carefusion/shared/dist/citizen-extras.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import { parseWith } from '../events/validation'
import { CitizenReq, citizenOf } from '../citizen-app/common/citizen-request'
import { BloodService } from './blood.service'

/** Blood donation: donor status, requests near you, camps, blood bank stock, history, pre-donation checklist. */
@Controller('api/v1/citizen/blood')
@Roles(Role.CITIZEN)
export class BloodController {
  constructor(private readonly blood: BloodService) {}

  /** GET /api/v1/citizen/blood/donor -> CitizenBloodDonorDto (status, rest period, tier, counts) */
  @Get('donor')
  donor(@Req() req: CitizenReq) {
    return this.blood.donor(citizenOf(req))
  }

  /** PUT /api/v1/citizen/blood/donor/availability { ready } -> CitizenBloodDonorDto (cannot turn on while resting, rule CF060) */
  @Put('donor/availability')
  availability(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.blood.setAvailability(citizenOf(req), parseWith(CitizenBloodAvailabilityRequestSchema, body).ready)
  }

  /** GET /api/v1/citizen/blood/requests -> CitizenBloodRequestsResponse { requests, camps } within the radius, compatible groups only */
  @Get('requests')
  requests(@Req() req: CitizenReq) {
    return this.blood.requests(citizenOf(req))
  }

  /** POST /api/v1/citizen/blood/requests/:id/respond { response: will_donate | cannot, notifyCircle? } -> CitizenBloodRequestsResponse */
  @Post('requests/:id/respond')
  respond(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.blood.respond(citizenOf(req), id, parseWith(CitizenBloodRespondRequestSchema, body))
  }

  /** POST /api/v1/citizen/blood/requests/:id/withdraw -> CitizenBloodRequestsResponse (clears your answer) */
  @Post('requests/:id/withdraw')
  withdraw(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.blood.withdraw(citizenOf(req), id)
  }

  /** POST /api/v1/citizen/blood/camps/:id/pledge -> CitizenBloodRequestsResponse (only if you are eligible by the camp date) */
  @Post('camps/:id/pledge')
  pledge(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.blood.pledgeCamp(citizenOf(req), id)
  }

  /** GET /api/v1/citizen/blood/banks -> CitizenBloodBanksResponse (district stock by group, days of cover) */
  @Get('banks')
  banks(@Req() req: CitizenReq) {
    return this.blood.banks(citizenOf(req))
  }

  /** GET /api/v1/citizen/blood/history -> CitizenBloodHistoryResponse (donations, impact, tier) */
  @Get('history')
  history(@Req() req: CitizenReq) {
    return this.blood.history(citizenOf(req))
  }

  /** GET /api/v1/citizen/blood/checklist -> CitizenBloodChecklistResponse (latest pre-donation answers and rules) */
  @Get('checklist')
  checklist(@Req() req: CitizenReq) {
    return this.blood.checklist(citizenOf(req))
  }

  /** POST /api/v1/citizen/blood/checklist -> CitizenBloodChecklistResponse (new answers; eligibility worked out here) */
  @Post('checklist')
  saveChecklist(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.blood.saveChecklist(citizenOf(req), parseWith(CitizenBloodChecklistRequestSchema, body))
  }
}
