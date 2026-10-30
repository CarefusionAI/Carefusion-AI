import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import {
  AckResultRequestSchema,
  AiChatRequestSchema,
  AiImageRequestSchema,
  AiReviewRequestSchema,
  BloodGroupFilterSchema,
  BreakGlassRequestSchema,
  CreateBloodRequestSchema,
  CreateHandoverRequestSchema,
  CreateOrderRequestSchema,
  CreateReferralRequestSchema,
  OpenSessionRequestSchema,
  PrescriptionCheckRequestSchema,
  PrescriptionDraftRequestSchema,
  PrescriptionSignRequestSchema,
  QueueStatusUpdateSchema,
  ReplyMessageRequestSchema,
  ReplyReviewRequestSchema,
  UpdateDoctorProfileSchema,
  UpdateDoctorSettingsSchema,
} from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { Roles } from '../auth/roles.decorator'
import { AccessService } from './access.service'
import { AiService } from './ai.service'
import { CareService } from './care.service'
import { parseBody } from './doctor-db.service'
import { EmergencyService } from './emergency.service'
import { HomeService } from './home.service'
import { MessagesService } from './messages.service'
import { NetworkService } from './network.service'
import { OrdersService } from './orders.service'
import { PatientService } from './patient.service'
import { PrescriptionsService } from './prescriptions.service'
import { ProfileService } from './profile.service'

type Req_ = { user?: AuthenticatedUser }
const uuid = new ParseUUIDPipe()

/** Home, OP queue, schedule, alerts and the bell. */
@Controller('api/v1/doctor')
@Roles(Role.DOCTOR)
export class DoctorHomeController {
  constructor(private readonly home: HomeService) {}

  @Get('home') getHome(@Req() r: Req_) { return this.home.home(r.user) }
  @Get('queue') queue(@Req() r: Req_, @Query('date') date?: string) { return this.home.queue(r.user, date) }
  @Patch('queue/:visitId')
  updateQueue(@Req() r: Req_, @Param('visitId', uuid) id: string, @Body() b: unknown) {
    return this.home.updateQueue(r.user, id, parseBody<{ status: 'waiting' | 'no_show' | 'done' }>(QueueStatusUpdateSchema, b).status)
  }
  @Get('schedule') schedule(@Req() r: Req_, @Query('date') date?: string) { return this.home.schedule(r.user, date) }
  @Get('alerts') alerts(@Req() r: Req_) { return this.home.alerts(r.user) }
  @Post('alerts/:id/ack') ack(@Req() r: Req_, @Param('id', uuid) id: string) { return this.home.ackAlert(r.user, id) }
  @Get('notifications') notifications(@Req() r: Req_) { return this.home.notifications(r.user) }
  @Post('notifications/read')
  read(@Req() r: Req_, @Body() b: { ids?: string[] }) { return this.home.markRead(r.user, Array.isArray(b?.ids) ? b.ids.filter((x) => typeof x === 'string') : undefined) }
}

/** Opening a patient (rotating key) and the patient session. */
@Controller('api/v1/doctor')
@Roles(Role.DOCTOR)
export class DoctorSessionController {
  constructor(
    private readonly access: AccessService,
    private readonly patient: PatientService,
  ) {}

  @Post('access/open') open(@Req() r: Req_, @Body() b: unknown) { return this.access.openWithKey(r.user, parseBody(OpenSessionRequestSchema, b)) }
  @Get('patients/past') past(@Req() r: Req_) { return this.access.pastPatients(r.user) }
  @Get('patients/:personId/my-additions') additions(@Req() r: Req_, @Param('personId', uuid) id: string) { return this.access.myAdditions(r.user, id) }
  @Get('sessions') sessions(@Req() r: Req_) { return this.access.list(r.user) }
  @Get('sessions/:sid') one(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.access.get(r.user, sid) }
  @Post('sessions/:sid/end') end(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.access.end(r.user, sid) }
  @Get('sessions/:sid/summary') summary(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.patient.summary(r.user, sid) }
  @Get('sessions/:sid/trends')
  trends(@Req() r: Req_, @Param('sid', uuid) sid: string, @Query('codes') codes?: string) { return this.patient.trends(r.user, sid, codes ? codes.split(',') : undefined) }
  @Get('sessions/:sid/files') files(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.patient.files(r.user, sid) }
  @Get('sessions/:sid/files/:docId') file(@Req() r: Req_, @Param('sid', uuid) sid: string, @Param('docId', uuid) doc: string) { return this.patient.openFile(r.user, sid, doc) }
}

