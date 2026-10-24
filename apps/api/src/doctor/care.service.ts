import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { CreateHandoverRequest, CreateReferralRequest } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { DEMO_ENC_KEY, DoctorDbService, DoctorTx, toIso } from './doctor-db.service'
import { loadHeader, requireLiveSession, systemFolderId } from './session.helpers'

const URGENCY_LABEL = { routine: 'Routine (2 weeks)', soon: 'Soon (72 hours)', urgent: 'Urgent (today)' } as const
const REF_STATUS_ORDER = ['sent', 'seen', 'accepted', 'closed']

/** "Thomas Varghese" -> "Thomas V." (used in feed texts shared with ward staff). */
function shortName(full: string): string {
  const parts = full.replace(/^(Dr|Sr|Br|Mr|Mrs|Ms)\.?\s+/i, '').trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!
}

@Injectable()
export class CareService {
  constructor(private readonly db: DoctorDbService) {}

  // ------------------------------------------------------------------
  // Referrals
  // ------------------------------------------------------------------
  async destinations(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT h.id, h.name, h.hospital_type::text AS type, d.name AS district,
                COALESCE((SELECT array_agg(dep.name ORDER BY dep.name) FROM org.department dep WHERE dep.hospital_id = h.id AND dep.is_active), '{}') AS departments
           FROM org.hospital h JOIN geo.district d ON d.id = h.district_id
          WHERE h.status = 'active' AND h.show_in_find_care AND h.id <> util.ctx_hospital_id()
          ORDER BY (d.id = (SELECT district_id FROM org.hospital WHERE id = util.ctx_hospital_id())) DESC, h.name LIMIT 60`,
      )
      return rows.map((h) => ({ id: h.id, name: h.name, type: h.type, district: h.district, departments: h.departments }))
    })
  }

  async destinationDoctors(user: AuthenticatedUser | undefined, hospitalId: string) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT u.id, p.full_name, dp.specialisation FROM identity.doctor_profile dp
           JOIN identity.app_user u ON u.id = dp.user_id AND u.status = 'active' JOIN identity.person p ON p.id = u.person_id
          WHERE dp.hospital_id = $1 ORDER BY p.full_name LIMIT 50`,
        [hospitalId],
      )
      return rows.map((r) => ({ userId: r.id, name: r.full_name, specialisation: r.specialisation }))
    })
  }

  async createReferral(user: AuthenticatedUser | undefined, sessionId: string, body: CreateReferralRequest) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      const hospitalId = await tx.hospitalId()
      const dest = await tx.one<{ name: string; district_id: string }>(`SELECT name, district_id FROM org.hospital WHERE id = $1 AND status = 'active'`, [body.toHospitalId])
      if (!dest) throw new BadRequestException('The receiving hospital is not available')
      let toDoctorName: string | null = null
      if (body.toUserId) {
        const d = await tx.one<{ full_name: string }>(
          `SELECT p.full_name FROM identity.doctor_profile dp JOIN identity.app_user u ON u.id = dp.user_id JOIN identity.person p ON p.id = u.person_id
            WHERE dp.user_id = $1 AND dp.hospital_id = $2`,
          [body.toUserId, body.toHospitalId],
        )
        if (!d) throw new BadRequestException('That doctor does not work at the receiving hospital')
        toDoctorName = d.full_name
      }
      const patient = await loadHeader(tx, s.patientPersonId)
      const me = await tx.one<{ full_name: string }>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = util.ctx_user_id()`)

      const text = [
        `REFERRAL NOTE (SYNTHETIC DEMO DATA)`,
        `Patient: ${patient.name}, ${patient.age ?? '?'} y, ${patient.sex}`,
        `To: ${body.specialty}, ${dest.name}${toDoctorName ? ` (${toDoctorName})` : ''}`,
        `Urgency: ${URGENCY_LABEL[body.urgency]}`,
        `From: ${me?.full_name}`,
        '',
        `Reason: ${body.reason}`,
        '',
        'The receiving doctor still needs the patient\'s key to open the record.',
      ].join('\n')
      const bytes = Buffer.from(text, 'utf8')
      const folder = await systemFolderId(tx, s.patientPersonId, 'doctor_uploads')
      const doc = await tx.one<{ id: string }>(
        `INSERT INTO records.document (patient_person_id, folder_id, title, doc_type, body_enc, mime_type, size_bytes, sha256, enc_key_id, created_by_user_id, session_id, source_label)
         VALUES ($1, $2, $3, 'referral_note', $4, 'text/plain', $5, $6, $7, util.ctx_user_id(), $8, $9) RETURNING id`,
        [s.patientPersonId, folder, `Referral · ${body.specialty}, ${dest.name}`, bytes, bytes.length, createHash('sha256').update(bytes).digest(), DEMO_ENC_KEY, s.id, me?.full_name ?? null],
      )
      const ref = await tx.one<{ id: string; created_at: Date }>(
        `INSERT INTO records.referral (patient_person_id, from_user_id, to_user_id, to_hospital_id, note_document_id)
         VALUES ($1, util.ctx_user_id(), $2, $3, $4) RETURNING id, created_at`,
        [s.patientPersonId, body.toUserId ?? null, body.toHospitalId, doc!.id],
      )
      const title = `Referral · ${body.specialty}, ${dest.name}`
      await tx.emit({
        type: 'referral',
        toRoles: ['citizen', 'hospitaladmin'],
        title,
        text: `${patient.name} · ${body.urgency} · ${me?.full_name}`,
        entityType: 'records.referral',
        entityId: ref!.id,
        patientPersonId: s.patientPersonId,
        hospitalId,
      })
      if (body.toUserId) {
        await tx.emit({
          type: 'referral',
          toRoles: ['doctor'],
          toUserId: body.toUserId,
          title,
          text: `${patient.name} · ${body.urgency} · from ${me?.full_name}. You will need the patient's key to open the record.`,
          entityType: 'records.referral',
          entityId: ref!.id,
          patientPersonId: s.patientPersonId,
        })
      }
      await tx.audit('referral.create', { entityType: 'referral', entityId: ref!.id, patient: s.patientPersonId, session: s.id, details: { to: dest.name, urgency: body.urgency } })
      return { referralId: ref!.id, noteDocumentId: doc!.id, status: 'sent', to: dest.name, specialty: body.specialty, urgency: body.urgency, createdAt: toIso(ref!.created_at) }
    })
  }

  /** Referrals I sent and referrals sent to me. */
  async listReferrals(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const sent = await tx.asOwner(() =>
        tx.query<any>(
          `SELECT r.id, r.status::text AS status, r.created_at, p.full_name AS patient, h.name AS hospital, tp.full_name AS to_doctor, doc.title
             FROM records.referral r
             JOIN identity.person p ON p.id = r.patient_person_id
             LEFT JOIN org.hospital h ON h.id = r.to_hospital_id
             LEFT JOIN identity.app_user tu ON tu.id = r.to_user_id LEFT JOIN identity.person tp ON tp.id = tu.person_id
             JOIN records.document doc ON doc.id = r.note_document_id
            WHERE r.from_user_id = util.ctx_user_id() ORDER BY r.created_at DESC LIMIT 50`,
        ),
      )
      const received = await tx.asOwner(() =>
        tx.query<any>(
          `SELECT r.id, r.status::text AS status, r.created_at, p.full_name AS patient, fp.full_name AS from_doctor, doc.title
             FROM records.referral r
             JOIN identity.person p ON p.id = r.patient_person_id
             JOIN identity.app_user fu ON fu.id = r.from_user_id JOIN identity.person fp ON fp.id = fu.person_id
             JOIN records.document doc ON doc.id = r.note_document_id
            WHERE r.to_user_id = util.ctx_user_id() ORDER BY r.created_at DESC LIMIT 50`,
        ),
      )
      return {
        sent: sent.map((r) => ({ id: r.id, patientName: r.patient, to: r.title.replace(/^Referral( note)? · /, ''), toHospital: r.hospital, toDoctor: r.to_doctor, status: r.status, sentAt: toIso(r.created_at) })),
        received: received.map((r) => ({ id: r.id, patientName: r.patient, from: r.from_doctor, subject: r.title.replace(/^Referral( note)? · /, ''), status: r.status, sentAt: toIso(r.created_at), note: 'You still need the patient\'s key to open the record.' })),
      }
    })
  }

  /** The receiving doctor moves a referral forward: seen -> accepted -> closed. */
  async updateReferralStatus(user: AuthenticatedUser | undefined, id: string, status: 'seen' | 'accepted' | 'closed') {
    return this.db.run(user, async (tx) => {
      const r = await tx.asOwner(() => tx.one<any>(`SELECT status::text AS status, to_user_id, patient_person_id FROM records.referral WHERE id = $1`, [id]))
      if (!r) throw new NotFoundException('Referral not found')
      if (r.to_user_id !== tx.actor.userId) throw new ForbiddenException('Only the receiving doctor can update a referral')
      if (REF_STATUS_ORDER.indexOf(status) <= REF_STATUS_ORDER.indexOf(r.status)) throw new BadRequestException(`The referral is already ${r.status}`)
      await tx.asOwner(() => tx.query(`UPDATE records.referral SET status = $2::records.referral_status WHERE id = $1`, [id, status]))
      await tx.audit('referral.status', { entityType: 'referral', entityId: id, patient: r.patient_person_id, details: { status } })
      return { id, status }
    })
  }

  // ------------------------------------------------------------------
  // Shift handover
  // ------------------------------------------------------------------
  async colleagues(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT DISTINCT u.id, p.full_name, dp.specialisation, (dp.hospital_id = util.ctx_hospital_id()) AS own_hospital
           FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id JOIN identity.doctor_profile dp ON dp.user_id = u.id
           LEFT JOIN org.doctor_roster r ON r.doctor_user_id = u.id AND r.hospital_id = util.ctx_hospital_id()
          WHERE u.status = 'active' AND u.id <> util.ctx_user_id() AND (dp.hospital_id = util.ctx_hospital_id() OR r.id IS NOT NULL)
          ORDER BY own_hospital DESC, p.full_name LIMIT 60`,
      )
      return rows.map((r) => ({ userId: r.id, name: r.full_name, specialisation: r.specialisation, visiting: !r.own_hospital }))
    })
  }

  async listHandovers(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const hs = await tx.query<any>(
        `SELECT h.id, h.unit_name, h.shift_date::text AS shift_date, h.summary, h.created_at, h.signed_at, h.ai_draft_text, h.ai_draft_simulated,
                fp.full_name AS from_name, tp.full_name AS to_name, h.from_user_id, h.to_user_id, sp.full_name AS signed_by
           FROM org.shift_handover h
           JOIN identity.app_user fu ON fu.id = h.from_user_id JOIN identity.person fp ON fp.id = fu.person_id
           LEFT JOIN identity.app_user tu ON tu.id = h.to_user_id LEFT JOIN identity.person tp ON tp.id = tu.person_id
           LEFT JOIN identity.app_user su ON su.id = h.signed_by_user_id LEFT JOIN identity.person sp ON sp.id = su.person_id
          WHERE h.unit_kind = 'doctor' AND (h.from_user_id = util.ctx_user_id() OR h.to_user_id = util.ctx_user_id())
          ORDER BY h.created_at DESC LIMIT 10`,
      )
      const items = hs.length
        ? await tx.query<any>(
            `SELECT i.handover_id, i.id, i.flag, i.note, i.from_ai_draft, i.patient_person_id, p.full_name FROM org.handover_item i
               LEFT JOIN identity.person p ON p.id = i.patient_person_id WHERE i.handover_id = ANY($1::uuid[]) ORDER BY i.created_at, i.id`,
            [hs.map((h) => h.id)],
          )
        : []
      const me = tx.actor.userId
      return hs.map((h) => ({
        id: h.id,
        unit: h.unit_name,
        shiftDate: h.shift_date,
        from: h.from_name,
        to: h.to_name,
        summary: h.summary,
        createdAt: toIso(h.created_at),
        signedAt: toIso(h.signed_at),
        signedBy: h.signed_by,
        canSign: !h.signed_at && h.to_user_id === me,
        items: items.filter((i) => i.handover_id === h.id).map((i) => ({ id: i.id, patientPersonId: i.patient_person_id, patientName: i.full_name, flag: i.flag, note: i.note, fromAiDraft: i.from_ai_draft })),
      }))
    })
  }

  /** Simulated AI draft of the handover list from my open orders, unread critical values and recent referrals. */
  async draftHandover(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const items: { patientPersonId: string; patientName: string; flag: string; note: string; fromAiDraft: true }[] = []
      const crit = await tx.asOwner(() =>
        tx.query<any>(
          `SELECT DISTINCT ON (r.patient_person_id) r.patient_person_id, p.full_name, v.test_code::text AS code, v.value_num::float8 AS v, v.unit
             FROM lab.result r JOIN records.clinical_order o ON o.id = r.order_id JOIN lab.result_value v ON v.result_id = r.id AND v.is_critical
             JOIN identity.person p ON p.id = r.patient_person_id
            WHERE o.ordered_by_user_id = util.ctx_user_id() AND r.status IN ('released','amended') AND r.released_at > now() - interval '3 days'
            ORDER BY r.patient_person_id, r.released_at DESC LIMIT 4`,
        ),
      )
      for (const c of crit) items.push({ patientPersonId: c.patient_person_id, patientName: c.full_name, flag: 'watch', note: `Critical ${c.code} ${c.v} ${c.unit ?? ''} — repeat and review`, fromAiDraft: true })
      const pend = await tx.asOwner(() =>
        tx.query<any>(
          `SELECT o.patient_person_id, p.full_name, o.details, o.order_ref FROM records.clinical_order o JOIN identity.person p ON p.id = o.patient_person_id
            WHERE o.ordered_by_user_id = util.ctx_user_id() AND o.status IN ('open','accepted','in_progress') AND o.order_type::text IN ('lab','scan')
            ORDER BY o.created_at DESC LIMIT 4`,
        ),
      )
      for (const p of pend) if (!items.some((i) => i.patientPersonId === p.patient_person_id)) items.push({ patientPersonId: p.patient_person_id, patientName: p.full_name, flag: 'pending', note: `${p.details} pending (${p.order_ref})`, fromAiDraft: true })
      const tr = await tx.asOwner(() =>
        tx.query<any>(
          `SELECT r.patient_person_id, p.full_name, h.name FROM records.referral r JOIN identity.person p ON p.id = r.patient_person_id LEFT JOIN org.hospital h ON h.id = r.to_hospital_id
            WHERE r.from_user_id = util.ctx_user_id() AND r.status = 'accepted' ORDER BY r.updated_at DESC LIMIT 2`,
        ),
      )
      for (const t of tr) if (!items.some((i) => i.patientPersonId === t.patient_person_id)) items.push({ patientPersonId: t.patient_person_id, patientName: t.full_name, flag: 'transfer', note: `Referral accepted by ${t.name}; confirm transfer time`, fromAiDraft: true })
      return { items, simulated: true, label: 'Simulated AI output. Guidance only.' as const }
    })
  }

  async createHandover(user: AuthenticatedUser | undefined, body: CreateHandoverRequest) {
    return this.db.run(user, async (tx) => {
      const hospitalId = await tx.hospitalId()
      const me = await tx.one<{ full_name: string; dept: string | null }>(
        `SELECT p.full_name, d.name AS dept FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id
           LEFT JOIN identity.doctor_profile dp ON dp.user_id = u.id LEFT JOIN org.department d ON d.id = dp.department_id WHERE u.id = util.ctx_user_id()`,
      )
      let toName: string | null = null
      if (body.toUserId) {
        const t = await tx.one<{ full_name: string }>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = $1 AND u.account_type = 'doctor'`, [body.toUserId])
        if (!t) throw new BadRequestException('The receiving doctor was not found')
        toName = t.full_name
      }
      const names = new Map<string, string>()
      for (const it of body.items) {
        if (!it.patientPersonId) continue
        const treated = await tx.asOwner(() =>
          tx.one(
            `SELECT 1 FROM access.access_session WHERE user_id = util.ctx_user_id() AND patient_person_id = $1
             UNION ALL SELECT 1 FROM engage.op_visit WHERE doctor_user_id = util.ctx_user_id() AND patient_person_id = $1 LIMIT 1`,
            [it.patientPersonId],
          ),
        )
        if (!treated) throw new ForbiddenException('You can only hand over patients you have treated')
        names.set(it.patientPersonId, (await loadHeader(tx, it.patientPersonId)).name)
      }
      const aiDraftText = body.items.some((i) => i.fromAiDraft) ? body.items.filter((i) => i.fromAiDraft).map((i) => i.note).join(' | ') : null
      const h = await tx.one<{ id: string }>(
        `INSERT INTO org.shift_handover (hospital_id, unit_kind, unit_name, shift_date, from_user_id, to_user_id, summary, ai_draft_text, ai_draft_simulated)
         VALUES ($1, 'doctor', $2, current_date, util.ctx_user_id(), $3, $4, $5, true) RETURNING id`,
        [hospitalId, `${me?.dept ?? 'Doctor'} handover`, body.toUserId ?? null, body.summary ?? null, aiDraftText],
      )
      for (const it of body.items) {
        await tx.query(`INSERT INTO org.handover_item (handover_id, patient_person_id, flag, note, from_ai_draft) VALUES ($1, $2, $3, $4, $5)`, [h!.id, it.patientPersonId ?? null, it.flag, it.note, !!it.fromAiDraft])
      }
      const shorts = [...names.values()].map(shortName)
      await tx.emit({
        type: 'handover',
        toRoles: ['doctor', 'nurse'],
        title: `Shift handover · ${body.items.length} patient${body.items.length === 1 ? '' : 's'}`,
        text: `${me?.full_name}${toName ? ` → ${toName}` : ''}${shorts.length ? ` · ${shorts.join(', ')}` : ''}`,
        entityType: 'org.shift_handover',
        entityId: h!.id,
        hospitalId,
      })
      await tx.audit('handover.create', { entityType: 'shift_handover', entityId: h!.id, details: { items: body.items.length, to: body.toUserId ?? null } })
      return { handoverId: h!.id, items: body.items.length, to: toName }
    })
  }

  /** The doctor taking over signs. A signed handover is a record and cannot change. */
  async signHandover(user: AuthenticatedUser | undefined, id: string) {
    return this.db.run(user, async (tx) => {
      const h = await tx.one<any>(`SELECT id, to_user_id, signed_at FROM org.shift_handover WHERE id = $1`, [id])
      if (!h) throw new NotFoundException('Handover not found')
      if (h.to_user_id !== tx.actor.userId) throw new ForbiddenException('Only the doctor taking over can sign this handover')
      if (h.signed_at) throw new BadRequestException('Already signed')
      await tx.query(`UPDATE org.shift_handover SET signed_at = now(), signed_by_user_id = util.ctx_user_id() WHERE id = $1`, [id])
      await tx.audit('handover.sign', { entityType: 'shift_handover', entityId: id })
      return { id, signed: true }
    })
  }
}
