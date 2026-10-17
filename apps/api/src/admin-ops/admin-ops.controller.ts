import { BadRequestException, Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import type { ZodType, ZodTypeDef } from 'zod'
import {
  CreateAdminRequestSchema,
  CreatePharmacistRequestSchema,
  CreateStaffRequestSchema,
} from '@carefusion/shared'
import type { CreateAccountResponse } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { AdminOpsService } from './admin-ops.service'

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

const StatesQuerySchema = z.object({ zone_id: z.coerce.number().int().optional() })

/** Admins creating lower-level accounts. All identities are synthetic demo data. */
@Controller('api/v1/admin')
export class AdminOpsController {
  constructor(private readonly adminOps: AdminOpsService) {}

  @Roles('CENTRAL_ADMIN', 'ZONAL_ADMIN', 'STATE_ADMIN')
  @Post('create-admin')
  createAdmin(@Req() req: { user: AuthenticatedUser }, @Body() body: unknown): Promise<CreateAccountResponse> {
    const dto = parseBody(CreateAdminRequestSchema, body)
    return this.adminOps.createAdmin(req.user, dto)
  }

  @Roles('HOSPITAL_ADMIN')
  @Post('create-staff')
  createStaff(@Req() req: { user: AuthenticatedUser }, @Body() body: unknown): Promise<CreateAccountResponse> {
    const dto = parseBody(CreateStaffRequestSchema, body)
    return this.adminOps.createStaff(req.user, dto)
  }

  @Roles('PHARMACY_ADMIN')
  @Post('create-pharmacist')
  createPharmacist(@Req() req: { user: AuthenticatedUser }, @Body() body: unknown): Promise<CreateAccountResponse> {
    const dto = parseBody(CreatePharmacistRequestSchema, body)
    return this.adminOps.createPharmacist(req.user, dto)
  }

  @Roles('CENTRAL_ADMIN')
  @Get('zones')
  zones(): Promise<{ id: number; name: string }[]> {
    return this.adminOps.listZones()
  }

  @Roles('CENTRAL_ADMIN', 'ZONAL_ADMIN')
  @Get('states')
  states(@Query() query: unknown): Promise<{ id: number; code: string; name: string; zone_id: number }[]> {
    const { zone_id } = parseBody(StatesQuerySchema, query)
    return this.adminOps.listStates(zone_id)
  }
}