@Controller('api/v1/doctor')
@Roles(Role.DOCTOR)
export class DoctorAiController {
  constructor(private readonly ai: AiService) {}

  @Get('sessions/:sid/ai') list(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.ai.list(r.user, sid) }
  @Post('sessions/:sid/ai/chat') chat(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.ai.chat(r.user, sid, parseBody(AiChatRequestSchema, b)) }
  @Get('sessions/:sid/ai/chat')
  history(@Req() r: Req_, @Param('sid', uuid) sid: string, @Query('chatSessionId') c?: string) { return this.ai.chatHistory(r.user, sid, c) }
  @Post('sessions/:sid/ai/image') image(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.ai.image(r.user, sid, parseBody(AiImageRequestSchema, b)) }
  @Post('sessions/:sid/ai/genomic') genomic(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.ai.genomic(r.user, sid) }
  @Post('sessions/:sid/ai/temporal') temporal(@Req() r: Req_, @Param('sid', uuid) sid: string) { return this.ai.temporal(r.user, sid) }
  @Post('ai/:runId/review') review(@Req() r: Req_, @Param('runId', uuid) id: string, @Body() b: unknown) { return this.ai.review(r.user, id, parseBody(AiReviewRequestSchema, b)) }
}

@Controller('api/v1/doctor')
@Roles(Role.DOCTOR)
export class DoctorClinicalController {
  constructor(
    private readonly rx: PrescriptionsService,
    private readonly orders: OrdersService,
    private readonly care: CareService,
  ) {}

  // prescriptions
  @Get('prescriptions') rxList(@Req() r: Req_) { return this.rx.list(r.user) }
  @Get('prescriptions/medicines') meds(@Req() r: Req_, @Query('q') q = '') { return this.rx.searchMedicines(r.user, q) }
  @Get('prescriptions/:id') rxOne(@Req() r: Req_, @Param('id', uuid) id: string) { return this.rx.detail(r.user, id) }
  @Post('sessions/:sid/prescriptions/check')
  check(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.rx.checkLines(r.user, sid, parseBody<any>(PrescriptionCheckRequestSchema, b).lines) }
  @Post('sessions/:sid/prescriptions/draft')
  draft(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.rx.saveDraft(r.user, sid, parseBody(PrescriptionDraftRequestSchema, b)) }
  @Post('sessions/:sid/prescriptions/sign')
  sign(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.rx.sign(r.user, sid, parseBody(PrescriptionSignRequestSchema, b)) }

  // orders
  @Get('orders') ordersList(@Req() r: Req_) { return this.orders.list(r.user) }
  @Get('orders/catalogue') catalogue(@Req() r: Req_) { return this.orders.catalogue(r.user) }
  @Get('orders/results') results(@Req() r: Req_) { return this.orders.results(r.user) }
  @Post('orders/results/lab/:resultId/ack')
  ackResult(@Req() r: Req_, @Param('resultId', uuid) id: string, @Body() b: unknown) { return this.orders.acknowledge(r.user, id, parseBody<any>(AckResultRequestSchema, b).comment) }
  @Post('sessions/:sid/orders') createOrder(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.orders.create(r.user, sid, parseBody(CreateOrderRequestSchema, b)) }

  // referrals
  @Get('referrals') referrals(@Req() r: Req_) { return this.care.listReferrals(r.user) }
  @Get('referrals/destinations') dest(@Req() r: Req_) { return this.care.destinations(r.user) }
  @Get('referrals/destinations/:hospitalId/doctors') destDocs(@Req() r: Req_, @Param('hospitalId', uuid) h: string) { return this.care.destinationDoctors(r.user, h) }
  @Post('sessions/:sid/referrals') createRef(@Req() r: Req_, @Param('sid', uuid) sid: string, @Body() b: unknown) { return this.care.createReferral(r.user, sid, parseBody(CreateReferralRequestSchema, b)) }
  @Patch('referrals/:id')
  refStatus(@Req() r: Req_, @Param('id', uuid) id: string, @Body() b: { status?: string }) {
    if (!b?.status || !['seen', 'accepted', 'closed'].includes(b.status)) throw new BadRequestException('status must be seen, accepted or closed')
    return this.care.updateReferralStatus(r.user, id, b.status as 'seen' | 'accepted' | 'closed')
  }

