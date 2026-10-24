import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { AuthenticatedUser } from '../auth/types'
import { StorageService } from '../storage/storage.service'
import { DoctorDbService, DoctorTx, toIso } from './doctor-db.service'
import { generateSummaryInsight } from './ai-sim'
import { loadHeader, recordItemView, requireLiveSession, shareFlags, type ShareCategory } from './session.helpers'

/** LOINC codes used by vital_observation -> short names (display only). */
export const VITAL_NAMES: Record<string, { name: string; short: string }> = {
  '8480-6': { name: 'Systolic blood pressure', short: 'BP sys' },
  '8462-4': { name: 'Diastolic blood pressure', short: 'BP dia' },
  '8867-4': { name: 'Heart rate', short: 'Pulse' },
  '2708-6': { name: 'Oxygen saturation (SpO2)', short: 'SpO2' },
  '8310-5': { name: 'Body temperature', short: 'Temp' },
  '29463-7': { name: 'Body weight', short: 'Weight' },
  '8302-2': { name: 'Body height', short: 'Height' },
  '1558-6': { name: 'Fasting glucose', short: 'Fasting glucose' },
  '4548-4': { name: 'HbA1c (home / point-of-care)', short: 'HbA1c' },
}

const DOC_KIND: Record<string, { label: string; category: ShareCategory | null }> = {
  lab_report: { label: 'Lab', category: 'lab' },
  scan: { label: 'Imaging', category: 'imaging' },
  prescription: { label: 'Rx', category: 'rx' },
  vcf: { label: 'Genomic', category: 'genomic' },
  discharge_summary: { label: 'Discharge', category: null },
  consultation_note: { label: 'Consultation', category: null },
  referral_note: { label: 'Referral', category: null },
  handover_note: { label: 'Handover', category: null },
  text_note: { label: 'Note', category: null },
  upload: { label: 'Uploaded', category: null },
  certificate: { label: 'Certificate', category: null },
  ai_chat_summary: { label: 'AI chat', category: null },
  voice_note_transcript: { label: 'Voice note', category: null },
}

@Injectable()
export class PatientService {
  constructor(
    private readonly db: DoctorDbService,
    private readonly storage: StorageService,
  ) {}

  /** Chart summary of the open patient. Every part honours the patient's share switches. */
  async summary(user: AuthenticatedUser | undefined, sessionId: string) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      const pid = s.patientPersonId
      const flags = await shareFlags(tx, pid)
      const header = await loadHeader(tx, pid)

      const allergies = await tx.query(
        `SELECT id, substance, reaction, severity, recorded_at FROM records.allergy
          WHERE patient_person_id = $1 AND superseded_by IS NULL AND status = 'active' ORDER BY recorded_at DESC`,
        [pid],
      )
      const conditions = await tx.query(
        `SELECT id, name, code, is_chronic, onset_date::text AS onset_date FROM records.condition
          WHERE patient_person_id = $1 AND superseded_by IS NULL AND status = 'active' ORDER BY is_chronic DESC, recorded_at DESC`,
        [pid],
      )
      const medications = flags.rx
        ? await tx.query(
            `SELECT mc.id, COALESCE(m.generic_name || ' ' || m.strength, mc.free_text) AS name, mc.dose, mc.since::text AS since
               FROM records.medication_current mc LEFT JOIN pharmacy.medicine m ON m.id = mc.medicine_id
              WHERE mc.patient_person_id = $1 AND mc.status = 'active' AND mc.superseded_by IS NULL ORDER BY mc.recorded_at DESC`,
            [pid],
          )
        : []
      const contacts = await tx.query(
        `SELECT cp.full_name AS name, ec.relation FROM identity.emergency_contact ec
           JOIN identity.person cp ON cp.id = ec.contact_person_id
          WHERE ec.citizen_person_id = $1 AND ec.removed_at IS NULL ORDER BY ec.priority`,
        [pid],
      )
      const specials = await tx.query(
        `SELECT t.name, sc.status FROM identity.special_category sc
           JOIN identity.special_category_type t ON t.code = sc.category_code
          WHERE sc.person_id = $1 AND sc.ended_at IS NULL AND sc.category_code NOT IN ('hiv','mental_health')`,
        [pid],
      )
      const donor = await tx.one<{ organ_donor_status: string }>(`SELECT organ_donor_status::text AS organ_donor_status FROM identity.citizen_profile WHERE person_id = $1`, [pid])

