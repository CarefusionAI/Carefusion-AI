import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { BreakGlassRequest, DoctorSessionInfo } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { ruleMinutes, sweepExpiredSessions } from './access.service'
import { DoctorDbService, toIso } from './doctor-db.service'
import { loadHeader, sessionInfoById } from './session.helpers'

export const BREAK_GLASS_REASONS = [
  { code: 'unconscious', label: 'Unconscious patient' },
  { code: 'accident', label: 'Accident / life-threatening bleeding' },
  { code: 'key_unavailable', label: 'Patient cannot share the key' },
  { code: 'family_unreachable', label: 'Family / emergency contact not reachable' },
  { code: 'transfer', label: 'Emergency transfer' },
  { code: 'other', label: 'Other emergency' },
]

@Injectable()
export class EmergencyService {
  constructor(private readonly db: DoctorDbService) {}

  async info(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const windowMinutes = await ruleMinutes(tx, 'break_glass_window_minutes', 15)
      const cardMinutes = await ruleMinutes(tx, 'emergency_card_session_minutes', 60)
      const flag = await tx.one<{ enabled: boolean }>(`SELECT enabled FROM admin.platform_flag WHERE code = 'bg'`)
      const last = await tx.query<any>(
        `SELECT s.id, s.started_at, e.reason_category, e.break_glass_reason, e.hospital_review_status::text AS hospital_review, e.district_review_status::text AS district_review,
                CASE WHEN p.is_unidentified THEN p.temp_label ELSE 'Identified patient' END AS patient_label
           FROM access.access_session s JOIN access.emergency_access e ON e.session_id = s.id JOIN identity.person p ON p.id = s.patient_person_id
          WHERE s.user_id = util.ctx_user_id() AND s.mode = 'break_glass' ORDER BY s.started_at DESC LIMIT 6`,
      )
      return {
        enabled: flag?.enabled ?? true,
        windowMinutes,
        // Design conflict (open question): the citizen screen says the emergency card ends after 60 minutes, the doctor screen 15. We use 15.
        emergencyCardMinutesPerCitizenScreen: cardMinutes,
        readOnly: true,
        reasonCategories: BREAK_GLASS_REASONS,
        minReasonLength: 20,
        needsSecondDoctor: true,
        reviewChain: 'Hospital admin within 72 h, then district review and central verification',
        notified: ['Hospital admin review queue', "Patient's access history and phone alert", 'District audit (no patient identity)'],
        lastUses: last.map((l) => ({ sessionId: l.id, at: toIso(l.started_at), reasonCategory: l.reason_category, reason: l.break_glass_reason, patient: l.patient_label, hospitalReview: l.hospital_review, districtReview: l.district_review })),
      }
    })
  }

  /** Unidentified casualty patients (temporary records) the doctor can open in an emergency. */
  async unidentified(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT id, temp_label, created_at FROM identity.person WHERE is_unidentified AND deceased_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM identity.person_merge m WHERE m.from_person_id = person.id) ORDER BY created_at DESC LIMIT 20`,
      )
      return rows.map((r) => ({ personId: r.id, label: r.temp_label, registeredAt: toIso(r.created_at) }))
    })
  }

  /** Find a patient for break-glass by exact ABHA number only (no name search, to stop browsing). */
  async lookup(user: AuthenticatedUser | undefined, abha: string) {
    return this.db.run(user, async (tx) => {
      const p = await tx.one<{ id: string }>(`SELECT id FROM identity.person WHERE abha_number = $1`, [abha.trim()])
      if (!p) throw new NotFoundException('No patient with that ABHA number')
      await tx.audit('emergency.lookup', { entityType: 'person', entityId: p.id, patient: p.id })
      return { personId: p.id, patient: await loadHeader(tx, p.id) }
    })
  }

  /** Emergency card without a key: blood group, allergies, conditions, contacts only. Every read is logged. */
  async card(user: AuthenticatedUser | undefined, personId: string) {
    return this.db.run(user, async (tx) => {
      if (personId === tx.actor.personId) throw new ForbiddenException('A doctor account cannot open its own citizen record')
      const c = await tx.one<any>(`SELECT * FROM access.v_emergency_basic WHERE person_id = $1`, [personId])
      if (!c) throw new NotFoundException('Emergency card not found')
      await tx.audit('emergency.card_view', { entityType: 'emergency_card', patient: personId })
      return {
        personId: c.person_id,
        name: c.full_name,
        dateOfBirth: c.date_of_birth,
        sex: c.sex,
        bloodGroup: c.blood_group,
        organDonorStatus: c.organ_donor_status,
        allergies: c.allergies,
        conditions: c.conditions,
        specialCategories: c.special_categories,
        emergencyContacts: (c.emergency_contacts as any[]).map((e) => ({ name: e.name, relation: e.relation })),
        note: 'Basic emergency information only. For detailed records use the patient\'s key or break-glass.',
      }
    })
  }

  async breakGlass(user: AuthenticatedUser | undefined, body: BreakGlassRequest): Promise<DoctorSessionInfo> {
    return this.db.run(user, async (tx) => {
      const flag = await tx.one<{ enabled: boolean }>(`SELECT enabled FROM admin.platform_flag WHERE code = 'bg'`)
      if (flag && !flag.enabled) throw new ForbiddenException('Break-glass access is switched off by the platform administrator')
      if (body.patientPersonId === tx.actor.personId) throw new ForbiddenException('A doctor account cannot open its own citizen record')
      const hospitalId = await tx.hospitalId()
      await sweepExpiredSessions(tx)
      const patient = await loadHeader(tx, body.patientPersonId)

      const second = await tx.one<{ id: string; full_name: string }>(
        `SELECT u.id, p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id JOIN identity.doctor_profile dp ON dp.user_id = u.id
          WHERE u.id = $1 AND u.status = 'active' AND u.id <> util.ctx_user_id() AND dp.hospital_id = $2`,
        [body.secondDoctorUserId, hospitalId],
      )
      if (!second) throw new BadRequestException('The confirming doctor must be a different, active doctor of this hospital')

      const minutes = await ruleMinutes(tx, 'break_glass_window_minutes', 15)
      const s = await tx.one<{ id: string }>(
        `INSERT INTO access.access_session (patient_person_id, user_id, mode, expires_at, reason)
         VALUES ($1, util.ctx_user_id(), 'break_glass', now() + make_interval(mins => $2), $3) RETURNING id`,
        [body.patientPersonId, minutes, body.reason],
      )
      const sessionId = s!.id
      const hasContact = await tx.one(`SELECT 1 FROM identity.emergency_contact WHERE citizen_person_id = $1 AND removed_at IS NULL LIMIT 1`, [body.patientPersonId])
      await tx.query(
        `INSERT INTO access.emergency_access
           (session_id, break_glass_reason, reason_category, second_doctor_user_id, second_doctor_at, match_method, evidence_note, patient_notified_at, contact_notified_at)
         VALUES ($1, $2, $3, $4, now(), $5, $6, CASE WHEN $7 THEN now() END, CASE WHEN $8 THEN now() END)`,
        [sessionId, body.reason, body.reasonCategory, second.id, body.matchMethod ?? null, body.evidenceNote ?? null, !patient.isUnidentified, !!hasContact],
      )
      const me = await tx.one<{ full_name: string }>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = util.ctx_user_id()`)
      const label = BREAK_GLASS_REASONS.find((r) => r.code === body.reasonCategory)?.label ?? body.reasonCategory
      await tx.emit({
        type: 'break-glass',
        toRoles: ['hospitaladmin', 'citizen'],
        title: 'Emergency access used',
        text: `${me?.full_name} · ${label} · confirmed by ${second.full_name} · ${minutes} min`,
        entityType: 'access.access_session',
        entityId: sessionId,
        patientPersonId: body.patientPersonId,
        hospitalId,
      })
      await tx.audit('breakglass.open', {
        entityType: 'access_session',
        entityId: sessionId,
        patient: body.patientPersonId,
        session: sessionId,
        details: { category: body.reasonCategory, secondDoctor: second.id, windowMinutes: minutes, how: 'Emergency access', saw: 'Emergency card' },
      })
      return sessionInfoById(tx, sessionId)
    })
  }
}
