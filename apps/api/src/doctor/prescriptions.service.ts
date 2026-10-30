import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import type {
  PrescriptionCheckResult,
  PrescriptionDraftRequest,
  PrescriptionLine,
  PrescriptionSignRequest,
} from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { allergyConflict } from './ai-sim'
import { DEMO_ENC_KEY, DoctorDbService, DoctorTx, toIso } from './doctor-db.service'
import { MockESignService } from './esign.mock'
import { loadHeader, requireLiveSession, shareFlags, systemFolderId, type LiveSession } from './session.helpers'

const VALID_DAYS = 30

/** "twice daily" -> dose times (assumption: simple clock times; the pharmacist and the citizen reminders use them). */
function timesFor(freq: string): string[] {
  const f = freq.toLowerCase()
  if (/four|qid|4/.test(f)) return ['08:00', '12:00', '16:00', '20:00']
  if (/thrice|three|tid|3|tds/.test(f)) return ['08:00', '14:00', '20:00']
  if (/twice|two|bid|bd|2/.test(f)) return ['08:00', '20:00']
  if (/night|bedtime|hs/.test(f)) return ['21:00']
  if (/lunch|noon/.test(f)) return ['13:00']
  if (/morning/.test(f)) return ['08:00']
  return ['08:00']
}

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly db: DoctorDbService,
    private readonly esign: MockESignService,
  ) {}

  /** Drug search (catalogue) with stock at the hospital's own pharmacy. */
  async searchMedicines(user: AuthenticatedUser | undefined, q: string) {
    return this.db.run(user, async (tx) => {
      const term = q.trim()
      const hospitalId = await tx.hospitalId()
      const rows = await tx.query<any>(
        `SELECT m.id, m.generic_name, m.form, m.strength, m.schedule::text AS schedule, m.category,
                st.stock_level, st.quantity::float8 AS quantity
           FROM pharmacy.medicine m
           LEFT JOIN LATERAL (
             SELECT v.stock_level, v.quantity FROM pharmacy.v_stock_status v
               JOIN org.pharmacy ph ON ph.id = v.pharmacy_id AND ph.linked_hospital_id = $2
              WHERE v.medicine_id = m.id LIMIT 1) st ON true
          WHERE m.is_active AND ($1 = '' OR m.generic_name ILIKE $1 || '%' OR m.generic_name ILIKE '% ' || $1 || '%')
          ORDER BY m.generic_name, m.strength LIMIT 25`,
        [term, hospitalId],
      )
      return rows.map((r) => ({
        id: r.id,
        name: `${r.generic_name} ${r.strength}`,
        form: r.form,
        schedule: r.schedule,
        category: r.category,
        hospitalPharmacyStock: r.stock_level ?? 'unknown',
        hospitalPharmacyQuantity: r.quantity,
      }))
    })
  }

  // ------------------------------------------------------------------
  // Safety checks (allergy, interactions, stock, kidney) — simulated rules over real data
  // ------------------------------------------------------------------
  private async check(tx: DoctorTx, s: LiveSession, lines: PrescriptionLine[]): Promise<PrescriptionCheckResult> {
    const flags = await shareFlags(tx, s.patientPersonId)
    const hospitalId = await tx.hospitalId()
    const ids = lines.map((l) => l.medicineId)
    const meds = await tx.query<any>(`SELECT id, generic_name, form, strength, schedule::text AS schedule FROM pharmacy.medicine WHERE id = ANY($1::uuid[])`, [ids])
    const byId = new Map(meds.map((m) => [m.id, m]))
    for (const l of lines) if (!byId.has(l.medicineId)) throw new BadRequestException('Unknown medicine in the prescription')

    // Allergies are always checked, even if the patient hides prescriptions (safety first).
    const allergies = (await tx.query(`SELECT substance FROM records.allergy WHERE patient_person_id = $1 AND superseded_by IS NULL AND status = 'active'`, [s.patientPersonId])).map((r: any) => r.substance as string)
    const existing = flags.rx
      ? await tx.query<any>(`SELECT medicine_id FROM records.medication_current WHERE patient_person_id = $1 AND status = 'active' AND superseded_by IS NULL AND medicine_id IS NOT NULL`, [s.patientPersonId])
      : []
    const existingIds = existing.map((e) => e.medicine_id as string)
    const inter = await tx.query<any>(
      `SELECT i.medicine_a_id, i.medicine_b_id, ma.generic_name AS a, mb.generic_name AS b, i.severity, i.note
         FROM pharmacy.drug_interaction i
         JOIN pharmacy.medicine ma ON ma.id = i.medicine_a_id JOIN pharmacy.medicine mb ON mb.id = i.medicine_b_id
        WHERE (i.medicine_a_id = ANY($1::uuid[]) AND (i.medicine_b_id = ANY($1::uuid[]) OR i.medicine_b_id = ANY($2::uuid[])))
           OR (i.medicine_b_id = ANY($1::uuid[]) AND (i.medicine_a_id = ANY($1::uuid[]) OR i.medicine_a_id = ANY($2::uuid[])))`,
      [ids, existingIds],
    )
    const stock = await tx.query<any>(
      `SELECT v.medicine_id, v.stock_level, v.quantity::float8 AS quantity, v.pharmacy_name FROM pharmacy.v_stock_status v
         JOIN org.pharmacy ph ON ph.id = v.pharmacy_id AND ph.linked_hospital_id = $2 WHERE v.medicine_id = ANY($1::uuid[])`,
      [ids, hospitalId],
    )
    const pharmacy = await tx.one<{ name: string }>(`SELECT name FROM org.pharmacy WHERE linked_hospital_id = $1 AND status = 'active' LIMIT 1`, [hospitalId])
    const egfr = flags.lab
      ? await tx.one<any>(`SELECT value_num::float8 AS v, unit FROM lab.v_analyte_series WHERE patient_person_id = $1 AND test_code::text IN ('EGFR','EGFR_CKD') ORDER BY observed_at DESC LIMIT 1`, [s.patientPersonId])
      : null

    const out: PrescriptionCheckResult['lines'] = lines.map((l) => {
      const m = byId.get(l.medicineId)
      const name = `${m.generic_name} ${m.strength}`
      const st = stock.find((x) => x.medicine_id === l.medicineId)
      return {
        medicineId: l.medicineId,
        name,
        allergy: allergyConflict(allergies, `${m.generic_name}`),
        interactions: inter
          .filter((i) => i.medicine_a_id === l.medicineId || i.medicine_b_id === l.medicineId)
          .map((i) => ({ with: i.medicine_a_id === l.medicineId ? i.b : i.a, severity: i.severity, note: i.note })),
        stock: { pharmacy: st?.pharmacy_name ?? pharmacy?.name ?? 'Hospital pharmacy', level: (st?.stock_level ?? 'unknown') as 'in' | 'low' | 'out' | 'unknown', quantity: st?.quantity ?? null },
        schedule: m.schedule,
      }
    })
    const allergyBlocked = out.some((l) => l.allergy?.blocked)
    const major = out.some((l) => l.interactions.some((i) => ['major', 'contraindicated'].includes(i.severity)))
    return {
      lines: out,
      summary: {
        allergyBlocked,
        hasMajorInteraction: major,
        needsOverrideReason: allergyBlocked || major,
        renal: egfr ? `eGFR ${egfr.v} ${egfr.unit ?? ''}` : 'Kidney function: no eGFR on file (simulated check)',
      },
      simulated: true,
    }
  }

  async checkLines(user: AuthenticatedUser | undefined, sessionId: string, lines: PrescriptionLine[]) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      return this.check(tx, s, lines)
    })
  }

  // ------------------------------------------------------------------
  // Drafts
  // ------------------------------------------------------------------
  async saveDraft(user: AuthenticatedUser | undefined, sessionId: string, body: PrescriptionDraftRequest) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      const hospitalId = await tx.hospitalId()
      const checks = body.lines.length ? await this.check(tx, s, body.lines) : null
      let draft: any
      if (body.draftId) {
        draft = await tx.one(
          `UPDATE pharmacy.prescription_draft SET lines = $2::jsonb, checks = $3::jsonb, notes = $4
            WHERE id = $1 AND doctor_user_id = util.ctx_user_id() AND patient_person_id = $5 AND promoted_prescription_id IS NULL
            RETURNING id, updated_at`,
          [body.draftId, JSON.stringify(body.lines), JSON.stringify(checks ?? {}), body.advice ?? null, s.patientPersonId],
        )
        if (!draft) throw new NotFoundException('Draft not found (or already signed)')
      } else {
        draft = await tx.one(
          `INSERT INTO pharmacy.prescription_draft (patient_person_id, doctor_user_id, session_id, hospital_id, lines, checks, notes)
           VALUES ($1, util.ctx_user_id(), $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING id, updated_at`,
          [s.patientPersonId, s.id, hospitalId, JSON.stringify(body.lines), JSON.stringify(checks ?? {}), body.advice ?? null],
        )
      }
      return { draftId: draft.id, updatedAt: toIso(draft.updated_at), lines: body.lines, advice: body.advice ?? null, checks }
    })
  }

  /** My prescriptions: drafts waiting for e-sign and what I issued recently. */
  async list(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const drafts = await tx.query<any>(
        `SELECT d.id, d.patient_person_id, p.full_name, jsonb_array_length(d.lines) AS lines, d.notes, d.updated_at,
                (SELECT string_agg(m.generic_name || ' ' || m.strength, ', ')
                   FROM jsonb_array_elements(d.lines) l JOIN pharmacy.medicine m ON m.id = (l ->> 'medicineId')::uuid) AS medicines
           FROM pharmacy.prescription_draft d JOIN identity.person p ON p.id = d.patient_person_id
          WHERE d.doctor_user_id = util.ctx_user_id() AND d.promoted_prescription_id IS NULL ORDER BY d.updated_at DESC LIMIT 20`,
      )
      const issued = await tx.query<any>(
        `SELECT r.id, r.rx_number, r.issued_at, r.status::text AS status, p.full_name,
                (SELECT string_agg(m.generic_name || ' ' || m.strength, ', ' ORDER BY i.id) FROM pharmacy.prescription_item i JOIN pharmacy.medicine m ON m.id = i.medicine_id WHERE i.prescription_id = r.id) AS medicines,
                (SELECT f.ready_at IS NOT NULL FROM pharmacy.rx_fulfilment f WHERE f.prescription_id = r.id) AS ready
           FROM pharmacy.prescription r JOIN identity.person p ON p.id = r.patient_person_id
          WHERE r.doctor_user_id = util.ctx_user_id() ORDER BY r.issued_at DESC LIMIT 40`,
      )
      return {
        drafts: drafts.map((d) => ({ id: d.id, patientPersonId: d.patient_person_id, patientName: d.full_name, lines: d.lines, medicines: d.medicines, advice: d.notes, updatedAt: toIso(d.updated_at) })),
        issued: issued.map((r) => ({ id: r.id, rxNumber: r.rx_number, patientName: r.full_name, medicines: r.medicines, issuedAt: toIso(r.issued_at), status: r.status, readyAtPharmacy: !!r.ready })),
      }
    })
  }

  async detail(user: AuthenticatedUser | undefined, id: string) {
    return this.db.run(user, async (tx) => {
      const r = await tx.one<any>(
        `SELECT r.id, r.rx_number, r.issued_at, r.valid_until, r.status::text AS status, r.signature_method::text AS signature_method, r.signature_ref, r.qr_token,
                p.full_name, r.patient_person_id
           FROM pharmacy.prescription r JOIN identity.person p ON p.id = r.patient_person_id
          WHERE r.id = $1 AND r.doctor_user_id = util.ctx_user_id()`,
        [id],
      )
      if (!r) throw new NotFoundException('Prescription not found')
      const items = await tx.query<any>(
        `SELECT i.id, m.generic_name || ' ' || m.strength AS name, i.dose, i.frequency, i.duration_days, i.quantity::float8 AS quantity, i.instructions,
                i.allergy_warning_shown, i.interaction_warning_shown, i.override_reason
           FROM pharmacy.prescription_item i JOIN pharmacy.medicine m ON m.id = i.medicine_id WHERE i.prescription_id = $1 ORDER BY i.id`,
        [id],
      )
      const delivery = await tx.query<any>(`SELECT ph.name, d.sent_at, d.received_at FROM pharmacy.prescription_delivery d JOIN org.pharmacy ph ON ph.id = d.pharmacy_id WHERE d.prescription_id = $1`, [id])
      return {
        id: r.id,
        rxNumber: r.rx_number,
        patientName: r.full_name,
        issuedAt: toIso(r.issued_at),
        validUntil: toIso(r.valid_until),
        status: r.status,
        signature: { method: r.signature_method, ref: r.signature_ref, simulated: r.signature_method === 'mock' },
        items: items.map((i) => ({ id: i.id, name: i.name, dose: i.dose, frequency: i.frequency, durationDays: i.duration_days, quantity: i.quantity, instructions: i.instructions, allergyWarningShown: i.allergy_warning_shown, interactionWarningShown: i.interaction_warning_shown, overrideReason: i.override_reason })),
        sentTo: delivery.map((d) => ({ pharmacy: d.name, sentAt: toIso(d.sent_at), receivedAt: toIso(d.received_at) })),
      }
    })
  }

  // ------------------------------------------------------------------
  // e-Sign (mock) -> prescription + document + items + delivery + event
  // ------------------------------------------------------------------
  async sign(user: AuthenticatedUser | undefined, sessionId: string, body: PrescriptionSignRequest) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      const hospitalId = await tx.hospitalId()
      let lines = body.lines
      let advice = body.advice
      let draftId: string | undefined = body.draftId
      if (draftId) {
        const d = await tx.one<any>(
          `SELECT lines, notes FROM pharmacy.prescription_draft WHERE id = $1 AND doctor_user_id = util.ctx_user_id() AND patient_person_id = $2 AND promoted_prescription_id IS NULL`,
          [draftId, s.patientPersonId],
        )
        if (!d) throw new NotFoundException('Draft not found (or already signed)')
        lines = lines ?? (d.lines as PrescriptionLine[])
        advice = advice ?? d.notes ?? undefined
      }
      if (!lines?.length) throw new BadRequestException('Add at least one medicine')

      const checks = await this.check(tx, s, lines)
      if (checks.summary.needsOverrideReason && !body.overrideReason) {
        throw new ConflictException({
          message: checks.summary.allergyBlocked
            ? 'Blocked: the patient is allergic to a prescribed medicine. Remove it or give an override reason.'
            : 'A major interaction was found. Give an override reason to continue.',
          checks,
        })
      }

      const doctor = await tx.one<any>(
        `SELECT dp.hpr_id, p.full_name, dp.signing_method::text AS signing_method FROM identity.doctor_profile dp
           JOIN identity.app_user u ON u.id = dp.user_id JOIN identity.person p ON p.id = u.person_id WHERE dp.user_id = util.ctx_user_id()`,
      )
      const patient = await loadHeader(tx, s.patientPersonId)
      const rxRow = await tx.one<{ n: string }>(`SELECT 'RX-DEMO-' || nextval('pharmacy.rx_number_seq')::text AS n`)
      const rxNumber = rxRow!.n
      const meds = await tx.query<any>(`SELECT id, generic_name, form, strength FROM pharmacy.medicine WHERE id = ANY($1::uuid[])`, [lines.map((l) => l.medicineId)])
      const medName = new Map(meds.map((m) => [m.id, `${m.generic_name} ${m.strength} ${m.form}`]))

      const text = [
        `E-SIGNED PRESCRIPTION ${rxNumber} (SIMULATED SIGNATURE, SYNTHETIC DEMO DATA)`,
        `Patient: ${patient.name}, ${patient.age ?? '?'} y, ${patient.sex}`,
        `Doctor: ${doctor?.full_name}  HPR ${doctor?.hpr_id}`,
        '',
        ...lines.map((l, i) => `${i + 1}. ${medName.get(l.medicineId)} - ${l.dose}, ${l.frequency}, ${l.durationDays} days, qty ${l.quantity}${l.instructions ? ` (${l.instructions})` : ''}`),
        '',
        advice ? `Advice: ${advice}` : '',
      ].join('\n')
      const bodyBytes = Buffer.from(text, 'utf8')
      const hash = createHash('sha256').update(bodyBytes).digest()

      const sig = await this.esign.sign({ signerHprId: doctor!.hpr_id, signerName: doctor!.full_name, documentHash: hash.toString('hex'), reason: `Prescription ${rxNumber}` })
      if (!sig.success) throw new BadRequestException(sig.errorMessage ?? 'e-Sign failed')

      const folder = await systemFolderId(tx, s.patientPersonId, 'doctor_uploads')
      const doc = await tx.one<{ id: string }>(
        `INSERT INTO records.document
           (patient_person_id, folder_id, title, doc_type, body_enc, mime_type, size_bytes, sha256, enc_key_id, created_by_user_id, session_id, source_label, signature_note)
         VALUES ($1, $2, $3, 'prescription', $4, 'text/plain', $5, $6, $7, util.ctx_user_id(), $8, $9, $10) RETURNING id`,
        [s.patientPersonId, folder, `e-Signed prescription ${rxNumber}`, bodyBytes, bodyBytes.length, hash, DEMO_ENC_KEY, s.id, `Dr. ${doctor?.full_name?.replace(/^Dr\.\s*/, '')}`, 'e-Signed (simulated)'],
      )

      const rx = await tx.one<{ id: string; issued_at: Date; valid_until: Date; qr_token: string }>(
        `INSERT INTO pharmacy.prescription
           (patient_person_id, doctor_user_id, session_id, hospital_id, valid_until, document_id, signature_method, signature_ref, qr_token, rx_number)
         VALUES ($1, util.ctx_user_id(), $2, $3, now() + make_interval(days => $4), $5, 'mock', $6, $7, $8)
         RETURNING id, issued_at, valid_until, qr_token`,
        [s.patientPersonId, s.id, hospitalId, VALID_DAYS, doc!.id, sig.signatureRef, `rxqr_${randomBytes(18).toString('base64url')}`, rxNumber],
      )

      const warnings = new Map(checks.lines.map((l) => [l.medicineId, l]))
      for (const l of lines) {
        const c = warnings.get(l.medicineId)!
        const allergyWarn = !!c.allergy?.blocked
        const interWarn = c.interactions.some((i) => ['major', 'contraindicated'].includes(i.severity))
        const overrideReason = allergyWarn || interWarn ? body.overrideReason! : null
        await tx.query(
          `INSERT INTO pharmacy.prescription_item
             (prescription_id, medicine_id, dose, frequency, duration_days, quantity, instructions, allergy_warning_shown, interaction_warning_shown,
              override_reason, schedule_times, with_food, check_results)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::time[], $12, $13::jsonb)`,
          [rx!.id, l.medicineId, l.dose, l.frequency, l.durationDays, l.quantity, l.instructions ?? null, allergyWarn, interWarn, overrideReason, timesFor(l.frequency), l.withFood ?? null, JSON.stringify({ allergy: c.allergy, interactions: c.interactions, stock: c.stock, simulated: true })],
        )
        // the new medicine becomes part of the patient's current medicines (doctor-recorded fact)
        await tx.query(
          `INSERT INTO records.medication_current (patient_person_id, medicine_id, dose, since, source, recorded_by_user_id, session_id)
           SELECT $1, $2, $3, current_date, 'doctor', util.ctx_user_id(), $4
            WHERE NOT EXISTS (SELECT 1 FROM records.medication_current WHERE patient_person_id = $1 AND medicine_id = $2 AND status = 'active' AND superseded_by IS NULL)`,
          [s.patientPersonId, l.medicineId, `${l.dose}, ${l.frequency}`, s.id],
        )
      }

      let sentTo: string | null = null
      let pharmacyId: string | null = null
      if (body.sendToHospitalPharmacy !== false) {
        const ph = await tx.one<{ id: string; name: string }>(`SELECT id, name FROM org.pharmacy WHERE linked_hospital_id = $1 AND status = 'active' LIMIT 1`, [hospitalId])
        if (ph) {
          // The patient agreed by opening the session with their key (assumption, recorded as patient_agreed_at).
          await tx.query(
            `INSERT INTO pharmacy.prescription_delivery (prescription_id, pharmacy_id, sent_by, patient_agreed_at) VALUES ($1, $2, 'doctor_same_hospital', now())`,
            [rx!.id, ph.id],
          )
          sentTo = ph.name
          pharmacyId = ph.id
        }
      }
      if (draftId) {
        await tx.query(`UPDATE pharmacy.prescription_draft SET promoted_prescription_id = $2 WHERE id = $1`, [draftId, rx!.id])
      }

      await tx.emit({
        type: 'prescription',
        toRoles: pharmacyId ? ['pharmacist', 'citizen'] : ['citizen'],
        title: `e-Signed prescription · ${patient.name}`,
        text: `${lines.map((l) => medName.get(l.medicineId)?.replace(/ (tablet|capsule|syrup|injection|cream|pen|infusion).*$/i, '')).join(', ')} · ${doctor?.full_name} · ${rxNumber}`,
        entityType: 'pharmacy.prescription',
        entityId: rx!.id,
        patientPersonId: s.patientPersonId,
        hospitalId,
        pharmacyId,
      })
      await tx.audit('rx.sign', { entityType: 'prescription', entityId: rx!.id, patient: s.patientPersonId, session: s.id, details: { rx: rxNumber, items: lines.length, override: !!body.overrideReason, signature: 'mock' } })

      return {
        prescriptionId: rx!.id,
        rxNumber,
        issuedAt: toIso(rx!.issued_at),
        validUntil: toIso(rx!.valid_until),
        qrToken: rx!.qr_token,
        signature: { method: sig.method, ref: sig.signatureRef, txnId: sig.txnId, simulated: true, signedAt: sig.signedAt },
        documentId: doc!.id,
        sentToPharmacy: sentTo,
        checks,
        message: sentTo ? `Sent to ${sentTo} and to the patient's medicines.` : "Sent to the patient's medicines.",
      }
    })
  }
}
