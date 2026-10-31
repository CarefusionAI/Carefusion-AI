import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_LIFETIME_MS = 8 * 60 * 60_000

/**
 * Optional per-role reviewer passwords for the public demo. REVIEWER_PASSWORDS is a JSON object such as
 * {"DOCTOR":"...","CENTRAL_ADMIN":"..."}. A role listed there can only sign in with its password and gets a signed,
 * expiring token; a plain `demo:<ROLE>` header no longer works for it. Roles not listed (and everything when the
 * variable is unset, as on a laptop) keep the open demo behaviour.
 */
@Injectable()
export class DemoCredentialsService {
  private readonly passwords = new Map<string, string>()
  private readonly secret: string

  constructor(config: ConfigService) {
    const raw = (config.get<string>('REVIEWER_PASSWORDS') ?? '').trim()
    this.secret = config.get<string>('ACCESS_KEY_SECRET') ?? ''
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const [role, pw] of Object.entries(parsed)) {
      if (typeof pw === 'string' && pw.length >= 8) this.passwords.set(role.toUpperCase(), pw)
    }
    if (this.passwords.size > 0 && this.secret.length < 16) {
      throw new Error('REVIEWER_PASSWORDS is set, so ACCESS_KEY_SECRET (16+ characters) must be set to sign tokens.')
    }
  }

  requiresPassword(role: string): boolean {
    return this.passwords.has(role.toUpperCase())
  }

  verifyPassword(role: string, given: string): boolean {
    const want = this.passwords.get(role.toUpperCase())
    if (!want) return false
    const a = createHash('sha256').update(given).digest()
    const b = createHash('sha256').update(want).digest()
    return timingSafeEqual(a, b)
  }

  private sign(role: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`demo-token:${role}:${exp}`).digest('hex')
  }

  /** `demo:<ROLE>:<expiry ms>:<signature>` */
  issueToken(role: string, now = Date.now()): string {
    const exp = now + TOKEN_LIFETIME_MS
    return `demo:${role}:${exp}:${this.sign(role, exp)}`
  }

  /** The role in a signed token, or null when it is malformed, expired or forged. */
  roleFromToken(token: string, now = Date.now()): string | null {
    const [prefix, role, expRaw, sig] = token.split(':')
    if (prefix !== 'demo' || !role || !expRaw || !sig) return null
    const exp = Number(expRaw)
    if (!Number.isFinite(exp) || exp < now) return null
    const want = Buffer.from(this.sign(role, exp))
    const got = Buffer.from(sig)
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    return role
  }
}
