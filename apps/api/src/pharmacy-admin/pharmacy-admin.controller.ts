import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { parseInput } from '../hospital-admin/hospital-context'
import { PharmacyAdminService } from './pharmacy-admin.service'
import { PharmacyStockService } from './pharmacy-stock.service'
import {
  AdjustBodySchema,
  AuditQuerySchema,
  CreatePharmacistBodySchema,
  DeactivateBodySchema,
  DocumentCreateSchema,
  InventoryQuerySchema,
  InviteBodySchema,
  PharmacistsQuerySchema,
  PoCreateSchema,
  PoQuerySchema,
  PoSendBackSchema,
  ProfilePatchSchema,
  PublishBodySchema,
  RecallConfirmSchema,
} from './pharmacy-admin.schemas'

type Req = { user: AuthenticatedUser }

/** Pharmacy admin console. Every route works on the one pharmacy of the logged-in pharmacy admin. */
@Controller('api/v1/pharmacy-admin')
@Roles(Role.PHARMACY_ADMIN)
export class PharmacyAdminController {
  constructor(
    private readonly admin: PharmacyAdminService,
    private readonly stock: PharmacyStockService,
  ) {}

  @Get('overview')
  overview(@Req() req: Req) {
    return this.admin.overview(req.user)
  }

  // ---- pharmacists
  @Get('pharmacists')
  pharmacists(@Req() req: Req, @Query() query: unknown) {
    return this.admin.listPharmacists(req.user, parseInput(PharmacistsQuerySchema, query).q)
  }

  @Post('pharmacists')
  async createPharmacist(@Req() req: Req, @Body() body: unknown) {
    const dto = parseInput(CreatePharmacistBodySchema, body)
    const ctx = await this.admin.context(req.user)
    return this.admin.createPharmacist(req.user, ctx, dto)
  }

  @Post('pharmacists/:userId/deactivate')
  deactivate(@Req() req: Req, @Param('userId', ParseUUIDPipe) userId: string, @Body() body: unknown) {
    return this.admin.deactivatePharmacist(req.user, userId, parseInput(DeactivateBodySchema, body).reason)
  }

  @Post('pharmacists/:userId/reactivate')
  reactivate(@Req() req: Req, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.admin.reactivatePharmacist(req.user, userId)
  }

  @Post('invites')
  invite(@Req() req: Req, @Body() body: unknown) {
    return this.admin.invite(req.user, parseInput(InviteBodySchema, body))
  }

  @Post('invites/:id/resend')
  resend(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.resendInvite(req.user, id)
  }

  @Post('invites/:id/revoke')
  revoke(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.revokeInvite(req.user, id)
  }

  // ---- inventory
  @Get('inventory')
  inventory(@Req() req: Req, @Query() query: unknown) {
    return this.stock.inventory(req.user, parseInput(InventoryQuerySchema, query))
  }

  @Patch('inventory/:id/publish')
  publish(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.stock.setPublished(req.user, id, parseInput(PublishBodySchema, body).published)
  }

  @Post('inventory/:id/adjust')
  adjust(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.stock.adjust(req.user, id, parseInput(AdjustBodySchema, body))
  }

  // ---- purchase orders
  @Get('purchase-orders')
  purchaseOrders(@Req() req: Req, @Query() query: unknown) {
    return this.stock.listPurchaseOrders(req.user, parseInput(PoQuerySchema, query).status)
  }

  @Get('suppliers')
  suppliers(@Req() req: Req) {
    return this.stock.suppliers(req.user)
  }

  @Get('purchase-orders/:id')
  purchaseOrder(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.stock.purchaseOrder(req.user, id)
  }

  @Post('purchase-orders')
  createPurchaseOrder(@Req() req: Req, @Body() body: unknown) {
    return this.stock.createPurchaseOrder(req.user, parseInput(PoCreateSchema, body))
  }

  @Post('purchase-orders/:id/approve')
  approvePo(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.stock.approvePurchaseOrder(req.user, id)
  }

  @Post('purchase-orders/:id/send-back')
  sendBackPo(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.stock.sendBackPurchaseOrder(req.user, id, parseInput(PoSendBackSchema, body).reason)
  }

  // ---- recalls and expiry
  @Get('recalls')
  recalls(@Req() req: Req) {
    return this.stock.recalls(req.user)
  }

  @Post('recalls/:id/confirm')
  confirmRecall(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.stock.confirmRecall(req.user, id, parseInput(RecallConfirmSchema, body).note)
  }

  @Post('recalls/:id/undo')
  undoRecall(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    return this.stock.undoRecall(req.user, id)
  }

  @Get('expiry')
  expiry(@Req() req: Req) {
    return this.stock.expiry(req.user)
  }

  // ---- compliance, audit, profile
  @Get('compliance')
  compliance(@Req() req: Req) {
    return this.admin.compliance(req.user)
  }

  @Post('compliance/documents')
  addDocument(@Req() req: Req, @Body() body: unknown) {
    return this.admin.addDocument(req.user, parseInput(DocumentCreateSchema, body))
  }

  @Get('audit')
  audit(@Req() req: Req, @Query() query: unknown) {
    return this.admin.auditLog(req.user, parseInput(AuditQuerySchema, query))
  }

  @Get('profile')
  profile(@Req() req: Req) {
    return this.admin.profile(req.user)
  }

  @Patch('profile')
  updateProfile(@Req() req: Req, @Body() body: unknown) {
    return this.admin.updateOpeningHours(req.user, parseInput(ProfilePatchSchema, body).openingHours)
  }
}
