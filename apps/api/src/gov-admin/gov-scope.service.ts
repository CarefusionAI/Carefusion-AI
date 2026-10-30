import { ForbiddenException, Injectable } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import type { GovLevel } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'
import { UUID_RE, num } from './gov-util'

export interface GovScope {
  level: GovLevel
  role: Role
  /** identity.app_user.id of the signed-in admin */
  userId: string
  personName: string
  postId: string
  zoneId: number | null
  stateId: number | null
  districtId: string | null
  /** 'Pathanamthitta' | 'Kerala' | 'South zone' | 'India' */
  unitName: string
  unitKind: 'district' | 'state' | 'zone' | 'national'
  /** Every district the admin may see. Taken from the admin post, never from the request. */
  districtIds: string[]
  stateIds: number[]
  /** Counts below this are hidden (admin.access_rule small_cell_min, default 5). */
  smallCellMin: number
}

const ROLE_LEVEL: Partial<Record<string, GovLevel>> = {
  [Role.DISTRICT_ADMIN]: 'district',
  [Role.STATE_ADMIN]: 'state',
  [Role.ZONAL_ADMIN]: 'zonal',
  [Role.CENTRAL_ADMIN]: 'central',
}

export const LEVEL_META: Record<
  GovLevel,
  { childKind: 'block' | 'district' | 'state'; childLabel: string; childPlural: string; escalateTo: string; createLevel: GovLevel | null }
> = {
  district: { childKind: 'block', childLabel: 'Block', childPlural: 'Blocks', escalateTo: 'the State admin', createLevel: null },
  state: { childKind: 'district', childLabel: 'District', childPlural: 'Districts', escalateTo: 'the Zonal admin', createLevel: 'district' },
  zonal: { childKind: 'state', childLabel: 'State', childPlural: 'States', escalateTo: 'the Central admin', createLevel: 'state' },
  central: { childKind: 'state', childLabel: 'State/UT', childPlural: 'States and UTs', escalateTo: 'the National Health Authority security cell', createLevel: 'zonal' },
}

@Injectable()
export class GovScopeService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Works out the admin's level and area from the current admin post (admin.admin_post).
   * Nothing in the request can widen it. A role without a matching, valid post is refused.
   */
  async resolve(user: AuthenticatedUser): Promise<GovScope> {
    const expected = ROLE_LEVEL[user.role]
    if (!expected) throw new ForbiddenException({ success: false, errorMessage: 'Not a government admin role.' })

    const appUserId = await this.appUserId(user)
    if (!appUserId) {
      throw new ForbiddenException({ success: false, errorMessage: 'No admin account found for this sign-in.' })
    }

    const rows = await this.db.query<{
      id: string
      level: GovLevel
      zone_id: number | null
      state_id: number | null
      district_id: string | null
      person_name: string
      zone_name: string | null
      state_name: string | null
      district_name: string | null
    }>(
      `SELECT ap.id, ap.level::text AS level, ap.zone_id, ap.state_id, ap.district_id, p.full_name AS person_name,
              z.name AS zone_name, s.name AS state_name, d.name AS district_name
         FROM admin.admin_post ap
         JOIN identity.app_user au ON au.id = ap.user_id AND au.status = 'active'
         JOIN identity.person p ON p.id = au.person_id
         LEFT JOIN geo.zone z ON z.id = ap.zone_id
         LEFT JOIN geo.state s ON s.id = ap.state_id
         LEFT JOIN geo.district d ON d.id = ap.district_id
        WHERE ap.user_id = $1::uuid AND ap.valid @> now()
        ORDER BY lower(ap.valid) DESC
        LIMIT 1`,
      [appUserId],
    )
    const post = rows[0]
    if (!post || post.level !== expected) {
      throw new ForbiddenException({ success: false, errorMessage: 'No active admin post for this role.' })
    }

    let districtIds: string[]
    let stateIds: number[]
    if (post.level === 'district') {
      districtIds = [post.district_id!]
      const st = await this.db.query<{ state_id: number }>('SELECT state_id FROM geo.district WHERE id = $1::uuid', [post.district_id])
      stateIds = st.map((r) => r.state_id)
    } else if (post.level === 'state') {
      districtIds = (await this.db.query<{ id: string }>('SELECT id FROM geo.district WHERE state_id = $1::smallint', [post.state_id])).map((r) => r.id)
      stateIds = [post.state_id!]
    } else if (post.level === 'zonal') {
      districtIds = (
        await this.db.query<{ id: string }>(
          'SELECT d.id FROM geo.district d JOIN geo.state s ON s.id = d.state_id WHERE s.zone_id = $1::smallint',
          [post.zone_id],
        )
      ).map((r) => r.id)
      stateIds = (await this.db.query<{ id: number }>('SELECT id FROM geo.state WHERE zone_id = $1::smallint', [post.zone_id])).map((r) => r.id)
    } else {
      districtIds = (await this.db.query<{ id: string }>('SELECT id FROM geo.district')).map((r) => r.id)
      stateIds = (await this.db.query<{ id: number }>('SELECT id FROM geo.state')).map((r) => r.id)
    }

    const rule = await this.db.query<{ value: unknown }>("SELECT value FROM admin.access_rule WHERE code = 'small_cell_min'")
    const smallCellMin = num(rule[0]?.value) ?? 5

    const unitName =
      post.level === 'district' ? post.district_name! : post.level === 'state' ? post.state_name! : post.level === 'zonal' ? `${post.zone_name} zone` : 'India'
    return {
      level: post.level,
      role: user.role,
      userId: appUserId,
      personName: post.person_name,
      postId: post.id,
      zoneId: post.zone_id,
      stateId: post.state_id,
      districtId: post.district_id,
      unitName,
      unitKind: post.level === 'district' ? 'district' : post.level === 'state' ? 'state' : post.level === 'zonal' ? 'zone' : 'national',
      districtIds,
      stateIds,
      smallCellMin,
    }
  }

  /** Other active admins of the same level and area (the possible second signers). */
  async peers(scope: GovScope): Promise<{ userId: string; name: string }[]> {
    return this.db.query<{ userId: string; name: string }>(
      `SELECT ap.user_id AS "userId", p.full_name AS name
         FROM admin.admin_post ap
         JOIN identity.app_user au ON au.id = ap.user_id AND au.status = 'active'
         JOIN identity.person p ON p.id = au.person_id
        WHERE ap.valid @> now()
          AND ap.level = $1::admin.admin_level
          AND ap.user_id <> $2::uuid
          AND ap.zone_id IS NOT DISTINCT FROM $3::smallint
          AND ap.state_id IS NOT DISTINCT FROM $4::smallint
          AND ap.district_id IS NOT DISTINCT FROM $5::uuid
        ORDER BY lower(ap.valid), p.full_name`,
      [scope.level, scope.userId, scope.zoneId, scope.stateId, scope.districtId],
    )
  }

  /** Is this district inside the admin's area? */
  inScope(scope: GovScope, districtId: string | null | undefined): boolean {
    return !!districtId && scope.districtIds.includes(districtId)
  }

  private async appUserId(user: AuthenticatedUser): Promise<string | null> {
    if (user.userId && UUID_RE.test(user.userId)) return user.userId
    // Real Keycloak sign-in: the JWT subject is stored in app_user.keycloak_sub.
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM identity.app_user WHERE keycloak_sub = $1 AND status = 'active' LIMIT 1`,
      [user.id],
    )
    return rows[0]?.id ?? null
  }
}
