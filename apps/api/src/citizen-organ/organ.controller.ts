import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common'
import {
  CitizenNextOfKinRequestSchema,
  CitizenOrganSelectionRequestSchema,
  CitizenSigningDeskRequestSchema,
  CitizenWitnessInviteRequestSchema,
} from '@carefusion/shared/dist/citizen-extras.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import { parseWith } from '../events/validation'
import { CitizenReq, citizenOf } from '../citizen-app/common/citizen-request'
import { OrganService } from './organ.service'

/** Organ and tissue pledge: four steps (intent, family informed, sign at hospital, registered), witnesses, withdraw. */
@Controller('api/v1/citizen/organ')
@Roles(Role.CITIZEN)
export class OrganController {
  constructor(private readonly organ: OrganService) {}

  /** GET /api/v1/citizen/organ -> CitizenOrganOverviewResponse */
  @Get()
  overview(@Req() req: CitizenReq) {
    return this.organ.overview(citizenOf(req))
  }

  /** PUT /api/v1/citizen/organ/pledge/organs { organs[] } -> overview (step 1: creates the pledge, or changes the selection) */
  @Put('pledge/organs')
  organs(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.organ.setOrgans(citizenOf(req), parseWith(CitizenOrganSelectionRequestSchema, body).organs)
  }

  /** POST /api/v1/citizen/organ/pledge/next-of-kin { fullName, relation, channel } -> overview (step 2: family informed) */
  @Post('pledge/next-of-kin')
  nextOfKin(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.organ.informNextOfKin(citizenOf(req), parseWith(CitizenNextOfKinRequestSchema, body))
  }

  /** POST /api/v1/citizen/organ/pledge/witnesses { fullName, relation, isRelative } -> { overview, invite } (signing link is simulated) */
  @Post('pledge/witnesses')
  invite(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.organ.inviteWitness(citizenOf(req), parseWith(CitizenWitnessInviteRequestSchema, body))
  }

  /** POST /api/v1/citizen/organ/pledge/witnesses/remind -> { reminded, overview } (sends again, link valid 7 more days; SMS is simulated) */
  @Post('pledge/witnesses/remind')
  remind(@Req() req: CitizenReq) {
    return this.organ.remindWitnesses(citizenOf(req))
  }

  /** POST /api/v1/citizen/organ/pledge/witnesses/:id/sign -> overview (demo: stands in for the witness signing) */
  @Post('pledge/witnesses/:id/sign')
  sign(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.organ.signWitness(citizenOf(req), id)
  }

  /** PUT /api/v1/citizen/organ/pledge/signing-desk { hospitalId } -> overview (step 3: choose the hospital desk) */
  @Put('pledge/signing-desk')
  desk(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.organ.chooseSigningDesk(citizenOf(req), parseWith(CitizenSigningDeskRequestSchema, body).hospitalId)
  }

  /** POST /api/v1/citizen/organ/pledge/withdraw -> overview (one tap, no reason needed) */
  @Post('pledge/withdraw')
  withdraw(@Req() req: CitizenReq) {
    return this.organ.withdraw(citizenOf(req))
  }
}
