import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import type { AuthenticatedUser } from '../../auth/types'
import { StaffContextService } from '../common/staff-context.service'
import {
  EquipmentEventRequestSchema,
  ExposureRequestSchema,
  HandoverCreateRequestSchema,
  LinkPriorRequestSchema,
  RoomStatusRequestSchema,
  ScheduleStudyRequestSchema,
  StaffRejectRequestSchema,
  StartStudyRequestSchema,
  StudyChecklistRequestSchema,
  StudyFileMetaRequestSchema,
  WithdrawFileRequestSchema,
} from '../common/shared'
import { parseBody } from '../common/staff.util'
import { RadiologyService } from './radiology.service'

type Req_ = { user?: AuthenticatedUser }

/** Radiology technician app. Every route needs the RADIOLOGY_TECH role and an active radiology staff profile. */
@Controller('api/v1/radiology')
@Roles(Role.RADIOLOGY_TECH)
export class RadiologyController {
  constructor(
    private readonly rad: RadiologyService,
    private readonly ctx: StaffContextService,
  ) {}

  private actor(req: Req_) {
    return this.ctx.resolve(req.user, 'radiology')
  }

  @Get('me')
  async me(@Req() req: Req_) {
    const a = await this.actor(req)
    return { userId: a.userId, personId: a.personId, fullName: a.fullName, hospitalId: a.hospitalId, role: 'radiology_tech' }
  }

  @Get('worklist')
  async worklist(@Req() req: Req_, @Query('status') status?: string, @Query('modality') modality?: string, @Query('priority') priority?: string) {
    return this.rad.worklist(await this.actor(req), { status, modality, priority })
  }

  @Get('studies/:studyId')
  async study(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string) {
    return this.rad.studyDetail(await this.actor(req), id)
  }

  @Post('orders/:orderId/accept')
  async accept(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string) {
    return this.rad.acceptOrder(await this.actor(req), id)
  }

  @Post('orders/:orderId/reject')
  async reject(@Req() req: Req_, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.rejectOrder(await this.actor(req), id, parseBody(StaffRejectRequestSchema, body))
  }

  @Post('studies/:studyId/schedule')
  async schedule(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.scheduleStudy(await this.actor(req), id, parseBody(ScheduleStudyRequestSchema, body))
  }

  @Post('studies/:studyId/start')
  async start(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.startStudy(await this.actor(req), id, parseBody(StartStudyRequestSchema, body))
  }

  @Post('studies/:studyId/checklist')
  async checklist(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.updateChecklist(await this.actor(req), id, parseBody(StudyChecklistRequestSchema, body))
  }

  @Post('studies/:studyId/files')
  async addFile(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.addFile(await this.actor(req), id, parseBody(StudyFileMetaRequestSchema, body))
  }

  @Post('studies/:studyId/files/:fileId/withdraw')
  async withdraw(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: unknown) {
    return this.rad.withdrawFile(await this.actor(req), id, fileId, parseBody(WithdrawFileRequestSchema, body))
  }

  @Post('studies/:studyId/exposure')
  async exposure(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.saveExposure(await this.actor(req), id, parseBody(ExposureRequestSchema, body))
  }

  @Post('studies/:studyId/priors')
  async prior(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.linkPrior(await this.actor(req), id, parseBody(LinkPriorRequestSchema, body))
  }

  @Post('studies/:studyId/submit')
  async submit(@Req() req: Req_, @Param('studyId', ParseUUIDPipe) id: string) {
    return this.rad.submitStudy(await this.actor(req), id)
  }

  @Get('rooms')
  async rooms(@Req() req: Req_) {
    return this.rad.rooms(await this.actor(req))
  }

  @Get('schedule')
  async schedule_(@Req() req: Req_, @Query('date') date?: string) {
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException({ success: false, errorMessage: 'date must be YYYY-MM-DD' })
    return this.rad.schedule(await this.actor(req), date)
  }

  @Post('rooms/:roomId/status')
  async roomStatus(@Req() req: Req_, @Param('roomId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.rad.setRoomStatus(await this.actor(req), id, parseBody(RoomStatusRequestSchema, body))
  }

  @Get('equipment')
  async equipment(@Req() req: Req_) {
    return this.rad.equipment(await this.actor(req))
  }

  @Post('equipment/events')
  async equipmentEvent(@Req() req: Req_, @Body() body: unknown) {
    return this.rad.addEquipmentEvent(await this.actor(req), parseBody(EquipmentEventRequestSchema, body))
  }

  @Get('handover')
  async handover(@Req() req: Req_) {
    return this.rad.handoverList(await this.actor(req))
  }

  @Get('handover/colleagues')
  async colleagues(@Req() req: Req_) {
    return this.rad.handoverColleagues(await this.actor(req))
  }

  @Post('handover')
  async createHandover(@Req() req: Req_, @Body() body: unknown) {
    return this.rad.handoverCreate(await this.actor(req), parseBody(HandoverCreateRequestSchema, body))
  }

  @Post('handover/:id/sign')
  async signHandover(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.rad.handoverSign(await this.actor(req), id)
  }
}
