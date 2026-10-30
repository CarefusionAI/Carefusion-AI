import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import { z } from 'zod'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { GovScopeService } from './gov-scope.service'
import type { GovScope } from './gov-scope.service'
import { OverviewService } from './overview.service'
import { SurveillanceService } from './surveillance.service'
import { GovApprovalsService } from './approvals.service'
import { AlertsService } from './alerts.service'
import { BloodService } from './blood.service'
import { OversightService } from './oversight.service'
import { DirectoryService } from './directory.service'
import { PlatformService } from './platform.service'
import { parseInput } from './gov-util'

const ALL_GOV = [Role.DISTRICT_ADMIN, Role.STATE_ADMIN, Role.ZONAL_ADMIN, Role.CENTRAL_ADMIN] as const
type Req_ = { user: AuthenticatedUser }

const Id = z.string().uuid()
const Disease = z.string().trim().min(1).max(40).optional()

const AlertBody = z.object({
  type: z.enum(['advisory', 'emergency']).default('advisory'),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(600),
  category: z.string().trim().min(1).max(40).default('outbreak'),
  target: z.object({
    scope: z.enum(['national', 'zone', 'state', 'district']),
    id: z.union([z.string(), z.number()]).optional(),
  }),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  sms: z.boolean().default(false),
  translate: z.boolean().default(true),
  saveAsDraft: z.boolean().default(false),
})

/**
 * One parametrised government console API for district, state, zonal and central admins.
 * The level and area always come from the signed-in admin's admin post (GovScopeService), never from a request parameter.
 */
@Controller('api/v1/gov')
export class GovAdminController {
  constructor(
    private readonly scopes: GovScopeService,
    private readonly overview: OverviewService,
    private readonly surveillance: SurveillanceService,
    private readonly approvals: GovApprovalsService,
    private readonly alerts: AlertsService,
    private readonly blood: BloodService,
    private readonly oversight: OversightService,
    private readonly directory: DirectoryService,
    private readonly platform: PlatformService,
  ) {}

  private scope(req: Req_): Promise<GovScope> {
    return this.scopes.resolve(req.user)
  }

  // ---------------------------------------------------------------- context, overview, map

  @Roles(...ALL_GOV) @Get('context')
  async context(@Req() req: Req_) { return this.overview.context(await this.scope(req)) }

  @Roles(...ALL_GOV) @Get('overview')
  async getOverview(@Req() req: Req_) { return this.overview.overview(await this.scope(req)) }

  @Roles(...ALL_GOV) @Get('map')
  async map(@Req() req: Req_, @Query() q: unknown) {
    const { metric, disease } = parseInput(z.object({ metric: z.enum(['registered', 'disease', 'blood']).default('disease'), disease: Disease }), q)
    return this.overview.map(await this.scope(req), metric, disease)
  }

  // ---------------------------------------------------------------- surveillance

  @Roles(...ALL_GOV) @Get('surveillance')
  async getSurveillance(@Req() req: Req_, @Query() q: unknown) {
    const { disease } = parseInput(z.object({ disease: Disease }), q)
    return this.surveillance.surveillance(await this.scope(req), disease)
  }

  @Roles(...ALL_GOV) @Post('surveillance/anomalies/:id/review')
  async reviewAnomaly(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parseInput(z.object({ status: z.enum(['reviewed', 'dismissed']) }), body)
    return this.surveillance.reviewAnomaly(await this.scope(req), req.user, parseInput(Id, id), status)
  }

  @Roles(...ALL_GOV) @Post('surveillance/actions')
  async createAction(@Req() req: Req_, @Body() body: unknown) {
    const input = parseInput(
      z.object({ disease: z.string().trim().min(1).max(40), title: z.string().trim().min(1).max(160), meta: z.string().trim().max(240).optional(), status: z.enum(['planned', 'in_progress', 'done']).optional() }),
      body,
    )
    return this.surveillance.createAction(await this.scope(req), req.user, input)
  }

  @Roles(...ALL_GOV) @Patch('surveillance/actions/:id')
  async updateAction(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parseInput(z.object({ status: z.enum(['planned', 'in_progress', 'done']) }), body)
    return this.surveillance.updateAction(await this.scope(req), req.user, parseInput(Id, id), status)
  }

  @Roles(...ALL_GOV) @Post('surveillance/field-requests')
  async fieldRequest(@Req() req: Req_, @Body() body: unknown) {
    const input = parseInput(z.object({ anomalyId: Id, teamName: z.string().trim().min(1).max(160) }), body)
    return this.surveillance.requestFieldInvestigation(await this.scope(req), req.user, input)
  }

