import { ForbiddenException, Logger } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'
import { translateDbError } from '../hospital-admin/hospital-context'

const logger = new Logger('PharmacyAdmin')

/** The pharmacy a pharmacy admin works for. Resolved from the login, never from the request. */
export interface PharmacyContext {
  userId: string
  personId: string
  pharmacyId: string
  pharmacyName: string
  districtId: string
  stateId: number | null
  adminName: string
}

export async function resolvePharmacyContext(db: DatabaseService, user: AuthenticatedUser): Promise<PharmacyContext> {
  const rows = await db.query<{
    user_id: string
    person_id: string
    pharmacy_id: string
    pharmacy_name: string
    district_id: string
    state_id: number | null
    full_name: string
  }>(
    `SELECT au.id AS user_id, au.person_id, ph.id AS pharmacy_id, ph.name AS pharmacy_name, ph.district_id,
            d.state_id, p.full_name
       FROM identity.app_user au
       JOIN identity.person p ON p.id = au.person_id
       JOIN identity.pharmacy_admin_profile pa ON pa.user_id = au.id
       JOIN org.pharmacy ph ON ph.id = pa.pharmacy_id
       JOIN geo.district d ON d.id = ph.district_id
      WHERE au.account_type = 'pharmacy_admin'::identity.account_type
        AND au.status = 'active'::identity.account_status
        AND ( ($1::uuid IS NOT NULL AND au.id = $1::uuid)
           OR ($1::uuid IS NULL AND au.keycloak_sub = $2) )
      LIMIT 1`,
    [user.userId ?? null, user.id],
  )
  const r = rows[0]
  if (!r) {
    throw new ForbiddenException({ success: false, errorMessage: 'No active pharmacy admin account is linked to this login.' })
  }
  return {
    userId: r.user_id,
    personId: r.person_id,
    pharmacyId: r.pharmacy_id,
    pharmacyName: r.pharmacy_name,
    districtId: r.district_id,
    stateId: r.state_id,
    adminName: r.full_name,
  }
}

/** One transaction with the request context the scoped views read (app.user_id / app.account_type). */
export async function withPharmacyTx<T>(
  db: DatabaseService,
  ctx: PharmacyContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.getClient()
  try {
    await client.query('BEGIN')
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.person_id', $2, true),
              set_config('app.account_type', 'pharmacy_admin', true)`,
      [ctx.userId, ctx.personId],
    )
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (e) {
      logger.warn(`Rollback failed: ${e}`)
    }
    throw translateDbError(err)
  } finally {
    client.release()
  }
}

/** Pharmacy-scoped audit row (shown in audit.v_scoped_log). Call inside withPharmacyTx. */
export async function auditPharmacy(
  client: PoolClient,
  ctx: PharmacyContext,
  action: string,
  summary: string,
  opts: { entityType?: string; entityId?: string; details?: Record<string, unknown> } = {},
): Promise<void> {
  await client.query(
    `SELECT audit.log_scoped($1::text, NULL::uuid, $2::uuid, $3::uuid, $4::text, $5::uuid, NULL::uuid, NULL::uuid,
                             $6::jsonb, $7::smallint)`,
    [
      action,
      ctx.pharmacyId,
      ctx.districtId,
      opts.entityType ?? null,
      opts.entityId ?? null,
      JSON.stringify({ ...(opts.details ?? {}), summary }),
      ctx.stateId ?? 0,
    ],
  )
}
