import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'
import { ACCOUNT_TYPE_BY_ROLE } from './event-roles'
import { mapPgError } from './pg-errors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A database transaction that runs with the caller's identity (row-level security applies). */
export interface RequestTx {
  user: AuthenticatedUser
  userId: string
  personId: string | null
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>
  client: PoolClient
}

/**
 * Runs a callback in ONE transaction where:
 *   app.user_id / app.person_id / app.account_type are set (util.ctx_*() in the database read them), and
 *   the session role is switched to cf_app so the row-level-security policies of migrations 100-128 apply.
 * Set RLS_SET_ROLE= (empty) to skip the role switch, for example when the connection user is not a member of cf_app.
 */
@Injectable()
export class RequestDbService {
  private readonly logger = new Logger(RequestDbService.name)
  private readonly roleName: string
  private warnedNoRole = false

  constructor(private readonly db: DatabaseService, config: ConfigService) {
    this.roleName = config.get<string>('RLS_SET_ROLE', 'cf_app')
  }

  async run<T>(user: AuthenticatedUser, fn: (tx: RequestTx) => Promise<T>): Promise<T> {
    const userId = user.userId
    if (!userId || !UUID_RE.test(userId)) {
      throw new ForbiddenException('No platform account is linked to this login')
    }
    const client = await this.db.getClient()
    try {
      await client.query('BEGIN')
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.person_id', $2, true),
                set_config('app.account_type', $3, true)`,
        [userId, user.personId ?? '', ACCOUNT_TYPE_BY_ROLE[user.role] ?? 'citizen'],
      )
      await this.switchRole(client)
      const tx: RequestTx = {
        user,
        userId,
        personId: user.personId ?? null,
        client,
        query: async <R = any>(text: string, params?: unknown[]) => (await client.query(text, params as any[])).rows as R[],
      }
      const result = await fn(tx)
      await client.query('COMMIT')
      return result
    } catch (err) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* connection already broken */
      }
      throw mapPgError(err)
    } finally {
      client.release()
    }
  }

  private async switchRole(client: PoolClient) {
    if (!this.roleName) return
    await client.query('SAVEPOINT rls_role')
    try {
      await client.query(`SET LOCAL ROLE ${quoteIdent(this.roleName)}`)
      await client.query('RELEASE SAVEPOINT rls_role')
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT rls_role')
      if (!this.warnedNoRole) {
        this.warnedNoRole = true
        this.logger.warn(
          `Could not switch to role "${this.roleName}" (${(err as Error).message}); row-level security is NOT enforced for this connection`,
        )
      }
    }
  }
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}
