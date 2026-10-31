import { Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'
import { DatabaseService } from '../database/database.service'

export interface PersonHit {
  personId: string
  fullName: string
  /** Only the last four characters of the ABHA number, so an admin can tell two people apart. */
  abhaHint: string | null
  ageYears: number
}

const MIN_QUERY = 3
const MAX_HITS = 8

/**
 * Lets a hospital or pharmacy admin find a registered person by name or ABHA number when adding staff,
 * instead of typing a UUID. Returns the minimum needed to pick the right person, needs at least 3 characters,
 * and every search is written to the audit log (the search text itself is not stored).
 */
@Injectable()
export class PeopleSearchService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  async search(actor: AuthenticatedUser, raw: string): Promise<{ hits: PersonHit[]; minChars: number }> {
    const q = raw.trim()
    if (q.length < MIN_QUERY) return { hits: [], minChars: MIN_QUERY }
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const rows = await this.db.query<{ id: string; full_name: string; abha_number: string | null; age: number }>(
      `SELECT id, full_name, abha_number, date_part('year', age(util.demo_now()::date, date_of_birth))::int AS age
         FROM identity.person
        WHERE full_name ILIKE $1 OR abha_number ILIKE $1 OR abha_address::text ILIKE $1
        ORDER BY full_name
        LIMIT ${MAX_HITS}`,
      [like],
    )
    await this.audit.logAction(actor, 'person.search', { entityType: 'person', details: { queryLength: q.length, hits: rows.length } })
    return {
      minChars: MIN_QUERY,
      hits: rows.map((r) => ({
        personId: r.id,
        fullName: r.full_name,
        abhaHint: r.abha_number ? `…${r.abha_number.slice(-4)}` : null,
        ageYears: r.age,
      })),
    }
  }
}
