import { describe, expect, it } from 'vitest'
import { AccessKeyService, KEY_MAX_FAILS } from '../src/doctor/access-key.service'
import { deriveAccessKey, keyHandle } from '../src/citizen-app/access/access-key'

const SECRET = 'test-secret'
const ANJALI = 'cfd00000-0001-4000-8000-000000000001'
const OTHER = 'cfd00000-0001-4000-8000-000000000002'
const ABHA = 'DEMO-0000-1234'
const NOW = Date.UTC(2026, 9, 17, 9, 15, 0)

/** A fake database: the active citizens, the ABHA lookup, and the wrong-key counter. */
function makeService() {
  const attempts = new Map<string, number>()
  const db = {
    query: async (text: string, params: unknown[] = []) => {
      if (text.includes("account_type = 'citizen'")) return [{ person_id: ANJALI }, { person_id: OTHER }]
      if (text.includes('abha_number')) return params[0] === ABHA ? [{ id: ANJALI }] : []
      if (text.startsWith('INSERT INTO util.access_attempt')) {
        attempts.set(String(params[0]), (attempts.get(String(params[0])) ?? 0) + 1)
        return []
      }
      if (text.startsWith('SELECT 1 FROM util.access_attempt')) return (attempts.get(String(params[0])) ?? 0) >= Number(params[1]) ? [{}] : []
      if (text.startsWith('DELETE FROM util.access_attempt')) {
        attempts.delete(String(params[0]))
        return []
      }
      return []
    },
  }
  const config = { get: (_k: string, d?: string) => (_k === 'ACCESS_KEY_SECRET' ? SECRET : d) }
  return new AccessKeyService(db as never, config as never)
}

describe('doctor opens a patient with the rotating key', () => {
  const code = deriveAccessKey(SECRET, ANJALI, NOW)

  it('accepts a typed key with the right ABHA number', async () => {
    expect(await makeService().consume(code, NOW, ABHA)).toBe(ANJALI)
  })

  it('refuses a typed key with no ABHA number, so it is never matched against every citizen', async () => {
    expect(await makeService().consume(code, NOW)).toBeUndefined()
    expect(await makeService().consume(code, NOW, '  ')).toBeUndefined()
  })

  it('refuses a typed key with an unknown ABHA number or the wrong key', async () => {
    expect(await makeService().consume(code, NOW, 'DEMO-0000-9999')).toBeUndefined()
    const wrong = code === '000000' ? '000001' : '000000'
    expect(await makeService().consume(wrong, NOW, ABHA)).toBeUndefined()
  })

  it('refuses a key for another patient even with the right ABHA number', async () => {
    expect(await makeService().consume(deriveAccessKey(SECRET, OTHER, NOW), NOW, ABHA)).toBeUndefined()
  })

  it('still accepts the QR text without an ABHA number, and only once', async () => {
    const svc = makeService()
    const qr = `cfkey:v1:${keyHandle(SECRET, ANJALI)}:${code}`
    expect(await svc.consume(qr, NOW)).toBe(ANJALI)
    expect(await svc.consume(qr, NOW)).toBeUndefined()
  })

  it('locks a doctor after too many wrong keys and unlocks after a good one is cleared', async () => {
    const svc = makeService()
    expect(await svc.isLocked('doc-1', '1.2.3.4')).toBe(false)
    for (let i = 0; i < KEY_MAX_FAILS; i++) await svc.recordFail('doc-1', '1.2.3.4')
    expect(await svc.isLocked('doc-1', '1.2.3.4')).toBe(true)
    expect(await svc.isLocked('doc-1', '5.6.7.8')).toBe(false) // another address is not locked
    expect(await svc.isLocked('doc-2', '1.2.3.4')).toBe(false) // another doctor is not locked
    await svc.clearFails('doc-1', '1.2.3.4')
    expect(await svc.isLocked('doc-1', '1.2.3.4')).toBe(false)
  })
})