  // ---------------------------------------------------------------- approvals

  @Roles(...ALL_GOV) @Get('approvals')
  async listApprovals(@Req() req: Req_, @Query() q: unknown) {
    const { status } = parseInput(z.object({ status: z.enum(['all', 'waiting', 'decided']).default('all') }), q)
    return this.approvals.list(await this.scope(req), status)
  }

  @Roles(...ALL_GOV) @Get('approvals/inbox')
  async inbox(@Req() req: Req_) { return this.approvals.inbox(await this.scope(req)) }

  @Roles(...ALL_GOV) @Post('approvals/:id/approve')
  async approve(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(z.object({ reason: z.string().trim().min(1).max(2000).optional(), asPeer: z.boolean().optional() }), body)
    return this.approvals.approve(await this.scope(req), req.user, parseInput(Id, id), input)
  }

  @Roles(...ALL_GOV) @Post('approvals/:id/reject')
  async reject(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parseInput(z.object({ reason: z.string().trim().min(1, 'A reason is required').max(2000) }), body)
    return this.approvals.reject(await this.scope(req), req.user, parseInput(Id, id), reason)
  }

  @Roles(...ALL_GOV) @Post('approvals/:id/more-info')
  async moreInfo(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parseInput(z.object({ note: z.string().trim().min(1, 'Say what is missing').max(2000) }), body)
    return this.approvals.moreInfo(await this.scope(req), req.user, parseInput(Id, id), note)
  }

  @Roles(...ALL_GOV) @Post('approvals/:id/escalate')
  async escalate(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parseInput(z.object({ reason: z.string().trim().max(2000).optional() }), body)
    return this.approvals.escalate(await this.scope(req), req.user, parseInput(Id, id), reason)
  }

  // ---------------------------------------------------------------- health alerts

  @Roles(...ALL_GOV) @Get('alerts')
  async listAlerts(@Req() req: Req_) { return this.alerts.list(await this.scope(req)) }

  @Roles(...ALL_GOV) @Post('alerts/reach')
  async reach(@Req() req: Req_, @Body() body: unknown) {
    const i = parseInput(
      z.object({ target: AlertBody.shape.target, category: z.string().default('outbreak'), type: z.enum(['advisory', 'emergency']).default('advisory') }),
      body,
    )
    return this.alerts.reachEstimate(await this.scope(req), i.target, i.category, i.type === 'emergency')
  }

  @Roles(...ALL_GOV) @Post('alerts')
  async createAlert(@Req() req: Req_, @Body() body: unknown) {
    return this.alerts.create(await this.scope(req), req.user, parseInput(AlertBody, body))
  }

  @Roles(...ALL_GOV) @Post('alerts/:id/second-approve')
  async secondApprove(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { asPeer } = parseInput(z.object({ asPeer: z.boolean().optional() }), body)
    return this.alerts.secondApprove(await this.scope(req), req.user, parseInput(Id, id), !!asPeer)
  }

  @Roles(...ALL_GOV) @Post('alerts/:id/send')
  async sendAlert(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { scheduledAt } = parseInput(z.object({ scheduledAt: z.string().datetime({ offset: true }).optional() }), body)
    return this.alerts.sendDraft(await this.scope(req), req.user, parseInput(Id, id), scheduledAt)
  }

  @Roles(...ALL_GOV) @Post('alerts/:id/cancel')
  async cancelAlert(@Req() req: Req_, @Param('id') id: string) {
    return this.alerts.cancel(await this.scope(req), req.user, parseInput(Id, id))
  }

  // ---------------------------------------------------------------- blood & organ

  @Roles(...ALL_GOV) @Get('blood')
  async getBlood(@Req() req: Req_) { return this.blood.blood(await this.scope(req)) }

  @Roles(...ALL_GOV) @Post('blood/requests/:id/notify-donors')
  async notifyDonors(@Req() req: Req_, @Param('id') id: string) {
    return this.blood.notifyDonors(await this.scope(req), req.user, parseInput(Id, id))
  }

  // ---------------------------------------------------------------- directory, admins, grievances

