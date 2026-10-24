import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import type {
  CalendarFeedStatus,
  CalendarResponse,
  CreateReminderRequest,
  DatedEventDto,
  UpcomingResponse,
  UpdateReminderRequest,
} from '@carefusion/shared/dist/citizen-app.js'
import { DatabaseService } from '../../database/database.service'
import { RequestDbService } from '../../events/request-db.service'
import { demoNow, intervalToMinutes, isoReq, iso, istDate } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { buildIcs, daysBetweenIst, kindOfType, monthRangeIst } from './dates.logic'

interface DatedRow {
  id: string
  event_type: string
  starts_at: Date
  ends_at: Date | null
  title: string
  source_table: string | null
  source_id: string | null
  status: string
  repeat_rule: string
  remind_before: unknown
  snoozed_until: Date | null
  notes: string | null
}

const COLS = `id, event_type::text AS event_type, starts_at, ends_at, title, source_table, source_id, status,
       repeat_rule, remind_before, snoozed_until, notes`

function toDto(r: DatedRow): DatedEventDto {
  return {
    id: r.id,
    type: r.event_type,
    kind: kindOfType(r.event_type),
    title: r.title,
    startsAt: isoReq(r.starts_at),
    endsAt: iso(r.ends_at),
    status: r.status,
    notes: r.notes,
    repeatRule: r.repeat_rule,
    remindBeforeMinutes: intervalToMinutes(r.remind_before),
    snoozedUntil: iso(r.snoozed_until),
    isPersonal: r.event_type === 'personal_reminder',
    sourceTable: r.source_table,
    sourceId: r.source_id,
  }
}

