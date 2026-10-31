import { describe, expect, it, vi } from 'vitest'
import { AccessService } from '../src/access/access.service'

function make(code = 'CF-TEST') {
  const config = { get: (k: string, d?: string) => ({ ACCESS_CODE: code, ACCESS_KEY_SECRET: 'k' } as Record<string, string>)[k] ?? d }
  const db = { query: vi.fn().mockResolvedValue([]) }
  return { svc: new AccessService(config as never, db as never), db }
}

describe('access gate', () => {
  it('is open when no ACCESS_CODE is set', () => {
    const { svc } = make('')
    expect(svc.required()).toBe(false)
    expect(svc.isGranted(undefined)).toBe(true)
  })
  it('only grants the exact cookie, and rejects forged or missing ones', () => {
    const { svc } = make()
    expect(svc.isGranted(`cf_access=${svc.token()}`)).toBe(true)
    expect(svc.isGranted('cf_access=forged')).toBe(false)
    expect(svc.isGranted('other=1')).toBe(false)
    expect(svc.isGranted(undefined)).toBe(false)
  })
  it('a different code gives a different cookie', () => {
    expect(make('A').svc.token()).not.toBe(make('B').svc.token())
  })
  it('compares codes ignoring surrounding spaces and counts a wrong guess in the database', async () => {
    const { svc, db } = make()
    expect(await svc.check('1.2.3.4', ' CF-TEST ')).toBe(true)
    expect(await svc.check('1.2.3.4', 'nope')).toBe(false)
    const sql = db.query.mock.calls.map((c) => String(c[0]))
    expect(sql.some((s) => s.includes('DELETE FROM util.access_attempt'))).toBe(true)
    expect(sql.some((s) => s.includes('INSERT INTO util.access_attempt'))).toBe(true)
  })
  it('stores a hash of the client address, never the address', async () => {
    const { svc, db } = make()
    await svc.check('203.0.113.9', 'nope')
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('203.0.113.9')
  })
  it('reports a lock when the database says 5 recent failures', async () => {
    const { svc, db } = make()
    db.query.mockResolvedValueOnce([{ '?column?': 1 }])
    expect(await svc.isLocked('1.2.3.4')).toBe(true)
    db.query.mockResolvedValueOnce([])
    expect(await svc.isLocked('1.2.3.4')).toBe(false)
  })
})