  @Roles(...ALL_GOV) @Get('directory')
  async getDirectory(@Req() req: Req_, @Query() q: unknown) {
    const i = parseInput(
      z.object({
        kind: z.enum(['doctors', 'facilities', 'staff']).default('doctors'),
        status: z.enum(['all', 'active', 'pending', 'suspended']).default('all'),
        q: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      q,
    )
    return this.directory.directory(await this.scope(req), i.kind, i.status, i.q ?? null, i.limit, i.offset)
  }

  @Roles(...ALL_GOV) @Get('admins')
  async admins(@Req() req: Req_) { return this.directory.admins(await this.scope(req)) }

  @Roles(...ALL_GOV) @Get('grievances')
  async grievances(@Req() req: Req_) { return this.directory.grievances(await this.scope(req)) }

  // ---------------------------------------------------------------- audit, logs, reports

  @Roles(...ALL_GOV) @Get('audit')
  async audit(@Req() req: Req_) { return this.oversight.auditOverview(await this.scope(req)) }

  @Roles(...ALL_GOV) @Post('audit/flags/:id/justify')
  async justify(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parseInput(z.object({ note: z.string().trim().min(1, 'A note is required').max(1000) }), body)
    return this.oversight.justifyFlag(await this.scope(req), req.user, parseInput(Id, id), note)
  }

  @Roles(...ALL_GOV) @Post('audit/flags/:id/escalate')
  async escalateFlag(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { note } = parseInput(z.object({ note: z.string().trim().min(1, 'A note is required').max(1000) }), body)
    return this.oversight.escalateFlag(await this.scope(req), req.user, parseInput(Id, id), note)
  }

  @Roles(...ALL_GOV) @Get('logs')
  async logs(@Req() req: Req_, @Query() q: unknown) {
    const i = parseInput(
      z.object({
        type: z.enum(['all', 'access', 'breakglass', 'admin', 'export', 'signin']).default('all'),
        q: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(40),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      q,
    )
    return this.oversight.logs(await this.scope(req), i)
  }

  @Roles(...ALL_GOV) @Get('reports')
  async reports(@Req() req: Req_) { return this.oversight.reports(await this.scope(req)) }

  @Roles(...ALL_GOV) @Post('reports/exports')
  async createExport(@Req() req: Req_, @Body() body: unknown) {
    const i = parseInput(
      z.object({ report: z.string().trim().min(1).max(40), period: z.enum(['7d', '30d', 'quarter', 'fy']).default('30d'), format: z.enum(['csv', 'pdf']).default('csv') }),
      body,
    )
    return this.oversight.createExport(await this.scope(req), req.user, i)
  }

  @Roles(...ALL_GOV) @Get('reports/exports/:id/download')
  async download(@Req() req: Req_, @Param('id') id: string, @Res() res: any) {
    const f = await this.oversight.downloadExport(await this.scope(req), req.user, parseInput(Id, id))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`)
    res.send(f.content)
  }

  // ---------------------------------------------------------------- central only: system and AI governance

  @Roles(Role.CENTRAL_ADMIN) @Get('system')
  async system(@Req() req: Req_) { return this.platform.system(await this.scope(req)) }

  @Roles(Role.CENTRAL_ADMIN) @Post('system/flags/:code')
  async setFlag(@Req() req: Req_, @Param('code') code: string, @Body() body: unknown) {
    const i = parseInput(z.object({ enabled: z.boolean(), reason: z.string().trim().min(3, 'A reason is required').max(500), asPeer: z.boolean().optional() }), body)
    return this.platform.setFlag(await this.scope(req), req.user, parseInput(z.string().regex(/^[a-z_]{1,30}$/), code), i)
  }

  @Roles(Role.CENTRAL_ADMIN) @Get('ai')
  async ai(@Req() req: Req_) { return this.platform.ai(await this.scope(req)) }

  @Roles(Role.CENTRAL_ADMIN) @Post('ai/release-requests/:id/signoff')
  async signoff(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const i = parseInput(z.object({ decision: z.enum(['approve', 'hold']), reason: z.string().trim().max(1000).optional(), asPeer: z.boolean().optional() }), body)
    return this.platform.signoff(await this.scope(req), req.user, parseInput(Id, id), i)
  }

  @Roles(Role.CENTRAL_ADMIN) @Post('ai/release-requests/:id/release')
  async release(@Req() req: Req_, @Param('id') id: string) {
    return this.platform.release(await this.scope(req), req.user, parseInput(Id, id))
  }

  @Roles(Role.CENTRAL_ADMIN) @Post('ai/safety-reports/:id/status')
  async safety(@Req() req: Req_, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parseInput(z.object({ status: z.enum(['reviewing', 'closed']) }), body)
    return this.platform.updateSafetyReport(await this.scope(req), req.user, parseInput(Id, id), status)
  }
}
