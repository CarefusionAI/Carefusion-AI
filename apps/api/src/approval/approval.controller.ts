import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { ZodType, ZodTypeDef } from 'zod'
import { Role } from '@carefusion/shared'
import type { ApprovalItem, ApproveRejectResponse } from '@carefusion/shared'
import { Public } from '../auth/public.decorator'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { ApprovalService } from './approval.service'
import type { AdminLevel, InboxRow } from './approval.service'

function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

const IdParamSchema = z.string().uuid()
const ApproveBodySchema = z.object({ reason: z.string().trim().min(1).max(2000).optional() })
const RejectBodySchema = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(2000) })

const ROLE_TO_LEVEL: Partial<Record<Role, AdminLevel>> = {
  [Role.DISTRICT_ADMIN]: 'district',
  [Role.STATE_ADMIN]: 'state',
  [Role.ZONAL_ADMIN]: 'zonal',
  [Role.CENTRAL_ADMIN]: 'central',
}

function toItem(r: InboxRow): ApprovalItem {
  return {
    id: r.id,
    subjectType: r.subject_type,
    step: r.step,
    status: r.status,
    submittedAt: new Date(r.submitted_at).toISOString(),
    dueAt: new Date(r.due_at).toISOString(),
    checkResults: r.check_results ?? {},
    subjectUserId: r.subject_user_id,
    applicantName: r.applicant_name,
    applicantAccountType: r.applicant_account_type,
  }
}

/** Approval inbox for the admin chain (district -> state -> zonal -> central). */
@Controller('api/v1/admin/approvals')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Roles(Role.DISTRICT_ADMIN, Role.STATE_ADMIN, Role.ZONAL_ADMIN, Role.CENTRAL_ADMIN)
  @Get()
  async inbox(@Req() req: { user: AuthenticatedUser }): Promise<ApprovalItem[]> {
    const user = this.currentUser(req)
    const rows = await this.approvalService.getInbox(user, this.levelOf(user))
    return rows.map(toItem)
  }

  @Roles(Role.DISTRICT_ADMIN, Role.STATE_ADMIN, Role.ZONAL_ADMIN, Role.CENTRAL_ADMIN)
  @Post(':id/approve')
  approve(@Req() req: { user: AuthenticatedUser }, @Param('id') id: string, @Body() body: unknown): Promise<ApproveRejectResponse> {
    const user = this.currentUser(req)
    this.levelOf(user)
    const requestId = parseBody(IdParamSchema, id)
    const { reason } = parseBody(ApproveBodySchema, body)
    return this.approvalService.approve(requestId, user.id, reason, user)
  }

  @Roles(Role.DISTRICT_ADMIN, Role.STATE_ADMIN, Role.ZONAL_ADMIN, Role.CENTRAL_ADMIN)
  @Post(':id/reject')
  reject(@Req() req: { user: AuthenticatedUser }, @Param('id') id: string, @Body() body: unknown): Promise<ApproveRejectResponse> {
    const user = this.currentUser(req)
    this.levelOf(user)
    const requestId = parseBody(IdParamSchema, id)
    const { reason } = parseBody(RejectBodySchema, body)
    return this.approvalService.reject(requestId, user.id, reason, user)
  }

  /**
   * Escalates overdue requests. Public on purpose so a cron job can call it later
   * (no user session there). It only moves requests up the chain and takes no input.
   * It needs the CRON_SECRET in the x-cron-secret header; with no CRON_SECRET set it is closed to everyone.
   */
  @Public()
  @Post('escalate')
  async escalate(@Req() req: { headers: Record<string, string | string[] | undefined> }): Promise<{ success: boolean; escalated: number }> {
    const expected = process.env.CRON_SECRET ?? ''
    const given = String(req.headers['x-cron-secret'] ?? '')
    const a = createHash('sha256').update(given).digest()
    const b = createHash('sha256').update(expected).digest()
    if (!expected || !timingSafeEqual(a, b)) throw new ForbiddenException({ success: false, errorMessage: 'Not allowed.' })
    const escalated = await this.approvalService.escalateOverdue()
    return { success: true, escalated }
  }

  // ---------- helpers ----------

  private currentUser(req: { user?: AuthenticatedUser }): AuthenticatedUser {
    if (!req.user) throw new ForbiddenException({ success: false, errorMessage: 'Not signed in.' })
    return req.user
  }

  private levelOf(user: AuthenticatedUser): AdminLevel {
    const level = ROLE_TO_LEVEL[user.role]
    if (!level) throw new ForbiddenException({ success: false, errorMessage: 'Not an approving admin role.' })
    return level
  }
}
