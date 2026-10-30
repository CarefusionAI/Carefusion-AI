import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import type { AuthenticatedUser } from '../../auth/types'
import { StaffContextService } from '../common/staff-context.service'
import {
  CollectedRequestSchema,
  CounterStateRequestSchema,
  DispenseRequestSchema,
  PharmacyScanRequestSchema,
  PharmacyWardRequestDecisionSchema,
  RecallConfirmRequestSchema,
  StockActionRequestSchema,
} from '../common/shared'
import { parseBody } from '../common/staff.util'
import { PharmacistService } from './pharmacist.service'

type Req_ = { user?: AuthenticatedUser }

function optDate(v: unknown, name: string): string | undefined {
  if (v === undefined || v === '') return undefined
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException({ success: false, errorMessage: `${name} must be YYYY-MM-DD` })
  return v
}

/** Pharmacist app. Every route needs the PHARMACIST role and an active pharmacist profile. A pharmacist sees only what is on an e-signed prescription sent to their pharmacy. */
@Controller('api/v1/pharmacist')
@Roles(Role.PHARMACIST)
export class PharmacistController {
  constructor(
    private readonly pharm: PharmacistService,
    private readonly ctx: StaffContextService,
  ) {}

  private actor(req: Req_) {
    return this.ctx.resolve(req.user, 'pharmacist')
  }

  @Get('me')
  async me(@Req() req: Req_) {
    return this.pharm.me(await this.actor(req))
  }

  @Post('counter')
  async counter(@Req() req: Req_, @Body() body: unknown) {
    return this.pharm.setCounter(await this.actor(req), parseBody(CounterStateRequestSchema, body))
  }

  @Get('queue')
  async queue(@Req() req: Req_, @Query('stage') stage?: string, @Query('q') q?: string) {
    return this.pharm.queue(await this.actor(req), { stage, q })
  }

  @Post('scan')
  async scan(@Req() req: Req_, @Body() body: unknown) {
    return this.pharm.scan(await this.actor(req), parseBody(PharmacyScanRequestSchema, body).qrToken)
  }

  @Get('prescriptions/:id')
  async detail(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharm.detail(await this.actor(req), id)
  }

  @Get('prescriptions/:id/items/:itemId/substitutes')
  async substitutes(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.pharm.itemSubstitutes(await this.actor(req), id, itemId)
  }

  @Post('prescriptions/:id/verify')
  async verify(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharm.verify(await this.actor(req), id)
  }

  @Post('prescriptions/:id/dispense')
  async dispense(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.pharm.dispense(await this.actor(req), id, parseBody(DispenseRequestSchema, body))
  }

  @Post('prescriptions/:id/ready')
  async ready(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharm.markReady(await this.actor(req), id)
  }

  @Get('prescriptions/:id/handover-qr')
  async handoverQr(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharm.handoverQr(await this.actor(req), id)
  }

  @Post('prescriptions/:id/collected')
  async collected(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.pharm.collected(await this.actor(req), id, parseBody(CollectedRequestSchema, body))
  }

  @Get('patients/:personId/history')
  async history(@Req() req: Req_, @Param('personId', ParseUUIDPipe) personId: string) {
    return this.pharm.patientHistory(await this.actor(req), personId)
  }

  @Get('refills')
  async refills(@Req() req: Req_, @Query('withinDays') withinDays?: string) {
    const n = withinDays === undefined ? 7 : Number(withinDays)
    if (!Number.isInteger(n) || n < 0 || n > 60) throw new BadRequestException({ success: false, errorMessage: 'withinDays must be 0-60' })
    return this.pharm.refills(await this.actor(req), n)
  }

  @Get('stock')
  async stock(@Req() req: Req_, @Query('q') q?: string, @Query('level') level?: string) {
    return this.pharm.stock(await this.actor(req), { q, level })
  }

  @Get('stock/medicines/:medicineId/batches')
  async batches(@Req() req: Req_, @Param('medicineId', ParseUUIDPipe) id: string) {
    return this.pharm.medicineBatches(await this.actor(req), id)
  }

  @Post('stock/batches/:stockItemId/action')
  async stockAction(@Req() req: Req_, @Param('stockItemId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.pharm.stockAction(await this.actor(req), id, parseBody(StockActionRequestSchema, body))
  }

  @Get('expiry')
  async expiry(@Req() req: Req_) {
    return this.pharm.expiry(await this.actor(req))
  }

  @Get('dispensing-log')
  async log(@Req() req: Req_, @Query('from') from?: string, @Query('to') to?: string) {
    return this.pharm.dispensingLog(await this.actor(req), optDate(from, 'from'), optDate(to, 'to'))
  }

  @Get('dispensing-log/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="dispensing-log.csv"')
  async logCsv(@Req() req: Req_, @Query('from') from?: string, @Query('to') to?: string) {
    return this.pharm.dispensingLogCsv(await this.actor(req), optDate(from, 'from'), optDate(to, 'to'))
  }

  @Get('recalls')
  async recalls(@Req() req: Req_) {
    return this.pharm.recalls(await this.actor(req))
  }

  @Post('recalls/:id/confirm')
  async confirmRecall(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.pharm.confirmRecall(await this.actor(req), id, parseBody(RecallConfirmRequestSchema, body))
  }

  @Get('ward-requests')
  async wardRequests(@Req() req: Req_) {
    return this.pharm.wardRequests(await this.actor(req))
  }

  @Post('ward-requests/:id/decide')
  async decideWard(@Req() req: Req_, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.pharm.decideWardRequest(await this.actor(req), id, parseBody(PharmacyWardRequestDecisionSchema, body))
  }
}