  // handover
  @Get('handover') handovers(@Req() r: Req_) { return this.care.listHandovers(r.user) }
  @Get('handover/colleagues') colleagues(@Req() r: Req_) { return this.care.colleagues(r.user) }
  @Post('handover/draft') handoverDraft(@Req() r: Req_) { return this.care.draftHandover(r.user) }
  @Post('handover') createHandover(@Req() r: Req_, @Body() b: unknown) { return this.care.createHandover(r.user, parseBody(CreateHandoverRequestSchema, b)) }
  @Post('handover/:id/sign') signHandover(@Req() r: Req_, @Param('id', uuid) id: string) { return this.care.signHandover(r.user, id) }
}

@Controller('api/v1/doctor')
@Roles(Role.DOCTOR)
export class DoctorEmergencyController {
  constructor(private readonly em: EmergencyService) {}

  @Get('emergency') info(@Req() r: Req_) { return this.em.info(r.user) }
  @Get('emergency/unidentified') unidentified(@Req() r: Req_) { return this.em.unidentified(r.user) }
  @Get('emergency/lookup')
  lookup(@Req() r: Req_, @Query('abha') abha?: string) {
    if (!abha) throw new BadRequestException('abha is required')
    return this.em.lookup(r.user, abha)
  }
  @Get('emergency/card/:personId') card(@Req() r: Req_, @Param('personId', uuid) id: string) { return this.em.card(r.user, id) }
  @Post('emergency/break-glass') breakGlass(@Req() r: Req_, @Body() b: unknown) { return this.em.breakGlass(r.user, parseBody(BreakGlassRequestSchema, b)) }
}

@Controller('api/v1/doctor')
@Roles(Role.DOCTOR)
export class DoctorNetworkController {
  constructor(
    private readonly msg: MessagesService,
    private readonly net: NetworkService,
    private readonly profile: ProfileService,
  ) {}

  @Get('messages') threads(@Req() r: Req_) { return this.msg.threads(r.user) }
  @Get('messages/:id') thread(@Req() r: Req_, @Param('id', uuid) id: string) { return this.msg.thread(r.user, id) }
  @Post('messages/:id/reply') reply(@Req() r: Req_, @Param('id', uuid) id: string, @Body() b: unknown) { return this.msg.reply(r.user, id, parseBody<any>(ReplyMessageRequestSchema, b).text) }

  @Get('donors')
  donors(@Req() r: Req_, @Query('bloodGroup') bg = 'B+', @Query('radiusKm') km = '10') {
    const g = BloodGroupFilterSchema.safeParse(bg)
    if (!g.success) throw new BadRequestException('bloodGroup must be one of A+, A-, B+, B-, AB+, AB-, O+, O-')
    const radius = Math.min(100, Math.max(1, Number(km) || 10))
    return this.net.donors(r.user, g.data, radius)
  }
  @Get('blood-requests') bloodRequests(@Req() r: Req_) { return this.net.myBloodRequests(r.user) }
  @Post('blood-requests') createBlood(@Req() r: Req_, @Body() b: unknown) { return this.net.createBloodRequest(r.user, parseBody(CreateBloodRequestSchema, b)) }
  @Get('pharmacy/stock') stock(@Req() r: Req_, @Query('q') q = '') { return this.net.pharmacyStock(r.user, q) }

  @Get('profile') getProfile(@Req() r: Req_) { return this.profile.profile(r.user) }
  @Patch('profile') updateProfile(@Req() r: Req_, @Body() b: unknown) { return this.profile.updateProfile(r.user, parseBody(UpdateDoctorProfileSchema, b)) }
  @Post('reviews/:id/reply') replyReview(@Req() r: Req_, @Param('id', uuid) id: string, @Body() b: unknown) { return this.profile.replyReview(r.user, id, parseBody<any>(ReplyReviewRequestSchema, b).body) }
  @Get('settings') settings(@Req() r: Req_) { return this.profile.settings(r.user) }
  @Patch('settings') updateSettings(@Req() r: Req_, @Body() b: unknown) { return this.profile.updateSettings(r.user, parseBody(UpdateDoctorSettingsSchema, b)) }
}
