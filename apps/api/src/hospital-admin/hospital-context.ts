import { BadRequestException, ConflictException, ForbiddenException, HttpException, Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { PoolClient } from 'pg'
import type { ZodType, ZodTypeDef } from 'zod'
import type { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'

const logger = new Logger('HospitalAdmin')

/** The facility a hospital admin works for. Resolved from the login, never from the request body. */
export interface HospitalContext {
  userId: string
  personId: string
  hospitalId: string
  hospitalName: string
  districtId: string
  stateId: number | null
  adminName: string
}

/**
 * Finds the hospital admin account behind the logged-in user and the one hospital it belongs to.
 * Demo mode: the auth guard already put the first active hospital admin's ids on `user`.
 * Real JWT: the account is found through the Keycloak subject.
 */
export async function resolveHospitalContext(db: DatabaseService, user: AuthenticatedUser): Promise<HospitalContext> {
  const rows = await db.query<{
    user_id: string
    person_id: string
    hospital_id: string
    hospital_name: string
    district_id: string
    state_id: number | null
    full_name: string
  }>(
    `SELECT au.id AS user_id, au.person_id, h.id AS hospital_id, h.name AS hospital_name, h.district_id,
            d.state_id, p.full_name
       FROM identity.app_user au
       JOIN identity.person p ON p.id = au.person_id
       JOIN identity.hospital_admin_profile ha ON ha.user_id = au.id
       JOIN org.hospital h ON h.id = ha.hospital_id
       JOIN geo.district d ON d.id = h.district_id
      WHERE au.account_type = 'hospital_admin'::identity.account_type
        AND au.status = 'active'::identity.account_status
        AND ( ($1::uuid IS NOT NULL AND au.id = $1::uuid)
           OR ($1::uuid IS NULL AND au.keycloak_sub = $2) )
      LIMIT 1`,
    [user.userId ?? null, user.id],
  )
  const r = rows[0]
  if (!r) {
    throw new ForbiddenException({ success: false, errorMessage: 'No active hospital admin account is linked to this login.' })
  }
  return {
    userId: r.user_id,
    personId: r.person_id,
    hospitalId: r.hospital_id,
    hospitalName: r.hospital_name,
    districtId: r.district_id,
    stateId: r.state_id,
    adminName: r.full_name,
  }
}

/**
 * Runs `fn` in one transaction with the request context the database views and functions read
 * (app.user_id / app.person_id / app.account_type), so scoped views such as
 * access.v_break_glass_review and audit.v_scoped_log only show this admin's hospital.
 */
export async function withHospitalTx<T>(
  db: DatabaseService,
  ctx: HospitalContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.getClient()
  try {
    await client.query('BEGIN')
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.person_id', $2, true),
              set_config('app.account_type', 'hospital_admin', true)`,
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

/** Writes a facility-scoped audit row (shown in audit.v_scoped_log). Call inside withHospitalTx. */
export async function auditScoped(
  client: PoolClient,
  ctx: HospitalContext,
  action: string,
  summary: string,
  opts: { entityType?: string; entityId?: string; details?: Record<string, unknown> } = {},
): Promise<void> {
  await client.query(
    `SELECT audit.log_scoped($1::text, $2::uuid, NULL::uuid, $3::uuid, $4::text, $5::uuid, NULL::uuid, NULL::uuid,
                             $6::jsonb, $7::smallint)`,
    [
      action,
      ctx.hospitalId,
      ctx.districtId,
      opts.entityType ?? null,
      opts.entityId ?? null,
      JSON.stringify({ ...(opts.details ?? {}), summary }),
      ctx.stateId ?? 0,
    ],
  )
}

/** The "now" of the demo. Set DEMO_NOW (ISO timestamp) to freeze the demo clock; default is the real time. */
export function demoNow(config: ConfigService): Date {
  const raw = config.get<string>('DEMO_NOW')
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

export function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data
}

/** Turns database rule errors (CFxxx codes, unique and check violations) into clear HTTP errors. */
export function translateDbError(err: unknown): unknown {
  if (err instanceof HttpException) return err
  const e = err as { code?: string; message?: string; constraint?: string }
  const msg = e?.message ?? ''
  if (msg.includes('CF140')) {
    return new ForbiddenException({ success: false, errorMessage: 'This permission is a national rule and cannot be changed by a hospital.' })
  }
  if (msg.includes('CF160')) {
    const notMine = msg.includes('not in your hospital') || msg.includes('only the hospital admin')
    return notMine
      ? new ForbiddenException({ success: false, errorMessage: 'This emergency access is not in your hospital.' })
      : new ConflictException({ success: false, errorMessage: msg.replace(/^.*CF160:\s*/, '') })
  }
  if (e?.code === '23505') {
    return new ConflictException({ success: false, errorMessage: 'This record already exists.' })
  }
  if (e?.code === '23514' || e?.code === '23503' || e?.code === '22P02') {
    return new BadRequestException({ success: false, errorMessage: 'Some of the submitted details are not valid.' })
  }
  return err
}

export const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  lab: 'Lab tech',
  radiology: 'Radiology tech',
  pharmacist: 'Pharmacist',
  front_desk: 'Front desk',
}

/** "Anjali Menon" -> "Anjali M." (complaint and review lists show short names). */
export function shortName(full: string | null | undefined): string {
  if (!full) return 'Citizen'
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`
}
