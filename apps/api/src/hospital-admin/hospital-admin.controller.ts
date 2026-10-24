import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { parseInput } from './hospital-context'
import { HospitalAdminService } from './hospital-admin.service'
import { HospitalOpsService } from './hospital-ops.service'
import { HospitalOversightService } from './hospital-oversight.service'
import {
  AdmissionsQuerySchema,
  ApprovalFilterSchema,
  ApproveBodySchema,
  AuditQuerySchema,
  BedListQuerySchema,
  BedStatusSchema,
  BreakGlassEscalateSchema,
  BreakGlassJustifySchema,
  ComplaintAssignSchema,
  ComplaintQuerySchema,
  ComplaintResolveSchema,
  CreateStaffBodySchema,
  DepartmentCreateSchema,
  DepartmentUpdateSchema,
  DocumentCheckSchema,
  PermissionChangesSchema,
  ProfileChangeSchema,
  RejectBodySchema,
  ReviewQuerySchema,
  ReviewReplySchema,
  RosterPublishSchema,
  RosterQuerySchema,
  RosterUpdateSchema,
  StaffListQuerySchema,
} from './hospital-admin.schemas'

type Req = { user: AuthenticatedUser }

/** Hospital admin console. Every route works on the one hospital of the logged-in hospital admin. */
@Controller('api/v1/hospital-admin')
@Roles(Role.HOSPITAL_ADMIN)
export class HospitalAdminController {
  constructor(
    private readonly admin: HospitalAdminService,
    private readonly ops: HospitalOpsService,
    private readonly oversight: HospitalOversightService,
  ) {}

  // ---- overview
  @Get('overview')
  overview(@Req() req: Req) {
    return this.admin.overview(req.user)
  }

  // ---- applicants and approvals
  @Get('approvals')
  approvals(@Req() req: Req, @Query() query: unknown) {
    return this.admin.listApprovals(req.user, parseInput(ApprovalFilterSchema, query).filter)
  }

  @Get('approvals/:id')
  approval(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getApproval(req.user, id)
  }

  @Post('approvals/:id/documents/:index/check')
  checkDocument(
    @Req() req: Req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: unknown,
  ) {
    return this.admin.setDocumentChecked(req.user, id, index, parseInput(DocumentCheckSchema, body).checked)
  }

  @Post('approvals/:id/approve')
  approve(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.admin.approve(req.user, id, parseInput(ApproveBodySchema, body).reason)
  }

  @Post('approvals/:id/reject')
  reject(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reasonCode, reason } = parseInput(RejectBodySchema, body)
    return this.admin.reject(req.user, id, reasonCode, reason)
  }

  // ---- staff
  @Get('staff')
  staff(@Req() req: Req, @Query() query: unknown) {
    return this.admin.listStaff(req.user, parseInput(StaffListQuerySchema, query))
  }

  @Post('staff')
  async createStaff(@Req() req: Req, @Body() body: unknown) {
    const dto = parseInput(CreateStaffBodySchema, body)
    const ctx = await this.admin.context(req.user)
    return this.admin.createStaff(req.user, ctx, dto)
  }

  // ---- permissions
  @Get('permissions')
  permissions(@Req() req: Req) {
    return this.admin.permissionMatrix(req.user)
  }

  @Put('permissions')
  updatePermissions(@Req() req: Req, @Body() body: unknown) {
    return this.admin.updatePermissions(req.user, parseInput(PermissionChangesSchema, body).changes)
  }

  // ---- departments, beds, admissions
  @Get('departments')
  departments(@Req() req: Req) {
    return this.ops.departments(req.user)
  }

  @Post('departments')
  createDepartment(@Req() req: Req, @Body() body: unknown) {
    return this.ops.createDepartment(req.user, parseInput(DepartmentCreateSchema, body).name)
  }

  @Patch('departments/:id')
  updateDepartment(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.ops.updateDepartment(req.user, id, parseInput(DepartmentUpdateSchema, body))
  }

  @Get('beds')
  beds(@Req() req: Req, @Query() query: unknown) {
    return this.ops.beds(req.user, parseInput(BedListQuerySchema, query))
  }

  @Patch('beds/:id')
  setBedStatus(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.ops.setBedStatus(req.user, id, parseInput(BedStatusSchema, body).status)
  }

  @Get('admissions')
  admissions(@Req() req: Req, @Query() query: unknown) {
    return this.ops.admissions(req.user, parseInput(AdmissionsQuerySchema, query))
  }

  // ---- roster
  @Get('roster')
  roster(@Req() req: Req, @Query() query: unknown) {
    return this.ops.roster(req.user, parseInput(RosterQuerySchema, query).weekStart)
  }

  @Put('roster')
  updateRoster(@Req() req: Req, @Body() body: unknown) {
    const dto = parseInput(RosterUpdateSchema, body)
    return this.ops.updateRoster(req.user, dto.weekStart, dto.cells)
  }

  @Post('roster/publish')
  publishRoster(@Req() req: Req, @Body() body: unknown) {
    return this.ops.publishRoster(req.user, parseInput(RosterPublishSchema, body).weekStart)
  }

  // ---- break-glass review
  @Get('break-glass')
  breakGlass(@Req() req: Req) {
    return this.oversight.listBreakGlass(req.user)
  }

  @Post('break-glass/:sessionId/justify')
  justify(@Req() req: Req, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() body: unknown) {
    return this.oversight.justifyBreakGlass(req.user, sessionId, parseInput(BreakGlassJustifySchema, body).note)
  }

  @Post('break-glass/:sessionId/escalate')
  escalate(@Req() req: Req, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() body: unknown) {
    return this.oversight.escalateBreakGlass(req.user, sessionId, parseInput(BreakGlassEscalateSchema, body).note)
  }

  // ---- audit log
  @Get('audit')
  audit(@Req() req: Req, @Query() query: unknown) {
    return this.oversight.auditLog(req.user, parseInput(AuditQuerySchema, query))
  }

  // ---- complaints
  @Get('complaints')
  complaints(@Req() req: Req, @Query() query: unknown) {
    return this.oversight.listComplaints(req.user, parseInput(ComplaintQuerySchema, query))
  }

  @Get('complaints/:id/timeline')
  complaintTimeline(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.oversight.complaintTimeline(req.user, id)
  }

  @Post('complaints/:id/assign')
  assignComplaint(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseInput(ComplaintAssignSchema, body)
    return this.oversight.assignComplaint(req.user, id, dto.assigneeUserId, dto.note)
  }

  @Post('complaints/:id/resolve')
  resolveComplaint(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.oversight.resolveComplaint(req.user, id, parseInput(ComplaintResolveSchema, body).resolution)
  }

  // ---- reviews
  @Get('reviews')
  reviews(@Req() req: Req, @Query() query: unknown) {
    return this.oversight.listReviews(req.user, parseInput(ReviewQuerySchema, query))
  }

  @Post('reviews/:id/reply')
  replyToReview(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.oversight.replyToReview(req.user, id, parseInput(ReviewReplySchema, body).body)
  }

  // ---- hospital profile (a change is a request to the district admin)
  @Get('profile')
  profile(@Req() req: Req) {
    return this.admin.profile(req.user)
  }

  @Post('profile/change-requests')
  requestProfileChange(@Req() req: Req, @Body() body: unknown) {
    return this.admin.requestProfileChange(req.user, parseInput(ProfileChangeSchema, body))
  }
}
