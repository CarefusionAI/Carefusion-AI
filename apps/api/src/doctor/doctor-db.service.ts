import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'

export interface DoctorActor {
  userId: string
  personId: string
  name?: string
}

export interface EventInput {
  type: string
  toRoles: string[]
  title: string
  text?: string
  href?: string
  entityType?: string
  entityId?: string
  patientPersonId?: string | null
  hospitalId?: string | null
  pharmacyId?: string | null
  toUserId?: string | null
}

/** One request-scoped database transaction that runs as the low-privilege `cf_app` role with the doctor's context. */
export class DoctorTx {
  private hospital: string | null | undefined

  constructor(
    readonly client: PoolClient,
    readonly actor: DoctorActor,
  ) {}

  async query<T = any>(text: string, params?: unknown[]): Promise<T[]> {
    const res = await this.client.query(text, params as any[])
    return res.rows as T[]
  }

  async one<T = any>(text: string, params?: unknown[]): Promise<T | undefined> {
    return (await this.query<T>(text, params))[0]
  }

  /** The doctor's hospital (from the database, never from the request). */
  async hospitalId(): Promise<string> {
    if (this.hospital === undefined) {
      const row = await this.one<{ h: string | null }>('SELECT util.ctx_hospital_id() AS h')
      this.hospital = row?.h ?? null
    }
    if (!this.hospital) throw new ForbiddenException('This doctor account is not posted to a hospital')
    return this.hospital
  }

  /**
   * Run a block with owner rights (row-level security off) inside the same transaction.
   * Only for rows the API has already authorised itself (own rows, housekeeping, derived work-queue rows).
   */
  async asOwner<T>(fn: () => Promise<T>): Promise<T> {
    await this.client.query('RESET ROLE')
    try {
      return await fn()
    } finally {
      await this.client.query('SET LOCAL ROLE cf_app')
    }
  }

  /** Write one line to the hash-chained audit log, scoped to the doctor's hospital. */
  async audit(
    action: string,
    opts: { entityType?: string; entityId?: string; patient?: string | null; session?: string | null; details?: Record<string, unknown> } = {},
  ): Promise<void> {
    const hospital = await this.hospitalId().catch(() => null)
    // Runs with owner rights: audit.log_scoped does INSERT ... RETURNING on audit.activity_log, which needs SELECT,
    // and cf_app only has INSERT there (finding: make the audit functions SECURITY DEFINER in a new migration).
    // The request context (app.user_id, app.account_type) is kept, so the row still names the doctor.
    await this.asOwner(() =>
      this.query(
        `SELECT audit.log_scoped($1::text, $2::uuid, NULL, NULL, $3::text, $4::uuid, $5::uuid, $6::uuid, $7::jsonb)`,
        [action, hospital, opts.entityType ?? null, opts.entityId ?? null, opts.patient ?? null, opts.session ?? null, JSON.stringify(opts.details ?? {})],
      ),
    )
  }

  /** Push an event into the shared events feed (engage.event, migration 120). Returns the event id. */
  async emit(e: EventInput): Promise<string> {
    const rows = await this.query<{ id: string }>(
      `INSERT INTO engage.event
         (type, from_role, created_by_user_id, to_roles, to_user_id, title, text, href, entity_type, entity_id,
          patient_person_id, hospital_id, pharmacy_id)
       VALUES ($1, 'doctor', $2, $3::engage.event_role[], $4, $5, $6,
               COALESCE($7, (SELECT default_href FROM engage.event_type_ref WHERE code = $1)),
               $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        e.type,
        this.actor.userId,
        e.toRoles,
        e.toUserId ?? null,
        e.title,
        e.text ?? '',
        e.href ?? null,
        e.entityType ?? null,
        e.entityId ?? null,
        e.patientPersonId ?? null,
        e.hospitalId ?? null,
        e.pharmacyId ?? null,
      ],
    )
    return rows[0]!.id
  }
}

@Injectable()
export class DoctorDbService {
  private readonly logger = new Logger(DoctorDbService.name)

  constructor(private readonly db: DatabaseService) {}

  /** The logged-in doctor's ids (set by the auth guard). */
  actorOf(user: AuthenticatedUser | undefined): DoctorActor {
    if (!user?.userId || !user.personId) {
      throw new ForbiddenException('No doctor account is linked to this login')
    }
    return { userId: user.userId, personId: user.personId, name: user.username }
  }

  /** Run `fn` in a transaction as role cf_app with the request context set, so row-level security applies. */
  async run<T>(user: AuthenticatedUser | undefined, fn: (tx: DoctorTx) => Promise<T>): Promise<T> {
    const actor = this.actorOf(user)
    const client = await this.db.getClient()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE cf_app')
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.person_id', $2, true), set_config('app.account_type', 'doctor', true)`,
        [actor.userId, actor.personId],
      )
      const result = await fn(new DoctorTx(client, actor))
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw this.mapError(err)
    } finally {
      client.release()
    }
  }

  private mapError(err: any): unknown {
    if (err?.getStatus) return err // already an HttpException
    const code: string | undefined = err?.code
    const message: string = String(err?.message ?? 'Database error')
    const cf = /CF\d{3}/.exec(message)?.[0]
    const clean = message.replace(/^CF\d{3}:\s*/, '')
    if (code === '23514') {
      if (cf === 'CF023') return new ForbiddenException('A doctor account cannot open its own citizen record')
      if (cf === 'CF020' || cf === 'CF021' || cf === 'CF022') return new ForbiddenException(clean)
      return new BadRequestException(clean)
    }
    if (code === '42501') this.logger.warn(`Permission/RLS refusal: ${message}`)
    if (code === '42501') return new ForbiddenException('Not allowed by the record-access rules')
    if (code === '23505') {
      if (err?.constraint === 'access_one_key_session_uq') return new ConflictException('Another doctor already has this patient\'s record open')
      return new ConflictException(clean)
    }
    if (code === '23503') return new BadRequestException('A referenced record does not exist')
    if (code === '22P02' || code === '22007') return new BadRequestException('Invalid value in request')
    if (code === 'P0001' || code === 'P0002') return new BadRequestException(clean)
    this.logger.error(`Unexpected database error ${code ?? ''}: ${message}`)
    return err
  }
}

// ---------- small helpers shared by the doctor services ----------

/** Encrypted columns hold plain UTF-8 bytes with enc_key_id 'demo-none' in the alpha (same convention as the seed). */
export const DEMO_ENC_KEY = 'demo-none'

export function toIso(v: unknown): string | null {
  return v == null ? null : new Date(v as string).toISOString()
}

export function mustFind<T>(row: T | undefined | null, what: string): T {
  if (!row) throw new NotFoundException(`${what} not found`)
  return row
}

export function parseBody<T>(schema: { safeParse(v: unknown): any }, body: unknown): T {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw new BadRequestException({
      success: false,
      errorMessage: 'Invalid request',
      issues: result.error.issues.map((i: any) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return result.data as T
}
