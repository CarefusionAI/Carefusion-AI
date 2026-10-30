import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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
  private readonly fails = new Map<string, { n: number; first: number }>()

  constructor(private readonly config: ConfigService) {}

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

  /** Best-effort limit of wrong guesses per client address (per server instance). */
  isLocked(client: string): boolean {
    const f = this.fails.get(client)
    if (!f) return false
    if (Date.now() - f.first > WINDOW_MS) {
      this.fails.delete(client)
      return false
    }
    return f.n >= MAX_FAILS
  }

  check(client: string, input: string): boolean {
    const ok = this.required() && this.equal(input.trim(), this.code)
    if (!ok) {
      const f = this.fails.get(client)
      if (!f || Date.now() - f.first > WINDOW_MS) this.fails.set(client, { n: 1, first: Date.now() })
      else f.n += 1
    } else {
      this.fails.delete(client)
    }
    return ok
  }
}
