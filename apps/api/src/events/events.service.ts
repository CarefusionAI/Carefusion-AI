import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common'
import { Role } from '@carefusion/shared'
import type { EmitEventRequest, EventDto, EventRole, MarkEventsReadResponse } from '@carefusion/shared/dist/events.js'
import { GOV_EVENT_ROLES } from '@carefusion/shared/dist/events.js'
import type { AuthenticatedUser } from '../auth/types'
import { eventRoleOf } from './event-roles'
import { RequestDbService, RequestTx } from './request-db.service'

/** Notices one account may send per minute through the open events endpoint. */
const EMIT_PER_MINUTE = 10

interface EventRow {
  id: string
  type: string
  type_label: string
  chip: string
  chip_tone: string
  from_role: EventRole
  to_roles: EventRole[]
  title: string
  text: string
  href: string | null
  entity_type: string | null
  entity_id: string | null
  patient_person_id: string | null
  created_at: Date | string
  is_read: boolean
  sent_by_me: boolean
}

const EVENT_COLUMNS = `id, type::text AS type, type_label, chip, chip_tone, from_role::text AS from_role,
       to_roles::text[] AS to_roles, title, text, href, entity_type, entity_id, patient_person_id,
       created_at, is_read, sent_by_me`

export function toEventDto(r: EventRow): EventDto {
  return {
    id: r.id,
    type: r.type,
    from: r.from_role,
    to: r.to_roles,
    title: r.title,
    text: r.text ?? '',
    href: r.href ?? undefined,
    at: new Date(r.created_at).toISOString(),
    typeLabel: r.type_label,
    chip: r.chip,
    chipTone: r.chip_tone,
    isRead: r.is_read,
    sentByMe: r.sent_by_me,
    entityType: r.entity_type,
    entityId: r.entity_id,
    patientPersonId: r.patient_person_id,
  }
}

@Injectable()
export class EventsService {
  constructor(private readonly requestDb: RequestDbService) {}

  /** Events this user may see (row-level security) that are addressed to their role or sent by them. */
  async list(
    user: AuthenticatedUser,
    opts: { role?: EventRole; limit: number; unreadOnly?: boolean },
  ): Promise<EventDto[]> {
    const myRole = eventRoleOf(user.role)
    if (!myRole) throw new ForbiddenException('Unknown role')
    if (opts.role && opts.role !== myRole) {
      throw new ForbiddenException('You can only read the feed of your own role')
    }
    return this.requestDb.run(user, async (tx) => {
      const rows = await tx.query<EventRow>(
        `SELECT ${EVENT_COLUMNS}
           FROM engage.v_my_events
          WHERE ($1::engage.event_role = ANY (to_roles) OR sent_by_me)
            AND (NOT $2::boolean OR (NOT is_read AND NOT sent_by_me))
          ORDER BY created_at DESC, id DESC
          LIMIT $3`,
        [myRole, opts.unreadOnly ?? false, opts.limit],
      )
      return rows.map(toEventDto)
    })
  }

  async unreadCount(user: AuthenticatedUser): Promise<number> {
    return this.requestDb.run(user, async (tx) => {
      const rows = await tx.query<{ n: number }>('SELECT engage.unread_event_count() AS n')
      return rows[0]?.n ?? 0
    })
  }

  async markRead(user: AuthenticatedUser, ids?: string[]): Promise<MarkEventsReadResponse> {
    return this.requestDb.run(user, async (tx) => {
      const rows = await tx.query<{ n: number }>('SELECT engage.mark_events_read($1::uuid[]) AS n', [ids ?? null])
      return { marked: rows[0]?.n ?? 0 }
    })
  }

  /** POST /events: the sender's role comes from the account, never from the request. */
  async emitForUser(user: AuthenticatedUser, req: EmitEventRequest): Promise<EventDto> {
    // Citizens' notices to staff are created by the booking, message, complaint, review and blood flows, which know the
    // right hospital. This open endpoint would let a citizen write any text to any hospital or person, so it is refused.
    if (user.role === Role.CITIZEN && (req.to.some((r) => r !== 'citizen') || req.toUserId || req.hospitalId || req.pharmacyId)) {
      throw new ForbiddenException('Citizens cannot send notices to staff here. Use messages, bookings or complaints.')
    }
    return this.requestDb.run(user, async (tx) => {
      const recent = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM engage.event WHERE created_by_user_id = $1 AND created_at > now() - interval '1 minute'`,
        [tx.userId],
      )
      if ((recent[0]?.n ?? 0) >= EMIT_PER_MINUTE) throw new HttpException('Too many notices. Wait a minute and try again.', 429)
      return this.emit(tx, req)
    })
  }

  /**
   * Insert an event inside an open request transaction (used by other modules, for example booking -> doctor).
   * Scope rules: an event about a patient never goes to district/state/zonal/central; a citizen can only speak
   * about themself and must give a facility (hospitalId / pharmacyId) or one recipient (toUserId) when writing
   * to staff; staff and admins default to their own facility.
   */
  async emit(tx: RequestTx, req: EmitEventRequest): Promise<EventDto> {
    const type = await tx.query<{ default_href: string | null }>(
      'SELECT default_href FROM engage.event_type_ref WHERE code = $1 AND is_active',
      [req.type],
    )
    if (type.length === 0) throw new BadRequestException(`Unknown event type "${req.type}"`)

    if (req.patientPersonId && req.to.some((r) => GOV_EVENT_ROLES.includes(r))) {
      throw new BadRequestException('Events about a patient cannot go to district, state, zonal or central admins')
    }

    const scope = await tx.query<{ event_role: EventRole | null; hospital_id: string | null; pharmacy_id: string | null }>(
      'SELECT event_role::text AS event_role, hospital_id, pharmacy_id FROM engage.viewer_scope($1)',
      [tx.userId],
    )
    const me = scope[0]
    if (!me?.event_role) throw new ForbiddenException('Your account cannot send events')

    let hospitalId = req.hospitalId ?? null
    let pharmacyId = req.pharmacyId ?? null
    const toStaff = req.to.some((r) => r !== 'citizen')
    if (me.event_role === 'citizen') {
      if (req.patientPersonId && req.patientPersonId !== tx.personId) {
        throw new ForbiddenException('A citizen can only send events about themself')
      }
      if (toStaff && !hospitalId && !pharmacyId && !req.toUserId) {
        throw new BadRequestException('Give hospitalId, pharmacyId or toUserId when sending to staff')
      }
    } else if (!hospitalId && !pharmacyId && !req.toUserId) {
      hospitalId = me.hospital_id
      pharmacyId = me.pharmacy_id
    }

    const href = req.href ?? type[0]?.default_href ?? null
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO engage.event
         (type, from_role, created_by_user_id, to_roles, to_user_id, title, text, href,
          entity_type, entity_id, patient_person_id, hospital_id, pharmacy_id)
       VALUES ($1, $2::engage.event_role, $3, $4::engage.event_role[], $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        req.type,
        me.event_role,
        tx.userId,
        req.to,
        req.toUserId ?? null,
        req.title,
        req.text ?? '',
        href,
        req.entityType ?? null,
        req.entityId ?? null,
        req.patientPersonId ?? null,
        hospitalId,
        pharmacyId,
      ],
    )
    const id = rows[0]!.id
    const out = await tx.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM engage.v_my_events WHERE id = $1`, [id])
    return toEventDto(out[0]!)
  }
}
