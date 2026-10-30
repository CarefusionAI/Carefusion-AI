import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../../database/database.service'
import { StaffActor, StaffContextService } from './staff-context.service'
import type { HandoverCreateRequest } from './shared'
import { dateStr, forbidden, iso, notFound } from './staff.util'

export interface HandoverView {
  id: string
  unitKind: string
  unitName: string
  wardId: string | null
  shiftDate: string
  from: { userId: string; name: string }
  to: { userId: string; name: string } | null
  summary: string | null
  aiDraftText: string | null
  aiDraftSimulated: boolean
  createdAt: string | null
  signedAt: string | null
  signedBy: { userId: string; name: string } | null
  items: {
    id: string
    admissionId: string | null
    patientPersonId: string | null
    patientName: string | null
    bedId: string | null
    bedNo: string | null
    orderId: string | null
    flag: string
    note: string
    fromAiDraft: boolean
    doneAt: string | null
  }[]
}

export interface AiDraft {
  text: string
  items: { admissionId?: string; bedId?: string; orderId?: string; flag: 'watch' | 'pending' | 'transfer' | 'info'; note: string }[]
}

const UNIT_KIND = { nurse: 'ward', lab: 'lab', radiology: 'radiology' } as const
const ROLE_LABEL = { nurse: 'nurse', lab: 'labtech', radiology: 'radiology' } as const
const HREF = { nurse: '/nurse/handover', lab: '/lab/handover', radiology: '/radiology/handover' } as const