      const glance: { label: string; value: string; at: string | null }[] = []
      if (flags.vitals) {
        const v = await tx.query<any>(
          `SELECT DISTINCT ON (code) code, value_num::float8 AS v, unit, effective_at
             FROM records.vital_observation
            WHERE patient_person_id = $1 AND NOT entered_in_error AND code = ANY($2::text[])
            ORDER BY code, effective_at DESC`,
          [pid, ['8480-6', '8462-4', '8867-4', '2708-6', '8310-5', '29463-7', '8302-2']],
        )
        const by = new Map(v.map((x) => [x.code, x]))
        const sys = by.get('8480-6')
        const dia = by.get('8462-4')
        if (sys && dia) glance.push({ label: 'BP', value: `${Math.round(sys.v)}/${Math.round(dia.v)} mmHg`, at: toIso(sys.effective_at) })
        if (by.get('8867-4')) glance.push({ label: 'Pulse', value: `${Math.round(by.get('8867-4').v)} /min`, at: toIso(by.get('8867-4').effective_at) })
        if (by.get('2708-6')) glance.push({ label: 'SpO2', value: `${by.get('2708-6').v}%`, at: toIso(by.get('2708-6').effective_at) })
        const w = by.get('29463-7')
        const h = by.get('8302-2')
        if (w) glance.push({ label: 'Weight', value: `${w.v} kg`, at: toIso(w.effective_at) })
        if (w && h && h.v > 0) glance.push({ label: 'BMI', value: String(Math.round((w.v / (h.v / 100) ** 2) * 10) / 10), at: toIso(w.effective_at) })
      }
      if (flags.lab) {
        const l = await tx.query<any>(
          `SELECT DISTINCT ON (test_code) test_code, test_name, value_num::float8 AS v, unit, flag, observed_at
             FROM lab.v_analyte_series WHERE patient_person_id = $1 AND test_code IN ('HBA1C','LDL')
            ORDER BY test_code, observed_at DESC`,
          [pid],
        )
        for (const x of l) glance.push({ label: x.test_name, value: `${x.v} ${x.unit ?? ''}${x.flag && x.flag !== 'N' ? ` (${x.flag})` : ''}`.trim(), at: toIso(x.observed_at) })
      }
      const docCount = await tx.one<{ n: number }>(`SELECT count(*)::int AS n FROM records.document WHERE patient_person_id = $1`, [pid])
      glance.push({ label: 'Documents', value: String(docCount?.n ?? 0), at: null })

      const timeline = await this.timeline(tx, pid, flags)
      await recordItemView(tx, s, { kind: 'other', label: 'Summary opened' })
      await tx.audit('record.view', { entityType: 'patient_summary', patient: pid, session: sessionId })

      const summaryInsight = generateSummaryInsight({
        patientName: header.name,
        age: header.age,
        allergies: allergies.map((a: any) => a.substance),
        conditions: conditions.map((c: any) => c.name),
        medications: medications.map((m: any) => m.name),
        glance,
      })

