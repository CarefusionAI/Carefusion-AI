import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import { Role, SpecialCategoryRequestSchema, UpdateCitizenProfileRequestSchema } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { parseBody, requireCitizen } from './citizen-context'
import { CitizenService } from './citizen.service'

/** Citizen profile and special categories. Every route works only on the logged-in citizen's own data. */
@Controller('api/v1/citizen')
@Roles(Role.CITIZEN)
export class CitizenController {
  constructor(private readonly citizens: CitizenService) {}

  @Get('profile')
  getProfile(@Req() req: { user?: AuthenticatedUser }) {
    const { personId } = requireCitizen(req)
    return this.citizens.getProfile(personId)
  }

  @Patch('profile')
  updateProfile(@Req() req: { user?: AuthenticatedUser }, @Body() body: unknown) {
    const { personId } = requireCitizen(req)
    return this.citizens.updateProfile(personId, parseBody(UpdateCitizenProfileRequestSchema, body))
  }

  @Get('special-categories/types')
  listSpecialCategoryTypes() {
    return this.citizens.listSpecialCategoryTypes()
  }

  @Post('special-categories')
  addSpecialCategory(@Req() req: { user?: AuthenticatedUser }, @Body() body: unknown) {
    const { personId, userId } = requireCitizen(req)
    return this.citizens.addSpecialCategory(personId, userId, parseBody(SpecialCategoryRequestSchema, body))
  }

  @Post('special-categories/:id/end')
  endSpecialCategory(@Req() req: { user?: AuthenticatedUser }, @Param('id', ParseUUIDPipe) id: string) {
    const { personId } = requireCitizen(req)
    return this.citizens.endSpecialCategory(personId, id)
  }
}
