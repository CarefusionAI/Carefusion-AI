import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
// The citizen app (apps/api/src/citizen-app) derives the rotating key; the doctor side verifies it with the same functions.
import { KEY_WINDOW_SECONDS, deriveAccessKey, keyHandle, keyWindow, verifyAccessKey } from '../citizen-app/access/access-key'

const CANDIDATE_TTL_MS = 60_000

/**
 * Doctor side of the citizen's rotating 6-digit key (docs/15 section 11.1).
 * The key is derived (HMAC of person + 10-second window), so the doctor typing only six digits is resolved by checking the
 * active citizen accounts (a QR scan carries a handle and skips the scan). Two citizens cannot share a live key: an
 * ambiguous code is refused. Single use is enforced here with an in-memory used-list.
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
  async consume(raw: string, now = Date.now()): Promise<string | undefined> {
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
      const hits = new Set<string>()
      for (const id of cand.ids) {
        if (verifyAccessKey(this.secret, id, code, now)) hits.add(id)
      }
      if (hits.size !== 1) return undefined // none, or two citizens share the code right now
      personId = [...hits][0]
    }
    // which 10-second window did the code match? (current or the one before)
    const w = [0, 1].map((i) => keyWindow(now - i * KEY_WINDOW_SECONDS * 1000)).find((win) => deriveAccessKey(this.secret, personId!, win * KEY_WINDOW_SECONDS * 1000) === code)
    const mark = `${personId}:${w}`
    if (this.used.has(mark)) return undefined
    this.used.set(mark, now + 3 * KEY_WINDOW_SECONDS * 1000)
    return personId
  }

  private sweep(now: number) {
    for (const [k, exp] of this.used) if (exp < now) this.used.delete(k)
  }
}
