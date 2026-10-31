import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const ACCESS_COOKIE = 'cf_access'
const MAX_FAILS = 5
const WINDOW_MS = 10 * 60_000

/**
 * Optional shared access code for a public demo. When ACCESS_CODE is set, API requests need the cookie
 * this service hands out after the right code is entered. When it is not set the gate is off.
 */
@Injectable()
export class AccessService {
  constructor(private readonly config: ConfigService, private readonly db: DatabaseService) {}

  private get code(): string {
    return (this.config.get<string>('ACCESS_CODE') ?? '').trim()
  }

  required(): boolean {
    return this.code.length > 0
  }

  private secret(): string {
    return this.config.get<string>('ACCESS_KEY_SECRET', 'cf-demo-access-key-secret-not-for-production')
  }

  /** What the cookie holds: an HMAC of the code, so it is useless without knowing the code. */
  token(): string {
    return createHmac('sha256', this.secret()).update(`cf-access:${this.code}`).digest('hex')
  }

  private equal(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a).digest()
    const hb = createHash('sha256').update(b).digest()
    return timingSafeEqual(ha, hb)
  }

  isGranted(cookieHeader: string | undefined): boolean {
    if (!this.required()) return true
    const match = (cookieHeader ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${ACCESS_COOKIE}=`))
    if (!match) return false
    return this.equal(match.slice(ACCESS_COOKIE.length + 1), this.token())
  }

  /** Only a keyed hash of the client address is kept. */
  private clientKey(client: string): string {
    return createHmac('sha256', this.secret()).update(`client:${client}`).digest('hex')
  }

  /** True when this client has made MAX_FAILS wrong guesses in the last 10 minutes (shared by all server instances). */
  async isLocked(client: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM util.access_attempt
        WHERE client_hash = $1 AND fails >= $2 AND first_at > now() - make_interval(secs => $3)`,
      [this.clientKey(client), MAX_FAILS, WINDOW_MS / 1000],
    )
    return rows.length > 0
  }

  async check(client: string, input: string): Promise<boolean> {
    const key = this.clientKey(client)
    const ok = this.required() && this.equal(input.trim(), this.code)
    if (ok) {
      await this.db.query(`DELETE FROM util.access_attempt WHERE client_hash = $1`, [key])
      return true
    }
    await this.db.query(
      `INSERT INTO util.access_attempt (client_hash, fails, first_at) VALUES ($1, 1, now())
       ON CONFLICT (client_hash) DO UPDATE SET
         fails    = CASE WHEN util.access_attempt.first_at < now() - make_interval(secs => $2) THEN 1 ELSE util.access_attempt.fails + 1 END,
         first_at = CASE WHEN util.access_attempt.first_at < now() - make_interval(secs => $2) THEN now() ELSE util.access_attempt.first_at END`,
      [key, WINDOW_MS / 1000],
    )
    return false
  }
}
