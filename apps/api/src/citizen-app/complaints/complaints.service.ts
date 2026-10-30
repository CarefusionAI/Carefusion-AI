import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  ComplaintDto,
  ComplaintOptionsResponse,
  ComplaintTimelineEntryDto,
  CreateComplaintRequest,
} from '@carefusion/shared/dist/citizen-app.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { iso, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { CATEGORY_LABELS, SEVERITY_LABELS, stageOf } from './complaints.logic'

interface ComplaintRow {
  id: string
  ref_no: string
  title: string | null
  body: string
  category: string
  severity: string
  status: string
  hospital_id: string | null
  pharmacy_id: string | null
  access_session_id: string | null
  place: string | null
  created_at: Date
  due_at: Date | null
  resolved_at: Date | null
  escalation_level: number
}

const SELECT = `
  SELECT c.id, c.ref_no, c.title, c.body, c.category, c.severity, c.status, c.hospital_id, c.pharmacy_id, c.access_session_id,
         COALESCE(h.name, ph.name, c.place_text) AS place, c.created_at, c.due_at, c.resolved_at, c.escalation_level
    FROM engage.complaint c
    LEFT JOIN org.hospital h ON h.id = c.hospital_id
    LEFT JOIN org.pharmacy ph ON ph.id = c.pharmacy_id`

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  private async timeline(tx: RequestTx, c: CitizenCtx, ids: string[]): Promise<Map<string, ComplaintTimelineEntryDto[]>> {
    const out = new Map<string, ComplaintTimelineEntryDto[]>()
    if (!ids.length) return out
    const rows = await tx.query<{
      id: string
      complaint_id: string
      kind: string
      text: string | null
      created_at: Date
      actor_user_id: string | null
      actor_name: string | null
      actor_type: string | null
    }>(
      `SELECT e.id, e.complaint_id, e.kind, e.text, e.created_at, e.actor_user_id, p.full_name AS actor_name, u.account_type::text AS actor_type
         FROM engage.complaint_event e
         LEFT JOIN identity.app_user u ON u.id = e.actor_user_id
         LEFT JOIN identity.person p ON p.id = u.person_id
        WHERE e.complaint_id = ANY ($1::uuid[]) ORDER BY e.created_at, e.id`,
      [ids],
    )
    for (const r of rows) {
      const actor =
        r.actor_user_id === c.userId ? 'You' : (r.actor_name ?? (r.actor_type ? r.actor_type.replace('_', ' ') : 'System'))
      const list = out.get(r.complaint_id) ?? []
      list.push({ id: r.id, kind: r.kind, actor, text: r.text, at: isoReq(r.created_at) })
      out.set(r.complaint_id, list)
    }
    return out
  }

  private toDto(r: ComplaintRow, tl: ComplaintTimelineEntryDto[] | undefined): ComplaintDto {
    return {
      id: r.id,
      ref: r.ref_no,
      title: r.title,
      body: r.body,
      category: r.category,
      severity: r.severity,
      status: r.status,
      stage: stageOf(r.status),
      place: r.place,
      hospitalId: r.hospital_id,
      pharmacyId: r.pharmacy_id,
      accessSessionId: r.access_session_id,
      filedAt: isoReq(r.created_at),
      dueAt: iso(r.due_at),
      resolvedAt: iso(r.resolved_at),
      escalationLevel: r.escalation_level,
      timeline: tl ?? [],
    }
  }

  async list(c: CitizenCtx): Promise<ComplaintDto[]> {
    return this.requestDb.run(c.user, async (tx) => {
      const rows = await tx.query<ComplaintRow>(`${SELECT} WHERE c.raised_by_person_id = $1 ORDER BY c.created_at DESC`, [c.personId])
      const tl = await this.timeline(tx, c, rows.map((r) => r.id))
      return rows.map((r) => this.toDto(r, tl.get(r.id)))
    })
  }

  async get(c: CitizenCtx, id: string): Promise<ComplaintDto> {
    return this.requestDb.run(c.user, (tx) => this.load(tx, c, id))
  }

  private async load(tx: RequestTx, c: CitizenCtx, id: string): Promise<ComplaintDto> {
    const rows = await tx.query<ComplaintRow>(`${SELECT} WHERE c.id = $1 AND c.raised_by_person_id = $2`, [id, c.personId])
    if (!rows[0]) throw new NotFoundException('Complaint not found')
    const tl = await this.timeline(tx, c, [id])
    return this.toDto(rows[0], tl.get(id))
  }

  async options(c: CitizenCtx): Promise<ComplaintOptionsResponse> {
    const places = await this.requestDb.run(c.user, (tx) =>
      tx.query<{ type: 'hospital' | 'pharmacy'; id: string; name: string }>(
        `SELECT 'hospital' AS type, h.id, h.name FROM org.hospital h
           WHERE h.status = 'active' AND (h.id IN (SELECT hospital_id FROM engage.op_visit WHERE patient_person_id = $1)
                  OR h.district_id = (SELECT district_id FROM identity.citizen_profile WHERE person_id = $1))
         UNION ALL
         SELECT 'pharmacy', p.id, p.name FROM org.pharmacy p
           WHERE p.status = 'active' AND p.district_id = (SELECT district_id FROM identity.citizen_profile WHERE person_id = $1)
         ORDER BY 1, 3 LIMIT 100`,
        [c.personId],
      ),
    )
    return {
      categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
      severities: SEVERITY_LABELS,
      places,
      helpline: 'Grievance helpline 1800-000-0000 (demo)',
      process: [
        'The hospital admin acknowledges within 24 hours and replies within 7 days.',
        'On day 8 the complaint goes to the district health office.',
        'The district health office sees every complaint; the state grievance cell is the last step.',
      ],
    }
  }

  async create(c: CitizenCtx, req: CreateComplaintRequest): Promise<ComplaintDto> {
    return this.requestDb.run(c.user, async (tx) => {
      let hospitalId = req.hospitalId ?? null
      let pharmacyId = req.pharmacyId ?? null
      let districtId: string | null = null
      let aboutType = 'other'
      let aboutId: string | null = null

      if (req.accessSessionId) {
        const s = await tx.query<{ user_id: string }>(
          'SELECT user_id FROM access.access_session WHERE id = $1 AND patient_person_id = $2',
          [req.accessSessionId, c.personId],
        )
        if (!s[0]) throw new BadRequestException('That access session is not in your record')
        const scope = await tx.query<{ hospital_id: string | null }>('SELECT hospital_id FROM engage.viewer_scope($1)', [s[0].user_id])
        hospitalId = hospitalId ?? scope[0]?.hospital_id ?? null
        aboutType = 'access_session'
        aboutId = req.accessSessionId
      } else if (hospitalId) {
        aboutType = req.category === 'lab' ? 'lab' : 'hospital'
        aboutId = hospitalId
      } else if (pharmacyId) {
        aboutType = 'pharmacy'
        aboutId = pharmacyId
      } else if (req.category === 'app') {
        aboutType = 'app'
      }

      if (hospitalId) {
        const h = await tx.query<{ district_id: string }>('SELECT district_id FROM org.hospital WHERE id = $1', [hospitalId])
        if (!h[0]) throw new BadRequestException('Hospital not found')
        districtId = h[0].district_id
      } else if (pharmacyId) {
        const p = await tx.query<{ district_id: string }>('SELECT district_id FROM org.pharmacy WHERE id = $1', [pharmacyId])
        if (!p[0]) throw new BadRequestException('Pharmacy not found')
        districtId = p[0].district_id
      }
      if (!districtId) {
        districtId =
          (await tx.query<{ district_id: string | null }>('SELECT district_id FROM identity.citizen_profile WHERE person_id = $1', [c.personId]))[0]
            ?.district_id ?? null
      }
      if (!districtId) throw new BadRequestException('Your profile has no district; add it in Profile first')

      const body = req.visitDate ? `${req.body}\n(Visit date: ${req.visitDate})` : req.body
      const ins = await tx.query<{ id: string; ref_no: string }>(
        `INSERT INTO engage.complaint
           (raised_by_person_id, about_type, about_id, district_id, body, title, category, severity,
            hospital_id, pharmacy_id, access_session_id, place_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, ref_no`,
        [
          c.personId,
          aboutType,
          aboutId,
          districtId,
          body,
          req.title,
          req.category,
          req.severity,
          hospitalId,
          pharmacyId,
          req.accessSessionId ?? null,
          req.placeText ?? null,
        ],
      )
      const { id, ref_no } = ins[0]!

      if (hospitalId || pharmacyId) {
        await this.events.emit(tx, {
          type: 'complaint',
          to: [pharmacyId && !hospitalId ? 'pharmacyadmin' : 'hospitaladmin'],
          title: `Complaint filed · ${req.title}`,
          text: `${ref_no} · ${req.severity}${req.mayCallMe ? ' · may call the citizen' : ''}`,
          href: pharmacyId && !hospitalId ? undefined : '/hospital-admin/complaints',
          hospitalId: hospitalId ?? undefined,
          pharmacyId: hospitalId ? undefined : (pharmacyId ?? undefined),
          entityType: 'engage.complaint',
          entityId: id,
        })
      }
      return this.load(tx, c, id)
    })
  }

  async addNote(c: CitizenCtx, id: string, text: string): Promise<ComplaintDto> {
    return this.requestDb.run(c.user, async (tx) => {
      const cur = await this.load(tx, c, id)
      if (cur.stage === 2) throw new BadRequestException('This complaint is resolved; reopen it to add more')
      await tx.query(`INSERT INTO engage.complaint_event (complaint_id, actor_user_id, kind, text) VALUES ($1, $2, 'note', $3)`, [id, c.userId, text])
      return this.load(tx, c, id)
    })
  }

  async reopen(c: CitizenCtx, id: string, text: string): Promise<ComplaintDto> {
    return this.requestDb.run(c.user, async (tx) => {
      const cur = await this.load(tx, c, id)
      if (cur.stage !== 2) throw new BadRequestException('Only a resolved complaint can be reopened')
      await tx.query(`UPDATE engage.complaint SET status = 'reopened', resolved_at = NULL, resolution = NULL WHERE id = $1`, [id])
      await tx.query(`INSERT INTO engage.complaint_event (complaint_id, actor_user_id, kind, text) VALUES ($1, $2, 'note', $3)`, [id, c.userId, text])
      if (cur.hospitalId || cur.pharmacyId) {
        await this.events.emit(tx, {
          type: 'complaint',
          to: [cur.pharmacyId && !cur.hospitalId ? 'pharmacyadmin' : 'hospitaladmin'],
          title: `Complaint reopened · ${cur.title ?? cur.ref}`,
          text: `${cur.ref} · ${text.slice(0, 100)}`,
          href: cur.pharmacyId && !cur.hospitalId ? undefined : '/hospital-admin/complaints',
          hospitalId: cur.hospitalId ?? undefined,
          pharmacyId: cur.hospitalId ? undefined : (cur.pharmacyId ?? undefined),
          entityType: 'engage.complaint',
          entityId: id,
        })
      }
      return this.load(tx, c, id)
    })
  }
}
