import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
// The citizen app (apps/api/src/citizen-app) derives the rotating key; the doctor side verifies it with the same functions.
import { KEY_WINDOW_SECONDS, deriveAccessKey, keyHandle, keyWindow, verifyAccessKey } from '../citizen-app/access/access-key'

const CANDIDATE_TTL_MS = 60_000
/** Wrong keys one doctor may try from one address in the window before being locked out. */
export const KEY_MAX_FAILS = 5
const KEY_WINDOW_MS = 10 * 60_000

/**
 * Doctor side of the citizen's rotating 6-digit key (docs/15 section 11.1).
 * The key is derived (HMAC of person + 10-second window), so the doctor typing only six digits is resolved by checking the
 * active citizen accounts (a QR scan carries a handle and skips the scan). Two citizens cannot share a live key: an
 * ambiguous code is refused. Single use is enforced here with an in-memory used-list.
 * A typed 6-digit key must come with the patient's ABHA number, so a guess is checked against ONE patient (about 2 in a million)
 * instead of every citizen. Wrong keys are counted per doctor and address in the database (util.access_attempt, shared by all
 * serverless instances), and five wrong keys in ten minutes lock further tries.
 * ALPHA: the used-list is per process; the design keeps it in Valkey (migration 040: "live key validation ... in Valkey").
 */
@Injectable()
export class AccessKeyService {
  private readonly secret: string
  private candidates: { at: number; ids: string[]; handles: Map<string, string> } | null = null
  private readonly used = new Map<string, number>() // `${personId}:${window}` -> expiry (ms)

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('ACCESS_KEY_SECRET', 'cf-demo-access-key-secret-not-for-production')
  }

  private async load(now: number) {
    if (this.candidates && now - this.candidates.at < CANDIDATE_TTL_MS) return this.candidates
    const rows = await this.db.query<{ person_id: string }>(
      `SELECT DISTINCT u.person_id FROM identity.app_user u WHERE u.account_type = 'citizen' AND u.status = 'active'`,
    )
    const ids = rows.map((r) => r.person_id)
    this.candidates = { at: now, ids, handles: new Map(ids.map((id) => [keyHandle(this.secret, id), id])) }
    return this.candidates
  }

  /** Returns the patient the key belongs to and marks the key used; undefined when unknown, expired, ambiguous or already used. */
  async consume(raw: string, now = Date.now(), patientAbha?: string): Promise<string | undefined> {
    this.sweep(now)
    const text = raw.trim()
    const cand = await this.load(now)
    let personId: string | undefined
    let code = text.replace(/\s+/g, '')
    if (text.startsWith('cfkey:v1:')) {
      const [, , handle, c] = text.split(':')
      personId = handle ? cand.handles.get(handle) : undefined
      code = c ?? ''
      if (!personId || !verifyAccessKey(this.secret, personId, code, now)) return undefined
    } else {
      if (!/^\d{6}$/.test(code)) return undefined
      const abha = (patientAbha ?? '').trim()
      if (!abha) return undefined // a typed key is only checked against the patient it is claimed for
      const rows = await this.db.query<{ id: string }>(`SELECT id FROM identity.person WHERE abha_number = $1 AND id = ANY($2::uuid[])`, [abha, cand.ids])
      const claimed = rows[0]?.id
      if (!claimed || !verifyAccessKey(this.secret, claimed, code, now)) return undefined
      personId = claimed
    }
    // which 10-second window did the code match? (current or the one before)
    const w = [0, 1].map((i) => keyWindow(now - i * KEY_WINDOW_SECONDS * 1000)).find((win) => deriveAccessKey(this.secret, personId!, win * KEY_WINDOW_SECONDS * 1000) === code)
    const mark = `${personId}:${w}`
    if (this.used.has(mark)) return undefined
    this.used.set(mark, now + 3 * KEY_WINDOW_SECONDS * 1000)
    return personId
  }

  /** Hash of doctor + address: only this is stored, never the address itself. */
  private attemptKey(userKey: string, client: string): string {
    return createHmac('sha256', this.secret).update(`doctor-key:${userKey}|${client}`).digest('hex')
  }

  /** True when this doctor from this address has made KEY_MAX_FAILS wrong keys in the last 10 minutes. */
  async isLocked(userKey: string, client: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM util.access_attempt WHERE client_hash = $1 AND fails >= $2 AND first_at > now() - make_interval(secs => $3)`,
      [this.attemptKey(userKey, client), KEY_MAX_FAILS, KEY_WINDOW_MS / 1000],
    )
    return rows.length > 0
  }

  async recordFail(userKey: string, client: string): Promise<void> {
    await this.db.query(
      `INSERT INTO util.access_attempt (client_hash, fails, first_at) VALUES ($1, 1, now())
       ON CONFLICT (client_hash) DO UPDATE SET
         fails    = CASE WHEN util.access_attempt.first_at < now() - make_interval(secs => $2) THEN 1 ELSE util.access_attempt.fails + 1 END,
         first_at = CASE WHEN util.access_attempt.first_at < now() - make_interval(secs => $2) THEN now() ELSE util.access_attempt.first_at END`,
      [this.attemptKey(userKey, client), KEY_WINDOW_MS / 1000],
    )
  }

  async clearFails(userKey: string, client: string): Promise<void> {
    await this.db.query(`DELETE FROM util.access_attempt WHERE client_hash = $1`, [this.attemptKey(userKey, client)])
  }

  private sweep(now: number) {
    for (const [k, exp] of this.used) if (exp < now) this.used.delete(k)
  }
}
