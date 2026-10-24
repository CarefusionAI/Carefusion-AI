import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import type { AuthenticatedUser } from '../../auth/types'
import { StaffContextService } from '../common/staff-context.service'
import {
  CollectSpecimenRequestSchema,
  CriticalCallRequestSchema,
  HandoverCreateRequestSchema,
  InstrumentStatusRequestSchema,
  QcRunRequestSchema,
  ReadBackRequestSchema,
  ResultEntryRequestSchema,
  StaffRejectRequestSchema,
} from '../common/shared'
import { parseBody } from '../common/staff.util'
import { LabService } from './lab.service'

type Req_ = { user?: AuthenticatedUser }

function days(v: unknown, def: number): number {
  if (v === undefined || v === '') return def
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 90) throw new BadRequestException({ success: false, errorMessage: 'days must be 1-90' })
  return n
}

/** Lab technician app. Every route needs the LAB_TECH role and an active lab staff profile. */
@Controller('api/v1/lab')
@Roles(Role.LAB_TECH)
export class LabController {
  constructor(
    private readonly lab: LabService,
    private readonly ctx: StaffContextService,
  ) {}

  private actor(req: Req_) {
    return this.ctx.resolve(req.user, 'lab')
  }

  @Get('me')
  async me(@Req() req: Req_) {
    const a = await this.actor(req)
    return { userId: a.userId, personId: a.personId, fullName: a.fullName, hospitalId: a.hospitalId, role: 'lab_tech' }
  }

  @Get('worklist')
  async worklist(@Req() req: Req_, @Query('stage') stage?: string, @Query('priority') priority?: string, @Query('q') q?: string) {
    return this.lab.worklist(await this.actor(req), { stage, priority, q })
  }

  @Get('orders/:orderId')
  async order(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string) {
    return this.lab.orderDetail(await this.actor(req), id)
  }

  @Post('orders/:orderId/accept')
  async accept(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string) {
    return this.lab.acceptOrder(await this.actor(req), id)
  }

  @Post('orders/:orderId/reject')
  async reject(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lab.rejectOrder(await this.actor(req), id, parseBody(StaffRejectRequestSchema, body))
  }

  @Post('orders/:orderId/specimens')
  async collect(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lab.collectSpecimen(await this.actor(req), id, parseBody(CollectSpecimenRequestSchema, body))
  }

  @Post('specimens/:id/receive')
  async receive(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.lab.receiveSpecimen(await this.actor(req), id)
  }

  @Post('specimens/:id/reject')
  async rejectSpecimen(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lab.rejectSpecimen(await this.actor(req), id, parseBody(StaffRejectRequestSchema, body))
  }

  @Post('orders/:orderId/results')
  async enterResults(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lab.enterResults(await this.actor(req), id, parseBody(ResultEntryRequestSchema, body))
  }

  @Post('results/:id/verify')
  async verify(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.lab.verifyResult(await this.actor(req), id)
  }

  @Post('results/:id/release')
  async release(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.lab.releaseResult(await this.actor(req), id)
  }

  @Get('results/recent')
  async recent(@Req() req: Req_, @Query('hours') hours?: string) {
    return this.lab.recentResults(await this.actor(req), days(hours, 24))
  }

  @Get('catalogue')
  async catalogue(@Req() req: Req_) {
    await this.actor(req)
    return this.lab.catalogue()
  }

  @Get('critical')
  async critical(@Req() req: Req_) {
    return this.lab.critical(await this.actor(req))
  }

  @Post('critical/calls')
  async logCall(@Req() req: Req_, @Body() body: unknown) {
    return this.lab.logCriticalCall(await this.actor(req), parseBody(CriticalCallRequestSchema, body))
  }

  @Post('critical/calls/:id/ack')
  async ackCall(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lab.ackCriticalCall(await this.actor(req), id, parseBody(ReadBackRequestSchema, body))
  }

  @Get('qc')
  async qc(@Req() req: Req_, @Query('days') d?: string) {
    return this.lab.qc(await this.actor(req), days(d, 7))
  }

  @Post('qc/runs')
  async recordQc(@Req() req: Req_, @Body() body: unknown) {
    return this.lab.recordQc(await this.actor(req), parseBody(QcRunRequestSchema, body))
  }

  @Get('instruments')
  async instruments(@Req() req: Req_) {
    return this.lab.instruments(await this.actor(req))
  }

  @Post('instruments/:id/status')
  async instrumentStatus(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lab.setInstrumentStatus(await this.actor(req), id, parseBody(InstrumentStatusRequestSchema, body))
  }

  @Get('reagent-lots')
  async reagentLots(@Req() req: Req_) {
    return this.lab.reagentLots(await this.actor(req))
  }

  @Get('tat')
  async tat(@Req() req: Req_, @Query('days') d?: string) {
    return this.lab.tat(await this.actor(req), days(d, 7))
  }

  @Get('handover')
  async handover(@Req() req: Req_) {
    return this.lab.handoverList(await this.actor(req))
  }

  @Get('handover/colleagues')
  async colleagues(@Req() req: Req_) {
    return this.lab.handoverColleagues(await this.actor(req))
  }

  @Post('handover')
  async createHandover(@Req() req: Req_, @Body() body: unknown) {
    return this.lab.handoverCreate(await this.actor(req), parseBody(HandoverCreateRequestSchema, body))
  }

  @Post('handover/:id/sign')
  async signHandover(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.lab.handoverSign(await this.actor(req), id)
  }
}
