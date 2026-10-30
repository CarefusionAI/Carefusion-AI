import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import type { AuthenticatedUser } from '../../auth/types'
import { StaffContextService } from '../common/staff-context.service'
import {
  AckRequestSchema,
  HandoverCreateRequestSchema,
  MarAdministerRequestSchema,
  NurseTaskCreateRequestSchema,
  NurseVitalsRequestSchema,
  NursingNoteRequestSchema,
  StaffRejectRequestSchema,
  WardStockCountRequestSchema,
  WardStockRequestSchema,
} from '../common/shared'
import { parseBody, UUID_RE } from '../common/staff.util'
import { NurseService } from './nurse.service'

type Req_ = { user?: AuthenticatedUser }

function optUuid(v: unknown, name: string): string | undefined {
  if (v === undefined || v === '') return undefined
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new BadRequestException({ success: false, errorMessage: `${name} must be a UUID` })
  return v
}
function optDate(v: unknown): string | undefined {
  if (v === undefined || v === '') return undefined
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException({ success: false, errorMessage: 'date must be YYYY-MM-DD' })
  return v
}

/** Nurse app (Staff Portal, ward work). Every route needs the NURSE role and an active nurse staff profile. */
@Controller('api/v1/nurse')
@Roles(Role.NURSE)
export class NurseController {
  constructor(
    private readonly nurse: NurseService,
    private readonly ctx: StaffContextService,
  ) {}

  private actor(req: Req_) {
    return this.ctx.resolve(req.user, 'nurse')
  }

  @Get('me')
  async me(@Req() req: Req_) {
    const a = await this.actor(req)
    return { userId: a.userId, personId: a.personId, fullName: a.fullName, hospitalId: a.hospitalId, wardId: a.wardId, role: 'nurse' }
  }

  // ---- ward board and bed detail
  @Get('ward/board')
  async board(@Req() req: Req_, @Query('wardId') wardId?: string) {
    return this.nurse.board(await this.actor(req), optUuid(wardId, 'wardId'))
  }

  @Get('beds/:bedId')
  async bed(@Req() req: Req_, @Param('bedId', ParseUUIDPipe) bedId: string) {
    return this.nurse.bedDetail(await this.actor(req), bedId)
  }

  // ---- vitals -> NEWS2 / escalation
  @Get('admissions/:admissionId/vitals')
  async vitals(@Req() req: Req_, @Param('admissionId', ParseUUIDPipe) id: string) {
    return this.nurse.vitalsHistory(await this.actor(req), id)
  }

  @Post('admissions/:admissionId/vitals')
  async recordVitals(@Req() req: Req_, @Param('admissionId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.nurse.recordVitals(await this.actor(req), id, parseBody(NurseVitalsRequestSchema, body))
  }

  // ---- notes
  @Get('admissions/:admissionId/notes')
  async notes(@Req() req: Req_, @Param('admissionId', ParseUUIDPipe) id: string) {
    return this.nurse.listNotes(await this.actor(req), id)
  }

  @Post('admissions/:admissionId/notes')
  async addNote(@Req() req: Req_, @Param('admissionId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.nurse.addNote(await this.actor(req), id, parseBody(NursingNoteRequestSchema, body))
  }

  // ---- tasks
  @Get('tasks')
  async tasks(@Req() req: Req_, @Query('scope') scope?: string, @Query('status') status?: string, @Query('wardId') wardId?: string) {
    return this.nurse.tasks(await this.actor(req), { scope, status, wardId: optUuid(wardId, 'wardId') })
  }

  @Post('tasks')
  async createTask(@Req() req: Req_, @Body() body: unknown) {
    return this.nurse.createTask(await this.actor(req), parseBody(NurseTaskCreateRequestSchema, body))
  }

  @Post('tasks/:id/done')
  async doneTask(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const note = typeof (body as any)?.note === 'string' ? ((body as any).note as string).slice(0, 500) : undefined
    return this.nurse.completeTask(await this.actor(req), id, note)
  }

  // ---- medication administration record
  @Get('mar')
  async mar(@Req() req: Req_, @Query('date') date?: string, @Query('wardId') wardId?: string, @Query('admissionId') admissionId?: string) {
    return this.nurse.mar(await this.actor(req), { date: optDate(date), wardId: optUuid(wardId, 'wardId'), admissionId: optUuid(admissionId, 'admissionId') })
  }

  @Post('mar/administer')
  async administer(@Req() req: Req_, @Body() body: unknown) {
    return this.nurse.administer(await this.actor(req), parseBody(MarAdministerRequestSchema, body))
  }

  // ---- orders received
  @Get('orders')
  async orders(@Req() req: Req_, @Query('status') status?: string, @Query('wardId') wardId?: string) {
    return this.nurse.orders(await this.actor(req), { status, wardId: optUuid(wardId, 'wardId') })
  }

  @Post('orders/:id/accept')
  async accept(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.nurse.acceptOrder(await this.actor(req), id)
  }

  @Post('orders/:id/reject')
  async reject(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.nurse.rejectOrder(await this.actor(req), id, parseBody(StaffRejectRequestSchema, body))
  }

  @Post('orders/:id/complete')
  async complete(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.nurse.completeOrder(await this.actor(req), id)
  }

  // ---- shift handover
  @Get('handover')
  async handover(@Req() req: Req_) {
    return this.nurse.handoverList(await this.actor(req))
  }

  @Get('handover/colleagues')
  async colleagues(@Req() req: Req_) {
    return this.nurse.handoverColleagues(await this.actor(req))
  }

  @Post('handover')
  async createHandover(@Req() req: Req_, @Body() body: unknown) {
    return this.nurse.handoverCreate(await this.actor(req), parseBody(HandoverCreateRequestSchema, body))
  }

  @Post('handover/:id/sign')
  async signHandover(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.nurse.handoverSign(await this.actor(req), id)
  }

  @Post('handover/:id/items/:itemId/done')
  async handoverItemDone(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.nurse.handoverItemDone(await this.actor(req), id, itemId)
  }

  // ---- ward stock
  @Get('ward-stock')
  async wardStock(@Req() req: Req_) {
    return this.nurse.wardStock(await this.actor(req))
  }

  @Post('ward-stock/requests')
  async requestStock(@Req() req: Req_, @Body() body: unknown) {
    return this.nurse.requestWardStock(await this.actor(req), parseBody(WardStockRequestSchema, body))
  }

  @Post('ward-stock/:id/count')
  async countStock(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.nurse.countWardStock(await this.actor(req), id, parseBody(WardStockCountRequestSchema, body))
  }

  // ---- alerts
  @Get('alerts')
  async alerts(@Req() req: Req_, @Query('wardId') wardId?: string) {
    return this.nurse.alerts(await this.actor(req), optUuid(wardId, 'wardId'))
  }

  @Post('alerts/:id/ack')
  async ackAlert(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.nurse.ackAlert(await this.actor(req), id)
  }

  @Post('escalations/:id/ack')
  async ackEscalation(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.nurse.ackEscalation(await this.actor(req), id, parseBody(AckRequestSchema, body))
  }
}