@Injectable()
export class DatesService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly db: DatabaseService,
  ) {}

  async calendar(c: CitizenCtx, month?: string): Promise<CalendarResponse> {
    const now = demoNow()
    const m = month ?? istDate(now).slice(0, 7)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new BadRequestException('month must be YYYY-MM')
    const { start, end } = monthRangeIst(m)
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<DatedRow>(
        `SELECT ${COLS} FROM records.dated_event
          WHERE patient_person_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status <> 'cancelled'
          ORDER BY starts_at, id`,
        [c.personId, start, end],
      ),
    )
    const events = rows.map(toDto)
    const count = (k: string) => events.filter((e) => e.kind === k).length
    return {
      month: m,
      today: istDate(now),
      events,
      summary: {
        appointments: count('appt'),
        tests: count('test'),
        refills: count('med'),
        vaccines: count('vac'),
        personal: count('personal'),
        other: count('give') + count('other') + count('visit'),
      },
    }
  }

  async upcoming(c: CitizenCtx, limit: number): Promise<UpcomingResponse> {
    const now = demoNow()
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<DatedRow>(
        `SELECT ${COLS} FROM records.dated_event
          WHERE patient_person_id = $1 AND starts_at >= $2 AND status = 'scheduled'
          ORDER BY starts_at, id LIMIT $3`,
        [c.personId, now, limit],
      ),
    )
    return {
      today: istDate(now),
      events: rows.map((r) => ({ ...toDto(r), inDays: daysBetweenIst(now, new Date(r.starts_at)) })),
    }
  }

  async createReminder(c: CitizenCtx, req: CreateReminderRequest): Promise<DatedEventDto> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<DatedRow>(
        `INSERT INTO records.dated_event
           (patient_person_id, event_type, starts_at, title, set_by_user_id, repeat_rule, remind_before, notes)
         VALUES ($1, 'personal_reminder', $2, $3, $4, $5,
                 CASE WHEN $6::int IS NULL THEN NULL ELSE make_interval(mins => $6::int) END, $7)
         RETURNING ${COLS}`,
        [c.personId, req.startsAt, req.title, c.userId, req.repeat, req.remindBeforeMinutes ?? null, req.notes ?? null],
      ),
    )
    return toDto(rows[0]!)
  }

  /** Only reminders the citizen created themself can be changed (snooze, done, cancel, edit). */
  async updateReminder(c: CitizenCtx, id: string, req: UpdateReminderRequest): Promise<DatedEventDto> {
    const sets: string[] = []
    const params: unknown[] = []
    const add = (col: string, value: unknown, cast = '') => {
      params.push(value)
      sets.push(`${col} = $${params.length}${cast}`)
    }
    if (req.title !== undefined) add('title', req.title)
    if (req.startsAt !== undefined) add('starts_at', req.startsAt)
    if (req.repeat !== undefined) add('repeat_rule', req.repeat)
    if (req.notes !== undefined) add('notes', req.notes)
    if (req.snoozedUntil !== undefined) add('snoozed_until', req.snoozedUntil)
    if (req.status !== undefined) add('status', req.status)
    if (req.remindBeforeMinutes !== undefined) {
      params.push(req.remindBeforeMinutes)
      sets.push(`remind_before = CASE WHEN $${params.length}::int IS NULL THEN NULL ELSE make_interval(mins => $${params.length}::int) END`)
    }
    params.push(id, c.personId, c.userId)
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<DatedRow>(
        `UPDATE records.dated_event SET ${sets.join(', ')}
          WHERE id = $${params.length - 2} AND patient_person_id = $${params.length - 1}
            AND event_type = 'personal_reminder' AND set_by_user_id = $${params.length}
          RETURNING ${COLS}`,
        params,
      ),
    )
    if (rows.length === 0) throw new NotFoundException('Reminder not found (only your own reminders can be changed)')
    return toDto(rows[0]!)
  }

  // ----- phone-calendar sync feed -----
  async feedStatus(c: CitizenCtx): Promise<CalendarFeedStatus> {
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<{ created_at: Date; revoked_at: Date | null }>(
        'SELECT created_at, revoked_at FROM records.calendar_feed WHERE person_id = $1',
        [c.personId],
      ),
    )
    const r = rows[0]
    return { active: !!r && r.revoked_at === null, createdAt: r ? isoReq(r.created_at) : null }
  }

  /** Creates (or replaces) the secret link. The token is shown once; only its SHA-256 hash is stored. */
  async createFeed(c: CitizenCtx, publicBase: string): Promise<CalendarFeedStatus> {
    const token = randomBytes(24).toString('base64url')
    const hash = createHash('sha256').update(token).digest()
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<{ created_at: Date }>(
        `INSERT INTO records.calendar_feed (person_id, token_hash) VALUES ($1, $2)
         ON CONFLICT (person_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = now(), revoked_at = NULL
         RETURNING created_at`,
        [c.personId, hash],
      ),
    )
    return { active: true, createdAt: isoReq(rows[0]!.created_at), url: `${publicBase}/api/v1/calendar/${token}.ics` }
  }

  async revokeFeed(c: CitizenCtx): Promise<CalendarFeedStatus> {
    await this.requestDb.run(c.user, (tx) =>
      tx.query('UPDATE records.calendar_feed SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [c.personId]),
    )
    return this.feedStatus(c)
  }

  /** Public: the iCalendar text for a secret token. Reads with the service connection (no login on a phone calendar). */
  async icsForToken(token: string): Promise<string | null> {
    const hash = createHash('sha256').update(token).digest()
    const feed = await this.db.query<{ person_id: string }>(
      'SELECT person_id FROM records.calendar_feed WHERE token_hash = $1 AND revoked_at IS NULL',
      [hash],
    )
    const personId = feed[0]?.person_id
    if (!personId) return null
    const rows = await this.db.query<DatedRow>(
      `SELECT ${COLS} FROM records.dated_event
        WHERE patient_person_id = $1 AND status <> 'cancelled' AND starts_at >= now() - interval '30 days'
        ORDER BY starts_at LIMIT 500`,
      [personId],
    )
    return buildIcs(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        startsAt: new Date(r.starts_at),
        endsAt: r.ends_at ? new Date(r.ends_at) : null,
        notes: r.notes,
        repeatRule: r.repeat_rule,
      })),
    )
  }
}
