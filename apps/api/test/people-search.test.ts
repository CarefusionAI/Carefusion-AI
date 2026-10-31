import { describe, expect, it, vi } from 'vitest'
import { PeopleSearchService } from '../src/people-search/people-search.service'

function make(rows: unknown[] = []) {
  const db = { query: vi.fn().mockResolvedValue(rows) }
  const audit = { logAction: vi.fn().mockResolvedValue(undefined) }
  const svc = new PeopleSearchService(db as never, audit as never)
  return { svc, db, audit }
}
const actor = { id: 'u1', username: 'a', role: 'HOSPITAL_ADMIN' } as never

describe('people search', () => {
  it('does not touch the database for fewer than 3 characters', async () => {
    const { svc, db, audit } = make()
    expect(await svc.search(actor, ' an ')).toEqual({ hits: [], minChars: 3 })
    expect(db.query).not.toHaveBeenCalled()
    expect(audit.logAction).not.toHaveBeenCalled()
  })
  it('escapes LIKE wildcards so "%%%" cannot list everyone', async () => {
    const { svc, db } = make()
    await svc.search(actor, '%_x')
    expect(db.query.mock.calls[0]![1]).toEqual(['%\\%\\_x%'])
  })
  it('shows only the last four ABHA characters', async () => {
    const { svc } = make([{ id: 'p1', full_name: 'Anjali Menon', abha_number: 'DEMO-0000-1234', age: 35 }])
    const r = await svc.search(actor, 'anj')
    expect(r.hits[0]).toEqual({ personId: 'p1', fullName: 'Anjali Menon', abhaHint: '…1234', ageYears: 35 })
    expect(JSON.stringify(r)).not.toContain('DEMO-0000')
  })
  it('audits the search without storing the search text', async () => {
    const { svc, audit } = make([])
    await svc.search(actor, 'secret-name')
    const [, action, opts] = audit.logAction.mock.calls[0]!
    expect(action).toBe('person.search')
    expect(JSON.stringify(opts)).not.toContain('secret-name')
    expect(opts.details.queryLength).toBe(11)
  })
})
