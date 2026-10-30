import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../../database/database.service'
import { StaffActor, StaffContextService } from '../common/staff-context.service'
import { AiDraft, HandoverService } from '../common/handover.service'
import type {
  AckRequest,
  HandoverCreateRequest,
  MarAdministerRequest,
  NurseBedRow,
  NurseBoardResponse,
  NurseTaskCreateRequest,
  NurseVitalsRequest,
  NurseVitalsResponse,
  NursingNoteRequest,
  StaffRejectRequest,
  WardStockCountRequest,
  WardStockRequestInput,
} from '../common/shared'
import { ageYears, decodeDemoBytes, forbidden, iso, notFound, num, dateStr } from '../common/staff.util'
import { demoNowMs } from '../common/demo-clock'

const NURSE_ORDER_TYPES = ['nursing', 'medication', 'vitals']

export interface MarDose {
  medOrderId: string
  admissionId: string
  patientPersonId: string
  patientName: string
  bedNo: string | null
  medicine: string
  dose: string
  route: string
  frequency: string
  instructions: string | null
  dueAt: string | null
  isPrn: boolean
  status: 'due' | 'overdue' | 'given' | 'withheld' | 'refused' | 'missed' | 'prn'
  givenAt: string | null
  reason: string | null
}

/** Ward work for the nurse app: bed board, vitals + NEWS2, tasks, MAR, notes, orders, handover, ward stock, alerts. */
@Injectable()
export class NurseService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ctx: StaffContextService,
    private readonly handovers: HandoverService,
  ) {}

  // ---------------------------------------------------------------- helpers
  private requireHospital(actor: StaffActor): string {
    if (!actor.hospitalId) forbidden('Your staff profile has no hospital')
    return actor.hospitalId!
  }

  private async wardsOf(hospitalId: string) {
    return this.db.query<{ id: string; code: string; name: string }>(
      'SELECT id, code, name FROM org.ward WHERE hospital_id = $1 AND is_active ORDER BY code',
      [hospitalId],
    )
  }

  /** Ward to work on: ?wardId= (must be in the hospital) > the nurse's own ward > null (whole hospital). */
  private async chooseWard(actor: StaffActor, wardId?: string) {
    const hospitalId = this.requireHospital(actor)
    const wards = await this.wardsOf(hospitalId)
    const id = wardId ?? actor.wardId
    const ward = id ? wards.find((w) => w.id === id) ?? null : null
    if (wardId && !ward) notFound('Ward')
    return { wards, ward }
  }

  private async admissionInHospital(admissionId: string, hospitalId: string) {
    const r = await this.db.query<any>(
      `SELECT a.id, a.patient_person_id, a.bed_id, a.discharged_at, b.bed_no, b.ward_id, p.full_name
         FROM access.admission a
         JOIN identity.person p ON p.id = a.patient_person_id
         LEFT JOIN org.bed b ON b.id = a.bed_id
        WHERE a.id = $1 AND a.hospital_id = $2`,
      [admissionId, hospitalId],
    )
    if (!r[0]) notFound('Admission')
    return r[0]
  }

  // ---------------------------------------------------------------- board
  async board(actor: StaffActor, wardId?: string): Promise<NurseBoardResponse> {
    const hospitalId = this.requireHospital(actor)
    const { wards, ward } = await this.chooseWard(actor, wardId)
    const rows = await this.db.query<any>(
      `SELECT vb.*,
              (EXISTS (SELECT 1 FROM access.admission_team t
                        WHERE t.admission_id = vb.admission_id AND t.user_id = $2 AND t.team_role = 'nurse' AND t.removed_at IS NULL)
               OR EXISTS (SELECT 1 FROM inpatient.nursing_task nt
                           WHERE nt.admission_id = vb.admission_id AND nt.assigned_to_user_id = $2 AND nt.done_at IS NULL)) AS mine
         FROM inpatient.v_bed_board vb
        WHERE vb.hospital_id = $1 AND ($3::uuid IS NULL OR vb.ward_id = $3)
        ORDER BY vb.ward, length(vb.bed_no), vb.bed_no`,
      [hospitalId, actor.userId, ward?.id ?? null],
    )
    const beds: NurseBedRow[] = rows.map((r) => ({
      bedId: r.bed_id,
      bedNo: r.bed_no,
      bedType: r.bed_type,
      bedStatus: r.bed_status,
      wardId: r.ward_id,
      ward: r.ward,
      admissionId: r.admission_id,
      patientPersonId: r.patient_person_id,
      patientName: r.patient_name,
      ipNumber: r.ip_number,
      diagnosis: r.diagnosis_text,
      latestNews: num(r.latest_news),
      latestNewsAt: iso(r.latest_news_at),
      acuity: r.acuity,
      mine: !!r.mine,
    }))

    const wardFilter = ward?.id ?? null
    const [counts] = await this.db.query<any>(
      `SELECT
         (SELECT count(*) FROM inpatient.nursing_task nt JOIN access.admission a ON a.id = nt.admission_id
            LEFT JOIN org.bed b ON b.id = a.bed_id
           WHERE nt.done_at IS NULL AND a.hospital_id = $1 AND ($2::uuid IS NULL OR b.ward_id = $2)) AS open_tasks,
         (SELECT count(*) FROM inpatient.escalation e JOIN access.admission a ON a.id = e.admission_id
            LEFT JOIN org.bed b ON b.id = a.bed_id
           WHERE e.acknowledged_at IS NULL AND a.hospital_id = $1 AND ($2::uuid IS NULL OR b.ward_id = $2)) AS open_esc,
         (SELECT count(*) FROM records.clinical_order o LEFT JOIN org.bed b ON b.id = o.bed_id
            LEFT JOIN access.admission a ON a.id = o.admission_id LEFT JOIN org.bed b2 ON b2.id = a.bed_id
           WHERE o.hospital_id = $1 AND o.status::text = 'open' AND o.order_type::text = ANY($3::text[])
             AND ($2::uuid IS NULL OR b.ward_id = $2 OR b2.ward_id = $2)) AS pending_orders`,
      [hospitalId, wardFilter, NURSE_ORDER_TYPES],
    )
    const mar = await this.marDoses(hospitalId, wardFilter, undefined)
    const now = demoNowMs()
    const dosesNextHour = mar.filter((d) => d.dueAt && (d.status === 'due' || d.status === 'overdue') && new Date(d.dueAt).getTime() <= now + 3600_000).length
    const occupied = beds.filter((b) => b.admissionId).length
    return {
      ward: ward,
      wards,
      kpis: {
        bedsTotal: beds.filter((b) => b.bedStatus !== 'out_of_service').length,
        bedsOccupied: occupied,
        myPatients: beds.filter((b) => b.mine).length,
        earlyWarning: beds.filter((b) => (b.latestNews ?? 0) >= 5).length,
        dosesDueNextHour: dosesNextHour,
        overdueDoses: mar.filter((d) => d.status === 'overdue').length,
        openTasks: num(counts?.open_tasks) ?? 0,
        openEscalations: num(counts?.open_esc) ?? 0,
        pendingOrders: num(counts?.pending_orders) ?? 0,
      },
      beds,
    }
  }

  // ---------------------------------------------------------------- bed detail
  async bedDetail(actor: StaffActor, bedId: string) {
    const hospitalId = this.requireHospital(actor)
    const beds = await this.db.query<any>(
      `SELECT b.id, b.bed_no, b.bed_type, b.status, w.id AS ward_id, w.name AS ward_name
         FROM org.bed b JOIN org.ward w ON w.id = b.ward_id WHERE b.id = $1 AND b.hospital_id = $2`,
      [bedId, hospitalId],
    )
    const bed = beds[0]
    if (!bed) notFound('Bed')
    const adm = await this.db.query<any>(
      `SELECT a.id, a.patient_person_id, a.ip_number, a.admitted_at, a.diet, a.mobility, a.diagnosis_text, a.expected_discharge,
              p.full_name, p.date_of_birth, p.sex::text AS sex, cp.blood_group::text AS blood_group
         FROM access.admission a
         JOIN identity.person p ON p.id = a.patient_person_id
         LEFT JOIN identity.citizen_profile cp ON cp.person_id = a.patient_person_id
        WHERE a.bed_id = $1 AND a.discharged_at IS NULL`,
      [bedId],
    )
    const a = adm[0]
    const base = { bed: { id: bed.id, bedNo: bed.bed_no, bedType: bed.bed_type, status: bed.status, wardId: bed.ward_id, ward: bed.ward_name } }
    if (!a) return { ...base, admission: null }

    const [allergies, vitals, tasks, meds, escalations, team, notes, orders] = await Promise.all([
      this.db.query<any>(
        `SELECT substance, reaction, severity FROM records.allergy
          WHERE patient_person_id = $1 AND status = 'active' AND superseded_by IS NULL ORDER BY recorded_at DESC`,
        [a.patient_person_id],
      ),
      this.vitalHistory(a.id, 10),
      this.db.query<any>(
        `SELECT id, kind, title, due_at, done_at, note, assigned_to_user_id FROM inpatient.nursing_task
          WHERE admission_id = $1 ORDER BY done_at NULLS FIRST, due_at LIMIT 30`,
        [a.id],
      ),
      this.db.query<any>(
        `SELECT mo.id, m.generic_name, m.strength, mo.dose, mo.route, mo.frequency, mo.is_prn, mo.instructions, mo.start_at, mo.stop_at, mo.status
           FROM inpatient.med_order mo JOIN pharmacy.medicine m ON m.id = mo.medicine_id
          WHERE mo.admission_id = $1 AND mo.status = 'active' ORDER BY mo.start_at`,
        [a.id],
      ),
      this.db.query<any>(
        `SELECT id, level, news_score, paged_role, paged_at, acknowledged_at, outcome FROM inpatient.escalation
          WHERE admission_id = $1 ORDER BY paged_at DESC LIMIT 10`,
        [a.id],
      ),
      this.db.query<any>(
        `SELECT t.team_role, p.full_name FROM access.admission_team t
           JOIN identity.app_user u ON u.id = t.user_id JOIN identity.person p ON p.id = u.person_id
          WHERE t.admission_id = $1 AND t.removed_at IS NULL`,
        [a.id],
      ),
      this.notes(a.id, 10),
      this.db.query<any>(
        `SELECT o.id, o.order_ref, o.order_type::text AS order_type, o.details, o.priority::text AS priority, o.status::text AS status, o.created_at
           FROM records.clinical_order o WHERE o.admission_id = $1 AND o.status::text IN ('open','accepted','in_progress')
          ORDER BY o.created_at DESC LIMIT 20`,
        [a.id],
      ),
    ])
    return {
      ...base,
      admission: {
        id: a.id,
        ipNumber: a.ip_number,
        admittedAt: iso(a.admitted_at),
        diet: a.diet,
        mobility: a.mobility,
        diagnosis: a.diagnosis_text,
        expectedDischarge: dateStr(a.expected_discharge),
      },
      patient: {
        personId: a.patient_person_id,
        fullName: a.full_name,
        age: ageYears(a.date_of_birth),
        sex: a.sex,
        bloodGroup: a.blood_group ?? null,
        allergies: allergies.map((x) => ({ substance: x.substance, reaction: x.reaction, severity: x.severity })),
      },
      team: team.map((t) => ({ role: t.team_role, name: t.full_name })),
      vitals,
      tasks: tasks.map((t) => ({ id: t.id, kind: t.kind, title: t.title, dueAt: iso(t.due_at), doneAt: iso(t.done_at), note: t.note, mine: t.assigned_to_user_id === actor.userId })),
      medOrders: meds.map((m) => ({
        id: m.id,
        medicine: `${m.generic_name} ${m.strength}`,
        dose: m.dose,
        route: m.route,
        frequency: m.frequency,
        isPrn: m.is_prn,
        instructions: m.instructions,
        startAt: iso(m.start_at),
        stopAt: iso(m.stop_at),
      })),
      escalations: escalations.map((e) => ({ id: e.id, level: e.level, newsScore: e.news_score, pagedRole: e.paged_role, pagedAt: iso(e.paged_at), acknowledgedAt: iso(e.acknowledged_at), outcome: e.outcome })),
      notes,
      orders: orders.map((o) => ({ id: o.id, orderRef: o.order_ref, type: o.order_type, details: o.details, priority: o.priority, status: o.status, createdAt: iso(o.created_at) })),
    }
  }

  // ---------------------------------------------------------------- vitals
  async vitalHistory(admissionId: string, limit = 20) {
    const rows = await this.db.query<any>(
      `SELECT v.id, v.observed_at, v.resp_rate, v.spo2, v.on_oxygen, v.systolic, v.diastolic, v.pulse, v.temp_c::float AS temp_c, v.avpu,
              v.news_score, v.news_band, v.news_parts, v.note, p.full_name AS recorded_by
         FROM inpatient.vital_set v
         JOIN identity.app_user u ON u.id = v.recorded_by_user_id JOIN identity.person p ON p.id = u.person_id
        WHERE v.admission_id = $1 AND NOT v.entered_in_error
        ORDER BY v.observed_at DESC LIMIT $2`,
      [admissionId, limit],
    )
    return rows.map((v) => ({
      id: v.id,
      observedAt: iso(v.observed_at),
      respRate: v.resp_rate,
      spo2: v.spo2,
      onOxygen: v.on_oxygen,
      systolic: v.systolic,
      diastolic: v.diastolic,
      pulse: v.pulse,
      tempC: v.temp_c,
      avpu: v.avpu,
      newsScore: v.news_score,
      newsBand: v.news_band,
      note: v.note,
      recordedBy: v.recorded_by,
    }))
  }

  async vitalsHistory(actor: StaffActor, admissionId: string) {
    await this.admissionInHospital(admissionId, this.requireHospital(actor))
    return this.vitalHistory(admissionId, 50)
  }

  private guidance(score: number, band: string): string {
    if (band === 'high') return 'NEWS 7 or more: call the rapid response team now and stay with the patient.'
    if (band === 'medium') return 'NEWS 5-6: urgent review. The treating doctor has been alerted automatically.'
    if (band === 'low_medium') return 'One parameter scores 3: ask the doctor for an urgent ward-based review.'
    if (score >= 3) return 'NEWS 3-4: hourly observations and tell the charge nurse.'
    return 'NEWS 0-2: routine observations every 4-6 hours.'
  }

  async recordVitals(actor: StaffActor, admissionId: string, dto: NurseVitalsRequest): Promise<NurseVitalsResponse> {
    const hospitalId = this.requireHospital(actor)
    const adm = await this.admissionInHospital(admissionId, hospitalId)
    if (adm.discharged_at) throw new ConflictException({ success: false, errorMessage: 'This patient has been discharged' })
    const noteParts = [dto.note, dto.glucoseMgDl !== undefined ? `Glucose ${dto.glucoseMgDl} mg/dL` : null, dto.painScore !== undefined ? `Pain ${dto.painScore}/10` : null].filter(Boolean)

    return this.ctx.tx(actor, async (c) => {
      const ins = await c.query(
        `INSERT INTO inpatient.vital_set
           (admission_id, patient_person_id, observed_at, recorded_by_user_id, resp_rate, spo2, on_oxygen, systolic, diastolic, pulse, temp_c, avpu, note, recorded_offline)
         VALUES ($1,$2,COALESCE($3::timestamptz, util.demo_now()),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, observed_at, news_parts, news_score, news_band`,
        [admissionId, adm.patient_person_id, dto.observedAt ?? null, actor.userId, dto.respRate, dto.spo2, dto.onOxygen, dto.systolic, dto.diastolic ?? null, dto.pulse, dto.tempC, dto.avpu, noteParts.length ? noteParts.join(' · ') : null, dto.recordedOffline],
      )
      const v = ins.rows[0]
      const parts: number[] = v.news_parts
      const score = Number(v.news_score)
      const band: string = v.news_band
      const escRow = (await c.query('SELECT id, level, paged_role FROM inpatient.escalation WHERE vital_set_id = $1', [v.id])).rows[0]
      let step: { step: number; notifyRole: string; withinMinutes: number } | null = null
      if (escRow) {
        const st = (
          await c.query(
            `SELECT step, notify_role, within_minutes FROM org.escalation_chain WHERE hospital_id = $1 AND news_min <= $2 ORDER BY step DESC LIMIT 1`,
            [hospitalId, score],
          )
        ).rows[0]
        if (st) step = { step: st.step, notifyRole: st.notify_role, withinMinutes: st.within_minutes }
        const bedNo = adm.bed_no ?? '?'
        const eventId = await this.ctx.emitEvent(c, actor, {
          type: 'vitals-critical',
          toRoles: ['doctor'],
          title: `Early-warning score ${score} · Bed ${bedNo}`,
          text: `${adm.full_name} · SpO2 ${dto.spo2}% · RR ${dto.respRate} · escalated by ${actor.fullName} (simulated demo patient)`,
          href: '/doctor/alerts',
          entityType: 'inpatient.escalation',
          entityId: escRow.id,
          patientPersonId: adm.patient_person_id,
          hospitalId,
        })
        const doc = (await c.query(`SELECT user_id FROM access.admission_team WHERE admission_id = $1 AND team_role = 'doctor' AND removed_at IS NULL ORDER BY added_at LIMIT 1`, [admissionId])).rows[0]
        await c.query(
          `INSERT INTO records.clinical_alert (kind, severity, patient_person_id, hospital_id, target_user_id, title, detail, source_table, source_id, event_id)
           VALUES ('vitals_critical', $1, $2, $3, $4, $5, $6, 'inpatient.vital_set', $7, $8)`,
          [band === 'high' ? 'critical' : 'warning', adm.patient_person_id, hospitalId, doc?.user_id ?? null, `Early-warning score ${score} · Bed ${bedNo}`, `Recorded by ${actor.fullName}`, v.id, eventId],
        )
      }
      await this.ctx.audit(c, 'inpatient.vitals.record', { entityType: 'inpatient.vital_set', entityId: v.id, patientPersonId: adm.patient_person_id, details: { newsScore: score, band } })
      return {
        vitalSetId: v.id,
        observedAt: iso(v.observed_at)!,
        newsScore: score,
        newsParts: {
          respRate: parts[0] ?? 0,
          spo2: parts[1] ?? 0,
          oxygen: parts[2] ?? 0,
          systolic: parts[3] ?? 0,
          pulse: parts[4] ?? 0,
          consciousness: parts[5] ?? 0,
          temperature: parts[6] ?? 0,
        },
        band: band as NurseVitalsResponse['band'],
        guidance: this.guidance(score, band),
        escalation: escRow ? { id: escRow.id, level: escRow.level, pagedRole: escRow.paged_role, step } : null,
      }
    })
  }

  // ---------------------------------------------------------------- tasks
  async tasks(actor: StaffActor, opts: { scope?: string; status?: string; wardId?: string }) {
    const hospitalId = this.requireHospital(actor)
    const { ward } = await this.chooseWard(actor, opts.wardId)
    const scope = opts.scope === 'ward' ? 'ward' : 'mine'
    const status = opts.status === 'done' || opts.status === 'all' ? opts.status : 'open'
    const rows = await this.db.query<any>(
      `SELECT nt.id, nt.admission_id, nt.kind, nt.title, nt.due_at, nt.done_at, nt.note, nt.assigned_to_user_id,
              b.bed_no, p.full_name AS patient_name, ap.full_name AS assigned_name
         FROM inpatient.nursing_task nt
         JOIN access.admission a ON a.id = nt.admission_id
         JOIN identity.person p ON p.id = nt.patient_person_id
         LEFT JOIN org.bed b ON b.id = a.bed_id
         LEFT JOIN identity.app_user au ON au.id = nt.assigned_to_user_id LEFT JOIN identity.person ap ON ap.id = au.person_id
        WHERE a.hospital_id = $1
          AND ($2::uuid IS NULL OR b.ward_id = $2)
          AND ($3 = 'ward' OR nt.assigned_to_user_id = $4)
          AND ($5 = 'all' OR ($5 = 'open' AND nt.done_at IS NULL) OR ($5 = 'done' AND nt.done_at IS NOT NULL))
        ORDER BY nt.done_at NULLS FIRST, nt.due_at
        LIMIT 200`,
      [hospitalId, ward?.id ?? null, scope, actor.userId, status],
    )
    const now = demoNowMs()
    return rows.map((t) => ({
      id: t.id,
      admissionId: t.admission_id,
      bedNo: t.bed_no,
      patientName: t.patient_name,
      kind: t.kind,
      title: t.title,
      dueAt: iso(t.due_at),
      doneAt: iso(t.done_at),
      late: !t.done_at && new Date(t.due_at).getTime() < now,
      note: t.note,
      assignedTo: t.assigned_to_user_id ? { userId: t.assigned_to_user_id, name: t.assigned_name } : null,
    }))
  }

  async createTask(actor: StaffActor, dto: NurseTaskCreateRequest) {
    const hospitalId = this.requireHospital(actor)
    const adm = await this.admissionInHospital(dto.admissionId, hospitalId)
    if (adm.discharged_at) throw new ConflictException({ success: false, errorMessage: 'This patient has been discharged' })
    const assignee = dto.assignedToUserId ?? actor.userId
    if (assignee !== actor.userId) {
      const ok = await this.db.query(
        `SELECT 1 FROM identity.staff_profile sp JOIN identity.app_user au ON au.id = sp.user_id AND au.status = 'active'
          WHERE sp.user_id = $1 AND sp.hospital_id = $2 AND sp.staff_role = 'nurse'`,
        [assignee, hospitalId],
      )
      if (ok.length === 0) throw new BadRequestException({ success: false, errorMessage: 'Tasks can only be given to a nurse in your hospital' })
    }
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO inpatient.nursing_task (admission_id, patient_person_id, assigned_to_user_id, kind, title, due_at, note, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [dto.admissionId, adm.patient_person_id, assignee, dto.kind, dto.title, dto.dueAt, dto.note ?? null, actor.userId],
      )
      await this.ctx.audit(c, 'inpatient.task.create', { entityType: 'inpatient.nursing_task', entityId: r.rows[0].id, patientPersonId: adm.patient_person_id })
      return { id: r.rows[0].id as string }
    })
  }

  async completeTask(actor: StaffActor, taskId: string, note?: string) {
    const hospitalId = this.requireHospital(actor)
    const rows = await this.db.query<any>(
      `SELECT nt.id, nt.done_at, nt.patient_person_id FROM inpatient.nursing_task nt JOIN access.admission a ON a.id = nt.admission_id
        WHERE nt.id = $1 AND a.hospital_id = $2`,
      [taskId, hospitalId],
    )
    if (!rows[0]) notFound('Task')
    if (rows[0].done_at) throw new ConflictException({ success: false, errorMessage: 'Task is already done' })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE inpatient.nursing_task SET done_at = util.demo_now(), done_by_user_id = $2, note = COALESCE($3, note) WHERE id = $1`, [taskId, actor.userId, note ?? null])
      await this.ctx.audit(c, 'inpatient.task.done', { entityType: 'inpatient.nursing_task', entityId: taskId, patientPersonId: rows[0].patient_person_id })
    })
    return { id: taskId, done: true }
  }

  // ---------------------------------------------------------------- MAR
  /** Doses for one India-time day for the open admissions of a ward (or the whole hospital). */
  private async marDoses(hospitalId: string, wardId: string | null, date: string | undefined, admissionId?: string): Promise<MarDose[]> {
    const rows = await this.db.query<any>(
      `WITH day AS (
         SELECT COALESCE($3::date, (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date) AS d
       ), adm AS (
         SELECT a.id AS admission_id, a.patient_person_id, b.bed_no, p.full_name
           FROM access.admission a
           JOIN identity.person p ON p.id = a.patient_person_id
           LEFT JOIN org.bed b ON b.id = a.bed_id
          WHERE a.hospital_id = $1 AND a.discharged_at IS NULL
            AND ($2::uuid IS NULL OR b.ward_id = $2)
            AND ($4::uuid IS NULL OR a.id = $4)
       ), o AS (
         SELECT mo.*, adm.patient_person_id AS pp, adm.bed_no, adm.full_name, m.generic_name, m.strength
           FROM inpatient.med_order mo
           JOIN adm ON adm.admission_id = mo.admission_id
           JOIN pharmacy.medicine m ON m.id = mo.medicine_id
          WHERE mo.status = 'active'
       ), slots AS (
         SELECT o.id AS med_order_id, ((day.d + t) AT TIME ZONE 'Asia/Kolkata') AS due_at
           FROM o CROSS JOIN day CROSS JOIN LATERAL unnest(o.schedule_times) t
          WHERE NOT o.is_prn
         UNION
         SELECT o.id, o.start_at FROM o CROSS JOIN day
          WHERE NOT o.is_prn AND cardinality(o.schedule_times) = 0
            AND (o.start_at AT TIME ZONE 'Asia/Kolkata')::date = day.d
       )
       SELECT o.id AS med_order_id, o.admission_id, o.pp AS patient_person_id, o.full_name, o.bed_no, o.generic_name, o.strength,
              o.dose, o.route, o.frequency, o.instructions, o.is_prn, s.due_at,
              ma.outcome, ma.given_at, ma.reason
         FROM o
         LEFT JOIN slots s ON s.med_order_id = o.id
         LEFT JOIN inpatient.med_administration ma ON ma.med_order_id = o.id AND ma.due_at = s.due_at
        WHERE (s.due_at IS NOT NULL AND s.due_at >= o.start_at - interval '1 minute' AND (o.stop_at IS NULL OR s.due_at <= o.stop_at))
           OR o.is_prn
        ORDER BY s.due_at NULLS LAST, o.bed_no`,
      [hospitalId, wardId, date ?? null, admissionId ?? null],
    )
    const now = demoNowMs()
    return rows.map((r) => {
      let status: MarDose['status']
      if (r.is_prn) status = 'prn'
      else if (r.outcome) status = r.outcome
      else status = new Date(r.due_at).getTime() < now - 30 * 60_000 ? 'overdue' : 'due'
      return {
        medOrderId: r.med_order_id,
        admissionId: r.admission_id,
        patientPersonId: r.patient_person_id,
        patientName: r.full_name,
        bedNo: r.bed_no,
        medicine: `${r.generic_name} ${r.strength}`,
        dose: r.dose,
        route: r.route,
        frequency: r.frequency,
        instructions: r.instructions,
        dueAt: iso(r.due_at),
        isPrn: r.is_prn,
        status,
        givenAt: iso(r.given_at),
        reason: r.reason,
      }
    })
  }

  async mar(actor: StaffActor, opts: { date?: string; wardId?: string; admissionId?: string }) {
    const hospitalId = this.requireHospital(actor)
    const { ward } = await this.chooseWard(actor, opts.wardId)
    const doses = await this.marDoses(hospitalId, ward?.id ?? null, opts.date, opts.admissionId)
    const timed = doses.filter((d) => !d.isPrn)
    return {
      date: opts.date ?? new Date(demoNowMs()).toISOString().slice(0, 10),
      summary: {
        total: timed.length,
        given: timed.filter((d) => d.status === 'given').length,
        due: timed.filter((d) => d.status === 'due').length,
        overdue: timed.filter((d) => d.status === 'overdue').length,
        notGiven: timed.filter((d) => ['withheld', 'refused', 'missed'].includes(d.status)).length,
      },
      doses,
    }
  }

  async administer(actor: StaffActor, dto: MarAdministerRequest) {
    const hospitalId = this.requireHospital(actor)
    const orders = await this.db.query<any>(
      `SELECT mo.id, mo.admission_id, mo.patient_person_id, mo.dose, mo.status, mo.is_prn, mo.start_at, mo.stop_at, a.hospital_id, a.discharged_at, m.generic_name, m.strength
         FROM inpatient.med_order mo JOIN access.admission a ON a.id = mo.admission_id JOIN pharmacy.medicine m ON m.id = mo.medicine_id
        WHERE mo.id = $1`,
      [dto.medOrderId],
    )
    const mo = orders[0]
    if (!mo || mo.hospital_id !== hospitalId) notFound('Medication order')
    if (mo.status !== 'active' || mo.discharged_at) throw new ConflictException({ success: false, errorMessage: 'This medication order is no longer active' })
    if (!mo.is_prn) {
      // The dose slot must be one of the order's real slots (so the record lines up with the MAR).
      const dueDate = new Date(dto.dueAt)
      const ist = new Date(dueDate.getTime() + 5.5 * 3600_000)
      const dayStr = ist.toISOString().slice(0, 10)
      const slots = await this.marDoses(hospitalId, null, dayStr, mo.admission_id)
      const ok = slots.some((s) => s.medOrderId === dto.medOrderId && s.dueAt && new Date(s.dueAt).getTime() === dueDate.getTime())
      if (!ok) throw new BadRequestException({ success: false, errorMessage: 'That time is not a scheduled dose for this order' })
    }
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO inpatient.med_administration
           (med_order_id, admission_id, patient_person_id, due_at, given_at, outcome, reason, dose_given, nurse_user_id, band_scanned, drug_scanned)
         VALUES ($1,$2,$3,$4, CASE WHEN $5 = 'given' THEN util.demo_now() END, $5, $6, $7, $8, $9, $10) RETURNING id, given_at`,
        [dto.medOrderId, mo.admission_id, mo.patient_person_id, dto.dueAt, dto.outcome, dto.reason ?? null, dto.outcome === 'given' ? dto.doseGiven ?? mo.dose : null, actor.userId, dto.bandScanned, dto.drugScanned],
      )
      await this.ctx.audit(c, 'inpatient.mar.administer', {
        entityType: 'inpatient.med_administration',
        entityId: r.rows[0].id,
        patientPersonId: mo.patient_person_id,
        details: { outcome: dto.outcome, medicine: `${mo.generic_name} ${mo.strength}` },
      })
      return { id: r.rows[0].id as string, outcome: dto.outcome, givenAt: iso(r.rows[0].given_at) }
    }).catch((e) => {
      if (e?.response?.errorMessage === 'Already exists') {
        throw new ConflictException({ success: false, errorMessage: 'This dose has already been recorded' })
      }
      throw e
    })
  }

  // ---------------------------------------------------------------- notes
  async notes(admissionId: string, limit = 50) {
    const rows = await this.db.query<any>(
      `SELECT n.id, n.kind, n.body_enc, n.created_at, p.full_name AS author
         FROM inpatient.nursing_note n JOIN identity.app_user u ON u.id = n.author_user_id JOIN identity.person p ON p.id = u.person_id
        WHERE n.admission_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
      [admissionId, limit],
    )
    return rows.map((n) => {
      const text = decodeDemoBytes(n.body_enc)
      let sbar: Record<string, string> | null = null
      let body: string | null = text
      if (n.kind === 'sbar') {
        try {
          sbar = JSON.parse(text)
          body = null
        } catch {
          /* keep raw text */
        }
      }
      return { id: n.id, kind: n.kind, body, sbar, author: n.author, createdAt: iso(n.created_at) }
    })
  }

  async listNotes(actor: StaffActor, admissionId: string) {
    await this.admissionInHospital(admissionId, this.requireHospital(actor))
    return this.notes(admissionId, 100)
  }

  async addNote(actor: StaffActor, admissionId: string, dto: NursingNoteRequest) {
    const adm = await this.admissionInHospital(admissionId, this.requireHospital(actor))
    const text = dto.kind === 'sbar' ? JSON.stringify(dto.sbar) : dto.body!
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO inpatient.nursing_note (admission_id, patient_person_id, author_user_id, kind, body_enc, enc_key_id)
         VALUES ($1,$2,$3,$4,$5,'demo-none') RETURNING id, created_at`,
        [admissionId, adm.patient_person_id, actor.userId, dto.kind, Buffer.from(text, 'utf8')],
      )
      await this.ctx.audit(c, 'inpatient.note.add', { entityType: 'inpatient.nursing_note', entityId: r.rows[0].id, patientPersonId: adm.patient_person_id })
      return { id: r.rows[0].id as string, createdAt: iso(r.rows[0].created_at) }
    })
  }

  // ---------------------------------------------------------------- orders
  async orders(actor: StaffActor, opts: { status?: string; wardId?: string }) {
    const hospitalId = this.requireHospital(actor)
    const { ward } = await this.chooseWard(actor, opts.wardId)
    const status = opts.status && ['open', 'accepted', 'in_progress', 'done', 'rejected', 'all'].includes(opts.status) ? opts.status : 'active'
    const rows = await this.db.query<any>(
      `SELECT o.id, o.order_ref, o.order_type::text AS order_type, o.details, o.priority::text AS priority, o.status::text AS status,
              o.created_at, o.due_at, o.accepted_at, o.completed_at, o.rejected_reason, o.clinical_note,
              COALESCE(b.bed_no, b2.bed_no) AS bed_no, p.full_name AS patient_name, dp.full_name AS ordered_by
         FROM records.clinical_order o
         JOIN identity.person p ON p.id = o.patient_person_id
         JOIN identity.app_user du ON du.id = o.ordered_by_user_id JOIN identity.person dp ON dp.id = du.person_id
         LEFT JOIN org.bed b ON b.id = o.bed_id
         LEFT JOIN access.admission a ON a.id = o.admission_id LEFT JOIN org.bed b2 ON b2.id = a.bed_id
        WHERE o.hospital_id = $1
          AND ($2::uuid IS NULL OR b.ward_id = $2 OR b2.ward_id = $2)
          AND (b.id IS NOT NULL OR b2.id IS NOT NULL)
          AND ($3 = 'all' OR ($3 = 'active' AND o.status::text IN ('open','accepted','in_progress')) OR o.status::text = $3)
        ORDER BY CASE o.priority::text WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, o.created_at DESC
        LIMIT 200`,
      [hospitalId, ward?.id ?? null, status],
    )
    return rows.map((o) => ({
      id: o.id,
      orderRef: o.order_ref,
      type: o.order_type,
      details: o.details,
      priority: o.priority,
      status: o.status,
      bedNo: o.bed_no,
      patientName: o.patient_name,
      orderedBy: o.ordered_by,
      createdAt: iso(o.created_at),
      dueAt: iso(o.due_at),
      acceptedAt: iso(o.accepted_at),
      completedAt: iso(o.completed_at),
      rejectedReason: o.rejected_reason,
      clinicalNote: o.clinical_note,
      /** Nurses act on nursing / medication / vitals orders; lab and imaging orders are shown to follow progress. */
      actionable: NURSE_ORDER_TYPES.includes(o.order_type),
    }))
  }

  private async nurseOrder(actor: StaffActor, orderId: string) {
    const hospitalId = this.requireHospital(actor)
    const r = await this.db.query<any>(
      `SELECT o.id, o.order_ref, o.order_type::text AS order_type, o.status::text AS status, o.patient_person_id, o.ordered_by_user_id, o.details
         FROM records.clinical_order o WHERE o.id = $1 AND o.hospital_id = $2`,
      [orderId, hospitalId],
    )
    const o = r[0]
    if (!o) notFound('Order')
    if (!NURSE_ORDER_TYPES.includes(o.order_type)) forbidden('Lab and imaging orders are handled by the lab and radiology teams')
    return o
  }

  async acceptOrder(actor: StaffActor, orderId: string) {
    const o = await this.nurseOrder(actor, orderId)
    if (o.status !== 'open') throw new ConflictException({ success: false, errorMessage: `Order is already ${o.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_order SET status = 'accepted', accepted_by_user_id = $2, accepted_at = util.demo_now(), assigned_to_user_id = $2 WHERE id = $1`, [orderId, actor.userId])
      await this.ctx.audit(c, 'order.accept', { entityType: 'records.clinical_order', entityId: orderId, patientPersonId: o.patient_person_id })
    })
    return { id: orderId, status: 'accepted' }
  }

  async rejectOrder(actor: StaffActor, orderId: string, dto: StaffRejectRequest) {
    const o = await this.nurseOrder(actor, orderId)
    if (o.status !== 'open') throw new ConflictException({ success: false, errorMessage: `Order is already ${o.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_order SET status = 'rejected', rejected_reason = $2, accepted_by_user_id = $3, accepted_at = util.demo_now() WHERE id = $1`, [orderId, dto.reason, actor.userId])
      await this.ctx.emitEvent(c, actor, {
        type: 'message',
        toRoles: ['doctor'],
        toUserId: o.ordered_by_user_id,
        title: `Order declined · ${o.order_ref}`,
        text: `${actor.fullName}: ${dto.reason}`,
        href: '/doctor/orders',
        entityType: 'records.clinical_order',
        entityId: orderId,
        patientPersonId: o.patient_person_id,
      })
      await this.ctx.audit(c, 'order.reject', { entityType: 'records.clinical_order', entityId: orderId, patientPersonId: o.patient_person_id })
    })
    return { id: orderId, status: 'rejected' }
  }

  async completeOrder(actor: StaffActor, orderId: string) {
    const o = await this.nurseOrder(actor, orderId)
    if (!['open', 'accepted', 'in_progress'].includes(o.status)) throw new ConflictException({ success: false, errorMessage: `Order is already ${o.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `UPDATE records.clinical_order SET status = 'done', completed_by_user_id = $2, completed_at = util.demo_now(), accepted_by_user_id = COALESCE(accepted_by_user_id, $2), accepted_at = COALESCE(accepted_at, util.demo_now()) WHERE id = $1`,
        [orderId, actor.userId],
      )
      await this.ctx.audit(c, 'order.complete', { entityType: 'records.clinical_order', entityId: orderId, patientPersonId: o.patient_person_id })
    })
    return { id: orderId, status: 'done' }
  }

  // ---------------------------------------------------------------- handover
  handoverColleagues(actor: StaffActor) {
    return this.handovers.colleagues(actor)
  }
  handoverList(actor: StaffActor) {
    return this.handovers.list(actor)
  }
  handoverSign(actor: StaffActor, id: string) {
    return this.handovers.sign(actor, id)
  }
  handoverItemDone(actor: StaffActor, id: string, itemId: string) {
    return this.handovers.completeItem(actor, id, itemId)
  }

  /** SIMULATED AI draft: summarises the ward board, overdue doses and open orders. The nurse edits it before signing. */
  private async buildAiDraft(actor: StaffActor): Promise<AiDraft> {
    const hospitalId = this.requireHospital(actor)
    const board = await this.board(actor)
    const mar = await this.marDoses(hospitalId, actor.wardId, undefined)
    const orders = await this.orders(actor, {})
    const items: AiDraft['items'] = []
    for (const b of board.beds.filter((x) => (x.latestNews ?? 0) >= 5 && x.admissionId)) {
      items.push({ admissionId: b.admissionId!, bedId: b.bedId, flag: 'watch', note: `Bed ${b.bedNo}: early-warning score ${b.latestNews}. Keep close observation and confirm doctor review.` })
    }
    for (const d of mar.filter((x) => x.status === 'overdue')) {
      items.push({ admissionId: d.admissionId, flag: 'pending', note: `Bed ${d.bedNo}: ${d.medicine} was due ${d.dueAt?.slice(11, 16)} UTC and is not recorded.` })
    }
    for (const o of orders.filter((x) => x.actionable && x.status === 'open')) {
      items.push({ orderId: o.id, flag: 'pending', note: `Bed ${o.bedNo}: order ${o.orderRef} (${o.details}) is waiting to be accepted.` })
    }
    const occupied = board.kpis.bedsOccupied
    const text =
      `Simulated AI draft (needs your review): ${occupied} of ${board.kpis.bedsTotal} beds occupied. ` +
      `${board.kpis.earlyWarning} patient(s) with early-warning score 5 or more, ${board.kpis.overdueDoses} overdue dose(s), ` +
      `${board.kpis.pendingOrders} order(s) waiting. This draft is decision support only; edit it before you hand over.`
    return { text, items }
  }

  async handoverCreate(actor: StaffActor, dto: HandoverCreateRequest) {
    this.requireHospital(actor)
    const draft = dto.useAiDraft ? await this.buildAiDraft(actor) : undefined
    return this.handovers.create(actor, dto, draft)
  }

  // ---------------------------------------------------------------- ward stock
  private requireWard(actor: StaffActor): string {
    if (!actor.wardId) throw new BadRequestException({ success: false, errorMessage: 'Your profile has no ward; ward stock is kept per ward' })
    return actor.wardId
  }

  async wardStock(actor: StaffActor) {
    this.requireHospital(actor)
    const wardId = this.requireWard(actor)
    const [stock, requests] = await Promise.all([
      this.db.query<any>(
        `SELECT ws.id, ws.medicine_id, m.generic_name, m.form, m.strength, ws.quantity::float AS quantity, ws.par_level::float AS par_level, ws.updated_at
           FROM org.ward_stock ws JOIN pharmacy.medicine m ON m.id = ws.medicine_id WHERE ws.ward_id = $1 ORDER BY m.generic_name`,
        [wardId],
      ),
      this.db.query<any>(
        `SELECT r.id, r.medicine_id, m.generic_name, m.strength, r.quantity::float AS quantity, r.status, r.note, r.requested_at, r.fulfilled_at
           FROM org.ward_stock_request r JOIN pharmacy.medicine m ON m.id = r.medicine_id
          WHERE r.ward_id = $1 ORDER BY r.requested_at DESC LIMIT 30`,
        [wardId],
      ),
    ])
    return {
      wardId,
      items: stock.map((s) => ({
        id: s.id,
        medicineId: s.medicine_id,
        medicine: `${s.generic_name} ${s.strength}`,
        form: s.form,
        quantity: s.quantity,
        parLevel: s.par_level,
        level: s.quantity <= 0 ? 'out' : s.quantity < s.par_level ? 'low' : 'ok',
        updatedAt: iso(s.updated_at),
      })),
      requests: requests.map((r) => ({
        id: r.id,
        medicineId: r.medicine_id,
        medicine: `${r.generic_name} ${r.strength}`,
        quantity: r.quantity,
        status: r.status,
        note: r.note,
        requestedAt: iso(r.requested_at),
        fulfilledAt: iso(r.fulfilled_at),
      })),
    }
  }

  async countWardStock(actor: StaffActor, stockId: string, dto: WardStockCountRequest) {
    const wardId = this.requireWard(actor)
    const r = await this.db.query('SELECT 1 FROM org.ward_stock WHERE id = $1 AND ward_id = $2', [stockId, wardId])
    if (r.length === 0) notFound('Ward stock line')
    await this.ctx.tx(actor, async (c) => {
      await c.query('UPDATE org.ward_stock SET quantity = $2 WHERE id = $1', [stockId, dto.quantity])
      await this.ctx.audit(c, 'ward_stock.count', { entityType: 'org.ward_stock', entityId: stockId, details: { quantity: dto.quantity } })
    })
    return { id: stockId, quantity: dto.quantity }
  }

  async requestWardStock(actor: StaffActor, dto: WardStockRequestInput) {
    const hospitalId = this.requireHospital(actor)
    const wardId = this.requireWard(actor)
    const med = await this.db.query('SELECT 1 FROM pharmacy.medicine WHERE id = $1 AND is_active', [dto.medicineId])
    if (med.length === 0) notFound('Medicine')
    const ph = await this.db.query<{ id: string }>(`SELECT id FROM org.pharmacy WHERE linked_hospital_id = $1 AND status = 'active' LIMIT 1`, [hospitalId])
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO org.ward_stock_request (ward_id, medicine_id, quantity, requested_by_user_id, pharmacy_id, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, status`,
        [wardId, dto.medicineId, dto.quantity, actor.userId, ph[0]?.id ?? null, dto.note ?? null],
      )
      await this.ctx.audit(c, 'ward_stock.request', { entityType: 'org.ward_stock_request', entityId: r.rows[0].id })
      return { id: r.rows[0].id as string, status: r.rows[0].status as string, pharmacyId: ph[0]?.id ?? null }
    })
  }

  // ---------------------------------------------------------------- alerts
  async alerts(actor: StaffActor, wardIdParam?: string) {
    const hospitalId = this.requireHospital(actor)
    const { ward } = await this.chooseWard(actor, wardIdParam)
    const [clinical, escalations, mar] = await Promise.all([
      this.db.query<any>(
        `SELECT ca.id, ca.kind::text AS kind, ca.severity, ca.title, ca.detail, ca.raised_at, ca.acknowledged_at, ca.patient_person_id, p.full_name AS patient_name, b.bed_no
           FROM records.clinical_alert ca
           LEFT JOIN identity.person p ON p.id = ca.patient_person_id
           LEFT JOIN access.admission a ON a.patient_person_id = ca.patient_person_id AND a.discharged_at IS NULL AND a.hospital_id = $1
           LEFT JOIN org.bed b ON b.id = a.bed_id
          WHERE ca.hospital_id = $1 AND ca.resolved_at IS NULL
            AND ($2::uuid IS NULL OR b.ward_id = $2 OR ca.patient_person_id IS NULL)
          ORDER BY ca.acknowledged_at NULLS FIRST, ca.raised_at DESC LIMIT 100`,
        [hospitalId, ward?.id ?? null],
      ),
      this.db.query<any>(
        `SELECT e.id, e.level, e.news_score, e.paged_role, e.paged_at, p.full_name AS patient_name, b.bed_no
           FROM inpatient.escalation e JOIN access.admission a ON a.id = e.admission_id
           JOIN identity.person p ON p.id = e.patient_person_id LEFT JOIN org.bed b ON b.id = a.bed_id
          WHERE e.acknowledged_at IS NULL AND a.hospital_id = $1 AND ($2::uuid IS NULL OR b.ward_id = $2)
          ORDER BY e.paged_at DESC LIMIT 50`,
        [hospitalId, ward?.id ?? null],
      ),
      this.marDoses(hospitalId, ward?.id ?? null, undefined),
    ])
    return {
      clinicalAlerts: clinical.map((a) => ({
        id: a.id,
        kind: a.kind,
        severity: a.severity,
        title: a.title,
        detail: a.detail,
        patientName: a.patient_name,
        bedNo: a.bed_no,
        raisedAt: iso(a.raised_at),
        acknowledgedAt: iso(a.acknowledged_at),
      })),
      escalations: escalations.map((e) => ({ id: e.id, level: e.level, newsScore: e.news_score, pagedRole: e.paged_role, pagedAt: iso(e.paged_at), patientName: e.patient_name, bedNo: e.bed_no })),
      overdueDoses: mar.filter((d) => d.status === 'overdue'),
    }
  }

  async ackAlert(actor: StaffActor, alertId: string) {
    const hospitalId = this.requireHospital(actor)
    const r = await this.db.query('SELECT 1 FROM records.clinical_alert WHERE id = $1 AND hospital_id = $2', [alertId, hospitalId])
    if (r.length === 0) notFound('Alert')
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_alert SET acknowledged_by_user_id = $2, acknowledged_at = COALESCE(acknowledged_at, util.demo_now()) WHERE id = $1`, [alertId, actor.userId])
    })
    return { id: alertId, acknowledged: true }
  }

  async ackEscalation(actor: StaffActor, escalationId: string, dto: AckRequest) {
    const hospitalId = this.requireHospital(actor)
    const r = await this.db.query<any>(
      `SELECT e.id, e.acknowledged_at, e.patient_person_id FROM inpatient.escalation e JOIN access.admission a ON a.id = e.admission_id
        WHERE e.id = $1 AND a.hospital_id = $2`,
      [escalationId, hospitalId],
    )
    if (!r[0]) notFound('Escalation')
    if (r[0].acknowledged_at) throw new ConflictException({ success: false, errorMessage: 'Already acknowledged' })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE inpatient.escalation SET acknowledged_by_user_id = $2, acknowledged_at = util.demo_now(), outcome = $3 WHERE id = $1`, [escalationId, actor.userId, dto.outcome ?? null])
      await this.ctx.audit(c, 'inpatient.escalation.ack', { entityType: 'inpatient.escalation', entityId: escalationId, patientPersonId: r[0].patient_person_id })
    })
    return { id: escalationId, acknowledged: true }
  }
}