      return {
        patient: header,
        hiddenByPatient: (Object.keys(flags) as ShareCategory[]).filter((k) => !flags[k]),
        allergies: allergies.map((a: any) => ({ id: a.id, substance: a.substance, reaction: a.reaction, severity: a.severity })),
        conditions: conditions.map((c: any) => ({ id: c.id, name: c.name, code: c.code, chronic: c.is_chronic, onset: c.onset_date })),
        medications: medications.map((m: any) => ({ id: m.id, name: m.name, dose: m.dose, since: m.since })),
        emergencyContacts: contacts,
        specialCategories: specials,
        organDonor: donor?.organ_donor_status === 'pledged',
        glance,
        timeline,
        aiSummary: summaryInsight,
      }
    })
  }

  private async timeline(tx: DoctorTx, pid: string, flags: Record<ShareCategory, boolean>) {
    const items: { at: string; kind: string; title: string; detail: string }[] = []
    if (flags.lab) {
      const labs = await tx.query<any>(
        `SELECT r.released_at AS at, o.details AS title,
                (SELECT string_agg(v.test_code || ' ' || trim(trailing '.' FROM trim(trailing '0' FROM v.value_num::text)) || ' ' || coalesce(v.unit, '') ||
                                   CASE WHEN v.flag IS NOT NULL AND v.flag <> 'N' THEN ' (' || v.flag || ')' ELSE '' END, ' · ' ORDER BY v.test_code)
                   FROM lab.result_value v WHERE v.result_id = r.id AND v.value_num IS NOT NULL) AS detail
           FROM lab.result r JOIN records.clinical_order o ON o.id = r.order_id
          WHERE r.patient_person_id = $1 AND r.status IN ('released','amended') ORDER BY r.released_at DESC LIMIT 6`,
        [pid],
      )
      for (const l of labs) items.push({ at: toIso(l.at)!, kind: 'lab', title: l.title, detail: l.detail ?? 'Result released' })
    }
    if (flags.imaging) {
      const imgs = await tx.query<any>(
        `SELECT coalesce(s.completed_at, s.created_at) AS at, s.modality || ' ' || s.body_part AS title, s.status AS detail
           FROM imaging.study s WHERE s.patient_person_id = $1 AND s.status IN ('uploaded','awaiting_report','reported') ORDER BY 1 DESC LIMIT 4`,
        [pid],
      )
      for (const i of imgs) items.push({ at: toIso(i.at)!, kind: 'imaging', title: i.title, detail: i.detail === 'reported' ? 'Reported' : 'Awaiting report' })
    }
    if (flags.rx) {
      const rx = await tx.query<any>(
        `SELECT r.issued_at AS at, r.rx_number AS title, dp.full_name AS doctor,
                (SELECT string_agg(m.generic_name || ' ' || m.strength, ', ') FROM pharmacy.prescription_item i JOIN pharmacy.medicine m ON m.id = i.medicine_id WHERE i.prescription_id = r.id) AS meds
           FROM pharmacy.prescription r JOIN identity.app_user u ON u.id = r.doctor_user_id JOIN identity.person dp ON dp.id = u.person_id
          WHERE r.patient_person_id = $1 ORDER BY r.issued_at DESC LIMIT 5`,
        [pid],
      )
      for (const r of rx) items.push({ at: toIso(r.at)!, kind: 'prescription', title: `Prescription ${r.title}`, detail: `${r.meds ?? ''} · ${r.doctor}` })
    }
    const notes = await tx.query<any>(
      `SELECT created_at AS at, title, source_label FROM records.document
        WHERE patient_person_id = $1 AND doc_type IN ('consultation_note','discharge_summary') ORDER BY created_at DESC LIMIT 4`,
      [pid],
    )
    for (const n of notes) items.push({ at: toIso(n.at)!, kind: 'note', title: n.title, detail: n.source_label ?? '' })
    const don = await tx.query<any>(
      `SELECT donated_at AS at, volume_ml FROM donation.blood_donation WHERE donor_person_id = $1 ORDER BY donated_at DESC LIMIT 2`,
      [pid],
    )
    for (const d of don) items.push({ at: toIso(d.at)!, kind: 'donation', title: 'Blood donation', detail: d.volume_ml ? `${d.volume_ml} mL` : '' })
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12)
  }

  /** Lab and vital trends. */
  async trends(user: AuthenticatedUser | undefined, sessionId: string, codes?: string[]) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      const flags = await shareFlags(tx, s.patientPersonId)
      const labSeries: any[] = []
      if (flags.lab) {
        const wanted = codes?.length ? codes.map((c) => c.toUpperCase()) : ['HBA1C', 'LDL', 'HDL', 'TG', 'CHOL']
        const rows = await tx.query<any>(
          `SELECT test_code, test_name, unit, value_num::float8 AS v, flag, ref_low::float8 AS ref_low, ref_high::float8 AS ref_high, observed_at
             FROM lab.v_analyte_series WHERE patient_person_id = $1 AND test_code::text = ANY($2::text[]) ORDER BY test_code, observed_at`,
          [s.patientPersonId, wanted],
        )
        const by = new Map<string, any>()
        for (const r of rows) {
          if (!by.has(r.test_code)) by.set(r.test_code, { code: r.test_code, name: r.test_name, unit: r.unit, refLow: r.ref_low, refHigh: r.ref_high, points: [] })
          by.get(r.test_code).points.push({ at: toIso(r.observed_at), value: r.v, flag: r.flag })
        }
        labSeries.push(...by.values())
      }
      const vitalSeries: any[] = []
      if (flags.vitals) {
        const rows = await tx.query<any>(
          `SELECT code, unit, value_num::float8 AS v, effective_at FROM records.vital_observation
            WHERE patient_person_id = $1 AND NOT entered_in_error AND effective_at > now() - interval '120 days'
              AND code = ANY($2::text[]) ORDER BY code, effective_at`,
          [s.patientPersonId, ['8480-6', '8462-4', '8867-4', '2708-6', '29463-7', '1558-6']],
        )
        const by = new Map<string, any>()
        for (const r of rows) {
          if (!by.has(r.code)) by.set(r.code, { code: r.code, name: VITAL_NAMES[r.code]?.name ?? r.code, unit: r.unit, points: [] })
          by.get(r.code).points.push({ at: toIso(r.effective_at), value: r.v })
        }
        vitalSeries.push(...by.values())
      }
      await recordItemView(tx, s, { kind: 'vital', label: 'Trends opened' })
      return { labSeries, vitalSeries, hiddenByPatient: (Object.keys(flags) as ShareCategory[]).filter((k) => !flags[k]) }
    })
  }

  /** File list of the open patient (patient switches applied). */
  async files(user: AuthenticatedUser | undefined, sessionId: string) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      const flags = await shareFlags(tx, s.patientPersonId)
      const rows = await tx.query<any>(
        `SELECT d.id, d.title, d.doc_type::text AS doc_type, d.mime_type, d.size_bytes, d.created_at, d.source_label, d.signature_note,
                d.sensitivity::text AS sensitivity, (d.storage_key IS NOT NULL) AS has_file, d.is_self_reported,
                (d.created_by_user_id = util.ctx_user_id()) AS mine,
                NOT EXISTS (SELECT 1 FROM records.document_view v WHERE v.document_id = d.id AND v.user_id = util.ctx_user_id()) AS is_new
           FROM records.document d WHERE d.patient_person_id = $1 ORDER BY d.created_at DESC LIMIT 200`,
        [s.patientPersonId],
      )
      const files = rows
        .filter((d) => {
          const cat = DOC_KIND[d.doc_type]?.category
          return !cat || flags[cat] || d.mine
        })
        .map((d) => ({
          id: d.id,
          title: d.title,
          type: DOC_KIND[d.doc_type]?.label ?? d.doc_type,
          docType: d.doc_type,
          source: d.source_label ?? (d.is_self_reported ? 'Patient' : null),
          signatureNote: d.signature_note,
          mimeType: d.mime_type,
          sizeBytes: d.size_bytes == null ? null : Number(d.size_bytes),
          createdAt: toIso(d.created_at),
          isNew: d.is_new,
          addedByMe: d.mine,
        }))
      return { files, hiddenByPatient: (Object.keys(flags) as ShareCategory[]).filter((k) => !flags[k]) }
    })
  }

  /** Open one file: a short-lived download link, or the text for typed notes. Logged in the session. */
  async openFile(user: AuthenticatedUser | undefined, sessionId: string, documentId: string) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      const flags = await shareFlags(tx, s.patientPersonId)
      const d = await tx.one<any>(
        `SELECT id, title, doc_type::text AS doc_type, mime_type, storage_key,
                CASE WHEN body_enc IS NOT NULL AND enc_key_id = 'demo-none' THEN convert_from(body_enc, 'UTF8') END AS body_text,
                (created_by_user_id = util.ctx_user_id()) AS mine
           FROM records.document WHERE id = $1 AND patient_person_id = $2`,
        [documentId, s.patientPersonId],
      )
      if (!d) throw new NotFoundException('File not found')
      const cat = DOC_KIND[d.doc_type]?.category
      if (cat && !flags[cat] && !d.mine) throw new ForbiddenException(`The patient has not shared ${cat.replace('_', ' ')} with doctors`)
      await tx.query(
        `INSERT INTO records.document_view (document_id, user_id) VALUES ($1, util.ctx_user_id())
         ON CONFLICT (document_id, user_id) DO UPDATE SET last_viewed_at = now(), view_count = records.document_view.view_count + 1`,
        [documentId],
      )
      await recordItemView(tx, s, { kind: 'document', id: documentId, label: d.title })
      await tx.audit('document.view', { entityType: 'document', entityId: documentId, patient: s.patientPersonId, session: sessionId, details: { title: d.title } })
      const url = d.storage_key ? await this.storage.getPresignedUrl(d.storage_key, 900).catch(() => null) : null
      return { id: d.id, title: d.title, mimeType: d.mime_type, url, text: d.body_text ?? null }
    })
  }
}
