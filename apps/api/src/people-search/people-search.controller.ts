import { Controller, Get, Query, Req } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { PeopleSearchService } from './people-search.service'

/** GET /api/v1/admin/people-search?q=... (hospital and pharmacy admins only) */
@Controller('api/v1/admin/people-search')
export class PeopleSearchController {
  constructor(private readonly people: PeopleSearchService) {}

  @Roles(Role.HOSPITAL_ADMIN, Role.PHARMACY_ADMIN)
  @Get()
  search(@Req() req: { user: AuthenticatedUser }, @Query('q') q?: string) {
    return this.people.search(req.user, typeof q === 'string' ? q.slice(0, 80) : '')
  }
}
