import { describe, expect, it } from 'vitest'
import { DemoCredentialsService } from '../src/auth/demo-credentials.service'

const make = (env: Record<string, string> = {}) =>
  new DemoCredentialsService({ get: (k: string) => env[k] } as never)
const ENV = { REVIEWER_PASSWORDS: JSON.stringify({ DOCTOR: 'doctor-pass-1', CENTRAL_ADMIN: 'central-pass-1' }), ACCESS_KEY_SECRET: 'x'.repeat(32) }

describe('reviewer passwords', () => {
  it('leaves every role open when REVIEWER_PASSWORDS is not set', () => {
    const c = make()
    expect(c.requiresPassword('DOCTOR')).toBe(false)
    expect(c.verifyPassword('DOCTOR', 'anything')).toBe(false)
  })
  it('requires a password only for the listed roles', () => {
    const c = make(ENV)
    expect(c.requiresPassword('DOCTOR')).toBe(true)
    expect(c.requiresPassword('doctor')).toBe(true)
    expect(c.requiresPassword('CITIZEN')).toBe(false)
  })
  it('checks the password for the right role only', () => {
    const c = make(ENV)
    expect(c.verifyPassword('DOCTOR', 'doctor-pass-1')).toBe(true)
    expect(c.verifyPassword('DOCTOR', 'central-pass-1')).toBe(false)
    expect(c.verifyPassword('DOCTOR', '')).toBe(false)
    expect(c.verifyPassword('NURSE', 'doctor-pass-1')).toBe(false)
  })
  it('ignores passwords shorter than 8 characters', () => {
    expect(make({ ...ENV, REVIEWER_PASSWORDS: JSON.stringify({ DOCTOR: 'short' }) }).requiresPassword('DOCTOR')).toBe(false)
  })
  it('refuses to start with passwords but no signing secret', () => {
    expect(() => make({ REVIEWER_PASSWORDS: ENV.REVIEWER_PASSWORDS })).toThrow(/ACCESS_KEY_SECRET/)
  })
  it('issues a token that names its role, and rejects forged, edited and expired tokens', () => {
    const c = make(ENV)
    const t = c.issueToken('DOCTOR', 1_000)
    expect(c.roleFromToken(t, 2_000)).toBe('DOCTOR')
    expect(c.roleFromToken(t.replace('DOCTOR', 'CENTRAL_ADMIN'), 2_000)).toBeNull()
    expect(c.roleFromToken('demo:DOCTOR', 2_000)).toBeNull()
    expect(c.roleFromToken(t.slice(0, -2) + '00', 2_000)).toBeNull()
    expect(c.roleFromToken(t, 1_000 + 9 * 3_600_000)).toBeNull()
    expect(make({ ...ENV, ACCESS_KEY_SECRET: 'y'.repeat(32) }).roleFromToken(t, 2_000)).toBeNull()
  })
})
