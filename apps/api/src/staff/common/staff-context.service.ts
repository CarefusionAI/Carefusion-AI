import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../../database/database.service'
import type { AuthenticatedUser } from '../../auth/types'
import { mapDbError } from './staff.util'

export type StaffKind = 'nurse' | 'lab' | 'radiology' | 'pharmacist'

/** The logged-in staff member, resolved from identity.staff_profile / pharmacist_profile. */
export interface StaffActor {
  kind: StaffKind
  userId: string
  personId: string
  fullName: string
  hospitalId: string | null
  wardId: string | null
  pharmacyId: string | null
  accountType: 'staff' | 'pharmacist'
}

const EVENT_ROLE_BY_KIND: Record<StaffKind, string> = {
  nurse: 'nurse',
  lab: 'labtech',
  radiology: 'radiology',
  pharmacist: 'pharmacist',
}

export interface EmitEventInput {
  type: string
  toRoles: string[]
  toUserId?: string | null
  title: string
  text?: string
  href?: string
  entityType?: string
  entityId?: string
  patientPersonId?: string | null
  hospitalId?: string | null
  pharmacyId?: string | null
}

@Injectable()
export class StaffContextService {
  private readonly logger = new Logger(StaffContextService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Find the staff profile of the logged-in user and check it matches the route's staff kind.
   * Role isolation is enforced twice: by @Roles() on the controller and here against the database profile.
   */
  async resolve(user: AuthenticatedUser | undefined, kind: StaffKind): Promise<StaffActor> {
    if (!user?.userId) {
      throw new ForbiddenException({ success: false, errorMessage: 'No staff account is linked to this login' })
    }
    if (kind === 'pharmacist') {
      const rows = await this.db.query<any>(
        `SELECT au.id AS user_id, au.person_id, p.full_name, pp.pharmacy_id
           FROM identity.app_user au
           JOIN identity.person p ON p.id = au.person_id
           JOIN identity.pharmacist_profile pp ON pp.user_id = au.id
          WHERE au.id = $1 AND au.status = 'active'`,
        [user.userId],
      )
      const r = rows[0]
      if (!r) throw new ForbiddenException({ success: false, errorMessage: 'No active pharmacist profile for this login' })
      return {
        kind,
        userId: r.user_id,
        personId: r.person_id,
        fullName: r.full_name,
        hospitalId: null,
        wardId: null,
        pharmacyId: r.pharmacy_id,
        accountType: 'pharmacist',
      }
    }
    const rows = await this.db.query<any>(
      `SELECT au.id AS user_id, au.person_id, p.full_name, sp.hospital_id, sp.ward_id
         FROM identity.app_user au
         JOIN identity.person p ON p.id = au.person_id
         JOIN identity.staff_profile sp ON sp.user_id = au.id
        WHERE au.id = $1 AND au.status = 'active' AND sp.staff_role = $2::identity.staff_role`,
      [user.userId, kind],
    )
    const r = rows[0]
    if (!r) throw new ForbiddenException({ success: false, errorMessage: `No active ${kind} staff profile for this login` })
    return {
      kind,
      userId: r.user_id,
      personId: r.person_id,
      fullName: r.full_name,
      hospitalId: r.hospital_id,
      wardId: r.ward_id,
      pharmacyId: null,
      accountType: 'staff',
    }
  }

  /** Run `fn` in one transaction with the request context set (so triggers and row-level security see the user). */
  async tx<T>(actor: StaffActor, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.getClient()
    try {
      await client.query('BEGIN')
      await client.query("SELECT set_config('app.user_id', $1, true)", [actor.userId])
      await client.query("SELECT set_config('app.person_id', $1, true)", [actor.personId])
      await client.query("SELECT set_config('app.account_type', $1, true)", [actor.accountType])
      const out = await fn(client)
      await client.query('COMMIT')
      return out
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      return mapDbError(err)
    } finally {
      client.release()
    }
  }

  /**
   * Cross-role event: insert into engage.event (the "connected apps" feed). Runs inside the caller's transaction so
   * the event exists only if the work it announces was saved. Never addressed to district/state/zonal/central admins
   * when it is about a patient (database CHECK).
   */
  async emitEvent(client: PoolClient, actor: StaffActor, ev: EmitEventInput): Promise<string> {
    const rows = await client.query(
      `INSERT INTO engage.event
         (type, from_role, created_by_user_id, to_roles, to_user_id, title, text, href, entity_type, entity_id,
          patient_person_id, hospital_id, pharmacy_id)
       VALUES ($1, $2::engage.event_role, $3, $4::engage.event_role[], $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        ev.type,
        EVENT_ROLE_BY_KIND[actor.kind],
        actor.userId,
        ev.toRoles,
        ev.toUserId ?? null,
        ev.title,
        ev.text ?? '',
        ev.href ?? null,
        ev.entityType ?? null,
        ev.entityId ?? null,
        ev.patientPersonId ?? null,
        ev.hospitalId ?? actor.hospitalId,
        ev.pharmacyId ?? (ev.hospitalId ? null : actor.pharmacyId),
      ],
    )
    return rows.rows[0].id as string
  }

  /** Best-effort audit entry (never blocks the request). */
  async audit(client: PoolClient, action: string, opts: { entityType?: string; entityId?: string; patientPersonId?: string | null; details?: Record<string, unknown> } = {}): Promise<void> {
    try {
      await client.query('SAVEPOINT audit_sp')
      await client.query(`SELECT audit.log($1::text, $2::text, $3::uuid, $4::uuid, NULL, $5::jsonb, 0::smallint)`, [
        action,
        opts.entityType ?? null,
        opts.entityId ?? null,
        opts.patientPersonId ?? null,
        JSON.stringify(opts.details ?? {}),
      ])
      await client.query('RELEASE SAVEPOINT audit_sp')
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT audit_sp').catch(() => undefined)
      this.logger.warn(`audit ${action} failed: ${err}`)
    }
  }
}