/** Shift handover shared by nurse, lab and radiology (org.shift_handover + org.handover_item). */
@Injectable()
export class HandoverService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ctx: StaffContextService,
  ) {}

  private unitOf(actor: StaffActor): { kind: 'ward' | 'lab' | 'radiology'; wardId: string | null } {
    if (actor.kind === 'pharmacist') forbidden('Pharmacy handover is not part of the hospital handover')
    return { kind: UNIT_KIND[actor.kind as 'nurse' | 'lab' | 'radiology'], wardId: actor.kind === 'nurse' ? actor.wardId : null }
  }

  async unitName(actor: StaffActor): Promise<string> {
    if (actor.kind === 'nurse') {
      if (actor.wardId) {
        const r = await this.db.query<{ name: string }>('SELECT name FROM org.ward WHERE id = $1', [actor.wardId])
        return r[0]?.name ?? 'Ward'
      }
      return 'Ward'
    }
    return actor.kind === 'lab' ? 'Central Lab' : 'Radiology'
  }

  /** Colleagues the user can hand over to (same hospital, same staff role, active, not themself). */
  async colleagues(actor: StaffActor): Promise<{ userId: string; name: string; wardId: string | null }[]> {
    const rows = await this.db.query<any>(
      `SELECT au.id AS user_id, p.full_name, sp.ward_id
         FROM identity.staff_profile sp
         JOIN identity.app_user au ON au.id = sp.user_id AND au.status = 'active'
         JOIN identity.person p ON p.id = au.person_id
        WHERE sp.hospital_id = $1 AND sp.staff_role = $2::identity.staff_role AND au.id <> $3
          AND ($4::uuid IS NULL OR sp.ward_id IS NULL OR sp.ward_id = $4)
        ORDER BY p.full_name`,
      [actor.hospitalId, actor.kind, actor.userId, actor.wardId],
    )
    return rows.map((r) => ({ userId: r.user_id, name: r.full_name, wardId: r.ward_id }))
  }

  async list(actor: StaffActor, days = 2): Promise<HandoverView[]> {
    const unit = this.unitOf(actor)
    const heads = await this.db.query<any>(
      `SELECT h.*, pf.full_name AS from_name, pt.full_name AS to_name, ps.full_name AS signed_name
         FROM org.shift_handover h
         JOIN identity.app_user fu ON fu.id = h.from_user_id JOIN identity.person pf ON pf.id = fu.person_id
         LEFT JOIN identity.app_user tu ON tu.id = h.to_user_id LEFT JOIN identity.person pt ON pt.id = tu.person_id
         LEFT JOIN identity.app_user su ON su.id = h.signed_by_user_id LEFT JOIN identity.person ps ON ps.id = su.person_id
        WHERE h.hospital_id = $1 AND h.unit_kind = $2
          AND ($3::uuid IS NULL OR h.ward_id = $3)
          AND h.shift_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date - $4::int
        ORDER BY h.created_at DESC
        LIMIT 20`,
      [actor.hospitalId, unit.kind, unit.wardId, days],
    )
    return this.hydrate(heads)
  }

  async get(actor: StaffActor, id: string): Promise<HandoverView> {
    const unit = this.unitOf(actor)
    const heads = await this.db.query<any>(
      `SELECT h.*, pf.full_name AS from_name, pt.full_name AS to_name, ps.full_name AS signed_name
         FROM org.shift_handover h
         JOIN identity.app_user fu ON fu.id = h.from_user_id JOIN identity.person pf ON pf.id = fu.person_id
         LEFT JOIN identity.app_user tu ON tu.id = h.to_user_id LEFT JOIN identity.person pt ON pt.id = tu.person_id
         LEFT JOIN identity.app_user su ON su.id = h.signed_by_user_id LEFT JOIN identity.person ps ON ps.id = su.person_id
        WHERE h.id = $1 AND h.hospital_id = $2 AND h.unit_kind = $3`,
      [id, actor.hospitalId, unit.kind],
    )
    if (!heads[0]) notFound('Handover')
    return (await this.hydrate(heads))[0]!
  }

  private async hydrate(heads: any[]): Promise<HandoverView[]> {
    if (heads.length === 0) return []
    const ids = heads.map((h) => h.id)
    const items = await this.db.query<any>(
      `SELECT i.*, p.full_name AS patient_name, b.bed_no
         FROM org.handover_item i
         LEFT JOIN identity.person p ON p.id = i.patient_person_id
         LEFT JOIN org.bed b ON b.id = i.bed_id
        WHERE i.handover_id = ANY($1::uuid[])
        ORDER BY i.created_at`,
      [ids],
    )
    return heads.map((h) => ({
      id: h.id,
      unitKind: h.unit_kind,
      unitName: h.unit_name,
      wardId: h.ward_id,
      shiftDate: dateStr(h.shift_date)!,
      from: { userId: h.from_user_id, name: h.from_name },
      to: h.to_user_id ? { userId: h.to_user_id, name: h.to_name } : null,
      summary: h.summary,
      aiDraftText: h.ai_draft_text,
      aiDraftSimulated: h.ai_draft_simulated,
      createdAt: iso(h.created_at),
      signedAt: iso(h.signed_at),
      signedBy: h.signed_by_user_id ? { userId: h.signed_by_user_id, name: h.signed_name } : null,
      items: items
        .filter((i) => i.handover_id === h.id)
        .map((i) => ({
          id: i.id,
          admissionId: i.admission_id,
          patientPersonId: i.patient_person_id,
          patientName: i.patient_name,
          bedId: i.bed_id,
          bedNo: i.bed_no,
          orderId: i.order_id,
          flag: i.flag,
          note: i.note,
          fromAiDraft: i.from_ai_draft,
          doneAt: iso(i.done_at),
        })),
    }))
  }

  /**
   * Write a handover. With `useAiDraft` the caller passes a draft that is SIMULATED AI output: it is stored in
   * ai_draft_text (flagged simulated) and its items are marked from_ai_draft; the staff member can edit before signing.
   */
  async create(actor: StaffActor, dto: HandoverCreateRequest, draft?: AiDraft): Promise<HandoverView> {
    const unit = this.unitOf(actor)
    if (dto.toUserId) {
      const ok = await this.db.query(
        `SELECT 1 FROM identity.staff_profile sp JOIN identity.app_user au ON au.id = sp.user_id AND au.status = 'active'
          WHERE sp.user_id = $1 AND sp.hospital_id = $2 AND sp.staff_role = $3::identity.staff_role AND sp.user_id <> $4`,
        [dto.toUserId, actor.hospitalId, actor.kind, actor.userId],
      )
      if (ok.length === 0) throw new BadRequestException({ success: false, errorMessage: 'The person taking over must be another active colleague in the same role and hospital' })
    }
    const unitName = await this.unitName(actor)
    const id = await this.ctx.tx(actor, async (c) => {
      const h = await c.query(
        `INSERT INTO org.shift_handover (hospital_id, unit_kind, unit_name, ward_id, from_user_id, to_user_id, summary, ai_draft_text, ai_draft_simulated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
        [actor.hospitalId, unit.kind, unitName, unit.wardId, actor.userId, dto.toUserId ?? null, dto.summary ?? null, draft?.text ?? null],
      )
      const hid = h.rows[0].id as string
      const all = [
        ...dto.items.map((i) => ({ ...i, fromAiDraft: i.fromAiDraft })),
        ...(draft && dto.items.length === 0 ? draft.items.map((i) => ({ ...i, fromAiDraft: true })) : []),
      ]
      for (const it of all) {
        const adm = it.admissionId ? await this.admissionInfo(c, it.admissionId, actor.hospitalId) : null
        await c.query(
          `INSERT INTO org.handover_item (handover_id, admission_id, patient_person_id, bed_id, order_id, flag, note, from_ai_draft)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [hid, it.admissionId ?? null, adm?.patient_person_id ?? null, it.bedId ?? adm?.bed_id ?? null, it.orderId ?? null, it.flag, it.note, it.fromAiDraft],
        )
      }
      await this.ctx.emitEvent(c, actor, {
        type: 'handover',
        toRoles: [ROLE_LABEL[actor.kind as 'nurse' | 'lab' | 'radiology']],
        toUserId: dto.toUserId ?? null,
        title: `Shift handover · ${unitName}`,
        text: `${actor.fullName} wrote a handover${dto.toUserId ? ' for you' : ''}`,
        href: HREF[actor.kind as 'nurse' | 'lab' | 'radiology'],
        entityType: 'org.shift_handover',
        entityId: hid,
      })
      await this.ctx.audit(c, 'handover.create', { entityType: 'org.shift_handover', entityId: hid })
      return hid
    })
    return this.get(actor, id)
  }

  private async admissionInfo(c: PoolClient, admissionId: string, hospitalId: string | null) {
    const r = await c.query('SELECT patient_person_id, bed_id FROM access.admission WHERE id = $1 AND hospital_id = $2', [admissionId, hospitalId])
    if (!r.rows[0]) throw new BadRequestException({ success: false, errorMessage: 'Admission not found in your hospital' })
    return r.rows[0] as { patient_person_id: string; bed_id: string | null }
  }

  /** The person taking over signs; a signed handover is a record and cannot change. */
  async sign(actor: StaffActor, id: string): Promise<HandoverView> {
    const unit = this.unitOf(actor)
    const cur = await this.db.query<any>(
      `SELECT id, from_user_id, to_user_id, signed_at, unit_name FROM org.shift_handover WHERE id = $1 AND hospital_id = $2 AND unit_kind = $3`,
      [id, actor.hospitalId, unit.kind],
    )
    const h = cur[0]
    if (!h) notFound('Handover')
    if (h.signed_at) throw new ConflictException({ success: false, errorMessage: 'This handover is already signed' })
    if (h.from_user_id === actor.userId) forbidden('The person who wrote the handover cannot sign it; the person taking over signs')
    if (h.to_user_id && h.to_user_id !== actor.userId) forbidden('This handover is addressed to a colleague')
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `UPDATE org.shift_handover SET signed_at = util.demo_now(), signed_by_user_id = $2, to_user_id = COALESCE(to_user_id, $2) WHERE id = $1`,
        [id, actor.userId],
      )
      await this.ctx.emitEvent(c, actor, {
        type: 'handover',
        toRoles: [ROLE_LABEL[actor.kind as 'nurse' | 'lab' | 'radiology']],
        toUserId: h.from_user_id,
        title: `Handover signed · ${h.unit_name}`,
        text: `${actor.fullName} took over`,
        href: HREF[actor.kind as 'nurse' | 'lab' | 'radiology'],
        entityType: 'org.shift_handover',
        entityId: id,
      })
      await this.ctx.audit(c, 'handover.sign', { entityType: 'org.shift_handover', entityId: id })
    })
    return this.get(actor, id)
  }

  /** Tick a handover item done (by the person who took over, or the author). */
  async completeItem(actor: StaffActor, handoverId: string, itemId: string): Promise<{ ok: true }> {
    const unit = this.unitOf(actor)
    const rows = await this.db.query(
      `SELECT 1 FROM org.handover_item i JOIN org.shift_handover h ON h.id = i.handover_id
        WHERE i.id = $1 AND h.id = $2 AND h.hospital_id = $3 AND h.unit_kind = $4`,
      [itemId, handoverId, actor.hospitalId, unit.kind],
    )
    if (rows.length === 0) notFound('Handover item')
    await this.ctx.tx(actor, async (c) => {
      await c.query('UPDATE org.handover_item SET done_at = COALESCE(done_at, util.demo_now()) WHERE id = $1', [itemId])
    })
    return { ok: true }
  }
}
