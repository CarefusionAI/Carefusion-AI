import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseService } from '../../database/database.service'
import { StaffActor, StaffContextService } from '../common/staff-context.service'
import { AiDraft, HandoverService } from '../common/handover.service'
import type {
  EquipmentEventRequest,
  ExposureRequest,
  HandoverCreateRequest,
  LinkPriorRequest,
  RoomStatusRequest,
  ScheduleStudyRequest,
  SimulatedImagingFlag,
  StaffRejectRequest,
  StartStudyRequest,
  StudyChecklistRequest,
  StudyFileMetaRequest,
  WithdrawFileRequest,
} from '../common/shared'
import { ageYears, forbidden, iso, notFound, num, dateStr } from '../common/staff.util'
import { demoNowMs } from '../common/demo-clock'

const DONE_STATUSES = ['uploaded', 'awaiting_report', 'reported']

function guessModality(details: string): string {
  const d = details.toLowerCase()
  if (/\bmri\b|magnetic/.test(d)) return 'MRI'
  if (/\bct\b|computed|cect/.test(d)) return 'CT'
  if (/echo/.test(d)) return 'ECHO'
  if (/mammo/.test(d)) return 'MAMMO'
  if (/ultra|usg|sonogra|scan.*(abdomen|thyroid|pelvis|obstetric)/.test(d)) return 'USG'
  if (/portable/.test(d)) return 'PORTABLE'
  return 'XR'
}

/**
 * SIMULATED pre-read for the technician (alpha rule 3). Deterministic from the study id so the demo is stable.
 * Never VERIFIED, always labelled simulated, decision support only: the reporting doctor decides.
 */
export function simulatedPreRead(studyId: string, modality: string, bodyPart: string): SimulatedImagingFlag | null {
  const h = createHash('sha256').update(studyId).digest()
  const side = h[0]! % 2 === 0 ? 'left' : 'right'
  const disclaimer = 'Simulated AI output for the demo. Decision support only; the reporting doctor makes the diagnosis.'
  if (modality === 'XR' || modality === 'PORTABLE') {
    return {
      simulated: true,
      label: 'Simulated AI output',
      confidenceLabel: 'UNCERTAIN',
      finding: `Possible small opacity, ${side} lower zone (${bodyPart})`,
      confidence: 0.55 + (h[1]! % 10) / 100,
      evidence: [`${side[0]!.toUpperCase()}${side.slice(1)} lower zone, about ${18 + (h[2]! % 8)} mm`, 'Compare with the prior film before reporting'],
      disclaimer,
    }
  }
  if (modality === 'CT' || modality === 'MRI') {
    return {
      simulated: true,
      label: 'Simulated AI output',
      confidenceLabel: 'SUPPORTED_WITH_CAUTION',
      finding: `No acute abnormality flagged on automated pre-read (${bodyPart})`,
      confidence: 0.7 + (h[1]! % 10) / 100,
      evidence: ['Pre-read of the scout and first series only', 'Not a substitute for the radiologist report'],
      disclaimer,
    }
  }
  return null
}

@Injectable()
export class RadiologyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ctx: StaffContextService,
    private readonly handovers: HandoverService,
  ) {}

  private hospital(actor: StaffActor): string {
    if (!actor.hospitalId) forbidden('Your staff profile has no hospital')
    return actor.hospitalId!
  }

  private async study(studyId: string, hospitalId: string, client?: PoolClient) {
    const sql = `SELECT s.*, o.order_ref, o.details AS order_details, o.ordered_by_user_id, o.status::text AS order_status, o.admission_id, o.bed_id, p.full_name AS patient_name
                   FROM imaging.study s JOIN records.clinical_order o ON o.id = s.order_id JOIN identity.person p ON p.id = s.patient_person_id
                  WHERE s.id = $1 AND s.hospital_id = $2`
    const rows = client ? (await client.query(sql, [studyId, hospitalId])).rows : await this.db.query<any>(sql, [studyId, hospitalId])
    if (!rows[0]) notFound('Study')
    return rows[0] as any
  }

  // ---------------------------------------------------------------- worklist
  async worklist(actor: StaffActor, opts: { status?: string; modality?: string; priority?: string }) {
    const hospitalId = this.hospital(actor)
    const studies = await this.db.query<any>(
      `SELECT s.id AS study_id, s.order_id, o.order_ref, s.patient_person_id, p.full_name, p.date_of_birth, p.sex::text AS sex,
              s.modality, s.body_part, s.priority::text AS priority, s.status, s.contrast, s.clinical_note, s.created_at,
              r.name AS room_name, dp.full_name AS ordered_by, lower(sl.during) AS slot_start
         FROM imaging.study s
         JOIN records.clinical_order o ON o.id = s.order_id
         JOIN identity.person p ON p.id = s.patient_person_id
         JOIN identity.app_user du ON du.id = o.ordered_by_user_id JOIN identity.person dp ON dp.id = du.person_id
         LEFT JOIN imaging.room r ON r.id = s.room_id
         LEFT JOIN LATERAL (SELECT during FROM imaging.room_slot WHERE study_id = s.id ORDER BY lower(during) LIMIT 1) sl ON true
        WHERE s.hospital_id = $1 AND s.status NOT IN ('reported','withdrawn')
        ORDER BY CASE s.priority::text WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, s.created_at`,
      [hospitalId],
    )
    const unplanned = await this.db.query<any>(
      `SELECT o.id AS order_id, o.order_ref, o.patient_person_id, p.full_name, p.date_of_birth, p.sex::text AS sex, o.priority::text AS priority,
              o.details, o.clinical_note, o.created_at, dp.full_name AS ordered_by
         FROM records.clinical_order o
         JOIN identity.person p ON p.id = o.patient_person_id
         JOIN identity.app_user du ON du.id = o.ordered_by_user_id JOIN identity.person dp ON dp.id = du.person_id
        WHERE o.hospital_id = $1 AND o.order_type::text = 'scan' AND o.status::text IN ('open','accepted')
          AND NOT EXISTS (SELECT 1 FROM imaging.study s WHERE s.order_id = o.id)`,
      [hospitalId],
    )
    const now = demoNowMs()
    const rows = [
      ...studies.map((s) => ({
        studyId: s.study_id as string | null,
        orderId: s.order_id as string,
        orderRef: s.order_ref as string,
        patientPersonId: s.patient_person_id as string,
        patientName: s.full_name as string,
        age: ageYears(s.date_of_birth),
        sex: s.sex as string,
        modality: s.modality as string,
        bodyPart: s.body_part as string,
        priority: s.priority as string,
        status: s.status as string,
        contrast: s.contrast as boolean,
        clinicalNote: s.clinical_note as string | null,
        room: s.room_name as string | null,
        scheduledFor: iso(s.slot_start),
        orderedBy: s.ordered_by as string,
        orderedAt: iso(s.created_at),
        waitingMinutes: Math.max(0, Math.round((now - new Date(s.created_at).getTime()) / 60000)),
      })),
      ...unplanned.map((o) => ({
        studyId: null as string | null,
        orderId: o.order_id as string,
        orderRef: o.order_ref as string,
        patientPersonId: o.patient_person_id as string,
        patientName: o.full_name as string,
        age: ageYears(o.date_of_birth),
        sex: o.sex as string,
        modality: guessModality(o.details),
        bodyPart: o.details as string,
        priority: o.priority as string,
        status: 'waiting',
        contrast: /contrast|gadolinium/i.test(o.details),
        clinicalNote: o.clinical_note as string | null,
        room: null as string | null,
        scheduledFor: null as string | null,
        orderedBy: o.ordered_by as string,
        orderedAt: iso(o.created_at),
        waitingMinutes: Math.max(0, Math.round((now - new Date(o.created_at).getTime()) / 60000)),
      })),
    ]
    rows.sort((a, b) => ['stat', 'urgent', 'routine'].indexOf(a.priority) - ['stat', 'urgent', 'routine'].indexOf(b.priority) || a.waitingMinutes - b.waitingMinutes)
    let list = rows
    if (opts.status) list = list.filter((r) => r.status === opts.status)
    if (opts.modality) list = list.filter((r) => r.modality === opts.modality)
    if (opts.priority) list = list.filter((r) => r.priority === opts.priority)

    const [t] = await this.db.query<any>(
      `SELECT count(*) FILTER (WHERE s.completed_at >= date_trunc('day', util.demo_now()))::int AS done_today,
              round(avg(extract(epoch FROM (s.completed_at - s.created_at)) / 60) FILTER (WHERE s.completed_at >= util.demo_now() - interval '7 days'))::int AS avg_tat
         FROM imaging.study s WHERE s.hospital_id = $1`,
      [hospitalId],
    )
    const byModality: Record<string, { done: number; pending: number }> = {}
    for (const r of rows) (byModality[r.modality] ??= { done: 0, pending: 0 }).pending += DONE_STATUSES.includes(r.status) ? 0 : 1
    const doneToday = await this.db.query<any>(
      `SELECT modality, count(*)::int AS n FROM imaging.study WHERE hospital_id = $1 AND completed_at >= date_trunc('day', util.demo_now()) GROUP BY modality`,
      [hospitalId],
    )
    for (const d of doneToday) (byModality[d.modality] ??= { done: 0, pending: 0 }).done = d.n
    const waiting = rows.filter((r) => r.status === 'waiting')
    return {
      kpis: {
        waiting: waiting.length,
        oldestWaitingMinutes: waiting.reduce((m, r) => Math.max(m, r.waitingMinutes), 0),
        scheduled: rows.filter((r) => r.status === 'scheduled').length,
        inProgress: rows.filter((r) => r.status === 'in_progress').length,
        awaitingReport: rows.filter((r) => ['uploaded', 'awaiting_report'].includes(r.status)).length,
        statInQueue: rows.filter((r) => r.priority === 'stat').length,
        completedToday: num(t?.done_today) ?? 0,
        avgTurnaroundMinutes: num(t?.avg_tat),
        byModality,
      },
      studies: list,
    }
  }

  // ---------------------------------------------------------------- study detail
  async studyDetail(actor: StaffActor, studyId: string) {
    const hospitalId = this.hospital(actor)
    const s = await this.study(studyId, hospitalId)
    const [pat] = await this.db.query<any>(
      `SELECT p.date_of_birth, p.sex::text AS sex, b.bed_no, w.name AS ward_name FROM identity.person p
         LEFT JOIN access.admission a ON a.id = $2 LEFT JOIN org.bed b ON b.id = COALESCE($3::uuid, a.bed_id) LEFT JOIN org.ward w ON w.id = b.ward_id WHERE p.id = $1`,
      [s.patient_person_id, s.admission_id, s.bed_id],
    )
    const [allergies, files, series, exposure, priors, candidates, slot, room, doctor] = await Promise.all([
      this.db.query<any>(`SELECT substance, reaction, severity FROM records.allergy WHERE patient_person_id = $1 AND status = 'active' AND superseded_by IS NULL`, [s.patient_person_id]),
      this.db.query<any>(
        `SELECT f.id, f.kind, f.uploaded_at, f.withdrawn_at, f.withdrawn_reason, f.series_id, d.title, d.mime_type, d.size_bytes, d.storage_key, up.full_name AS uploaded_by
           FROM imaging.study_file f JOIN records.document d ON d.id = f.document_id
           JOIN identity.app_user uu ON uu.id = f.uploaded_by_user_id JOIN identity.person up ON up.id = uu.person_id
          WHERE f.study_id = $1 ORDER BY f.uploaded_at`,
        [studyId],
      ),
      this.db.query<any>(`SELECT id, series_no, modality, description, instance_count FROM imaging.study_series WHERE study_id = $1 ORDER BY series_no`, [studyId]),
      this.db.query<any>(`SELECT kvp::float AS kvp, mas::float AS mas, dap_mgycm2::float AS dap, exposure_ms, recorded_at FROM imaging.exposure WHERE study_id = $1`, [studyId]),
      this.db.query<any>(`SELECT sp.prior_study_id, ps.modality, ps.body_part, ps.created_at, ps.status FROM imaging.study_prior sp JOIN imaging.study ps ON ps.id = sp.prior_study_id WHERE sp.study_id = $1`, [studyId]),
      this.db.query<any>(
        `SELECT ps.id, ps.modality, ps.body_part, ps.created_at, ps.status FROM imaging.study ps
          WHERE ps.patient_person_id = $1 AND ps.id <> $2 AND ps.hospital_id = $3 ORDER BY ps.created_at DESC LIMIT 10`,
        [s.patient_person_id, studyId, hospitalId],
      ),
      this.db.query<any>(`SELECT id, lower(during) AS starts_at, upper(during) AS ends_at, label FROM imaging.room_slot WHERE study_id = $1 ORDER BY lower(during) LIMIT 1`, [studyId]),
      s.room_id ? this.db.query<any>('SELECT id, name, modality, status FROM imaging.room WHERE id = $1', [s.room_id]) : Promise.resolve([]),
      this.db.query<any>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = $1`, [s.ordered_by_user_id]),
    ])
    const now = demoNowMs()
    const activeFiles = files.filter((f) => !f.withdrawn_at)
    return {
      study: {
        id: s.id,
        orderId: s.order_id,
        orderRef: s.order_ref,
        modality: s.modality,
        bodyPart: s.body_part,
        view: s.view_text,
        priority: s.priority,
        status: s.status,
        contrast: s.contrast,
        clinicalNote: s.clinical_note,
        checklist: s.checklist,
        burnedInNameChecked: s.burned_in_name_checked,
        startedAt: iso(s.started_at),
        completedAt: iso(s.completed_at),
        orderedBy: doctor[0]?.full_name ?? null,
        orderedAt: iso(s.created_at),
      },
      patient: {
        personId: s.patient_person_id,
        fullName: s.patient_name,
        age: ageYears(pat?.date_of_birth),
        sex: pat?.sex ?? null,
        location: pat?.bed_no ? `${pat.ward_name} · Bed ${pat.bed_no}` : 'OP / doctor app',
        allergies: allergies.map((a) => ({ substance: a.substance, reaction: a.reaction, severity: a.severity })),
      },
      room: room[0] ? { id: room[0].id, name: room[0].name, modality: room[0].modality, status: room[0].status } : null,
      slot: slot[0] ? { id: slot[0].id, startsAt: iso(slot[0].starts_at), endsAt: iso(slot[0].ends_at), label: slot[0].label } : null,
      files: files.map((f) => ({
        id: f.id,
        fileName: f.title,
        kind: f.kind,
        mimeType: f.mime_type,
        sizeBytes: num(f.size_bytes),
        uploadedAt: iso(f.uploaded_at),
        uploadedBy: f.uploaded_by,
        withdrawnAt: iso(f.withdrawn_at),
        withdrawnReason: f.withdrawn_reason,
        canWithdraw: !f.withdrawn_at && now < new Date(f.uploaded_at).getTime() + 24 * 3600_000,
      })),
      series: series.map((x) => ({ id: x.id, seriesNo: x.series_no, modality: x.modality, description: x.description, instanceCount: x.instance_count })),
      exposure: exposure[0] ? { kvp: exposure[0].kvp, mas: exposure[0].mas, dapMgycm2: exposure[0].dap, exposureMs: exposure[0].exposure_ms, recordedAt: iso(exposure[0].recorded_at) } : null,
      priors: priors.map((p) => ({ studyId: p.prior_study_id, modality: p.modality, bodyPart: p.body_part, date: iso(p.created_at), status: p.status })),
      priorCandidates: candidates.map((p) => ({ studyId: p.id, modality: p.modality, bodyPart: p.body_part, date: iso(p.created_at), status: p.status })),
      readiness: {
        patientIdMatched: !!(s.checklist as any)?.idMatched,
        namesMatch: s.burned_in_name_checked,
        hasFiles: activeFiles.length > 0,
        priorLinked: priors.length > 0,
        canSubmit: s.burned_in_name_checked && activeFiles.length > 0 && ['in_progress', 'uploaded'].includes(s.status),
      },
      aiPreRead: simulatedPreRead(s.id, s.modality, s.body_part),
    }
  }

  // ---------------------------------------------------------------- accept / reject / schedule / start
  /** Accept an imaging order. Creates the study when the doctor's order has none yet. */
  async acceptOrder(actor: StaffActor, orderId: string) {
    const hospitalId = this.hospital(actor)
    const rows = await this.db.query<any>(
      `SELECT o.id, o.patient_person_id, o.status::text AS status, o.details, o.priority, o.clinical_note, o.order_ref
         FROM records.clinical_order o WHERE o.id = $1 AND o.hospital_id = $2 AND o.order_type::text = 'scan'`,
      [orderId, hospitalId],
    )
    const o = rows[0]
    if (!o) notFound('Imaging order')
    if (!['open', 'accepted'].includes(o.status)) throw new ConflictException({ success: false, errorMessage: `Order is ${o.status}` })
    return this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_order SET status = 'accepted', accepted_by_user_id = COALESCE(accepted_by_user_id, $2), accepted_at = COALESCE(accepted_at, util.demo_now()), assigned_to_user_id = COALESCE(assigned_to_user_id, $2) WHERE id = $1`, [orderId, actor.userId])
      let st = (await c.query('SELECT id FROM imaging.study WHERE order_id = $1', [orderId])).rows[0]
      if (!st) {
        st = (
          await c.query(
            `INSERT INTO imaging.study (order_id, patient_person_id, hospital_id, modality, body_part, priority, contrast, clinical_note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [orderId, o.patient_person_id, hospitalId, guessModality(o.details), o.details.slice(0, 120), o.priority, /contrast|gadolinium/i.test(o.details), o.clinical_note],
          )
        ).rows[0]
      }
      await this.ctx.audit(c, 'radiology.order.accept', { entityType: 'imaging.study', entityId: st.id, patientPersonId: o.patient_person_id })
      return { orderId, studyId: st.id as string, status: 'accepted' }
    })
  }

  async rejectOrder(actor: StaffActor, orderId: string, dto: StaffRejectRequest) {
    const hospitalId = this.hospital(actor)
    const rows = await this.db.query<any>(
      `SELECT o.id, o.patient_person_id, o.status::text AS status, o.order_ref, o.ordered_by_user_id FROM records.clinical_order o
        WHERE o.id = $1 AND o.hospital_id = $2 AND o.order_type::text = 'scan'`,
      [orderId, hospitalId],
    )
    const o = rows[0]
    if (!o) notFound('Imaging order')
    if (!['open', 'accepted'].includes(o.status)) throw new ConflictException({ success: false, errorMessage: `Order is ${o.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_order SET status = 'rejected', rejected_reason = $2, accepted_by_user_id = $3, accepted_at = util.demo_now() WHERE id = $1`, [orderId, dto.reason, actor.userId])
      await c.query(`UPDATE imaging.study SET status = 'withdrawn' WHERE order_id = $1 AND status IN ('waiting','scheduled')`, [orderId])
      await this.ctx.emitEvent(c, actor, {
        type: 'message',
        toRoles: ['doctor'],
        toUserId: o.ordered_by_user_id,
        title: `Imaging order declined · ${o.order_ref}`,
        text: `${actor.fullName}: ${dto.reason}`,
        href: '/doctor/orders',
        entityType: 'records.clinical_order',
        entityId: orderId,
        patientPersonId: o.patient_person_id,
      })
      await this.ctx.audit(c, 'radiology.order.reject', { entityType: 'records.clinical_order', entityId: orderId, patientPersonId: o.patient_person_id })
    })
    return { orderId, status: 'rejected' }
  }

  private async roomIn(hospitalId: string, roomId: string) {
    const r = await this.db.query<any>('SELECT id, name, modality, status, is_active FROM imaging.room WHERE id = $1 AND hospital_id = $2', [roomId, hospitalId])
    if (!r[0]) notFound('Room')
    return r[0]
  }

  async scheduleStudy(actor: StaffActor, studyId: string, dto: ScheduleStudyRequest) {
    const hospitalId = this.hospital(actor)
    const s = await this.study(studyId, hospitalId)
    if (!['waiting', 'scheduled'].includes(s.status)) throw new ConflictException({ success: false, errorMessage: `Study is ${s.status}` })
    const room = await this.roomIn(hospitalId, dto.roomId)
    if (room.status !== 'ok' || !room.is_active) throw new ConflictException({ success: false, errorMessage: `${room.name} is out of service` })
    if (room.modality !== s.modality && !(room.modality === 'XR' && s.modality === 'PORTABLE'))
      throw new BadRequestException({ success: false, errorMessage: `${room.name} is a ${room.modality} room; this is a ${s.modality} study` })
    return this.ctx.tx(actor, async (c) => {
      const during = `[${new Date(dto.startsAt).toISOString()},${new Date(new Date(dto.startsAt).getTime() + dto.durationMinutes * 60000).toISOString()})`
      const label = `${s.body_part} · ${s.patient_name}`
      const existing = (await c.query('SELECT id FROM imaging.room_slot WHERE study_id = $1', [studyId])).rows[0]
      if (existing) await c.query('UPDATE imaging.room_slot SET room_id = $2, during = $3::tstzrange, label = $4 WHERE id = $1', [existing.id, dto.roomId, during, label])
      else await c.query('INSERT INTO imaging.room_slot (room_id, study_id, during, label) VALUES ($1,$2,$3::tstzrange,$4)', [dto.roomId, studyId, during, label])
      await c.query(`UPDATE imaging.study SET room_id = $2, status = 'scheduled' WHERE id = $1`, [studyId, dto.roomId])
      await this.ctx.audit(c, 'radiology.study.schedule', { entityType: 'imaging.study', entityId: studyId, patientPersonId: s.patient_person_id })
      return { studyId, status: 'scheduled', roomId: dto.roomId, startsAt: new Date(dto.startsAt).toISOString() }
    })
  }

  async startStudy(actor: StaffActor, studyId: string, dto: StartStudyRequest) {
    const hospitalId = this.hospital(actor)
    const s = await this.study(studyId, hospitalId)
    if (!['waiting', 'scheduled'].includes(s.status)) throw new ConflictException({ success: false, errorMessage: `Study is ${s.status}` })
    const roomId = dto.roomId ?? s.room_id
    if (roomId) {
      const room = await this.roomIn(hospitalId, roomId)
      if (room.status !== 'ok') throw new ConflictException({ success: false, errorMessage: `${room.name} is out of service` })
    }
    return this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE imaging.study SET status = 'in_progress', started_at = util.demo_now(), performed_by_user_id = $2, room_id = $3 WHERE id = $1`, [studyId, actor.userId, roomId ?? null])
      await c.query(`UPDATE records.clinical_order SET status = 'in_progress', accepted_by_user_id = COALESCE(accepted_by_user_id, $2), accepted_at = COALESCE(accepted_at, util.demo_now()) WHERE id = $1 AND status::text IN ('open','accepted')`, [s.order_id, actor.userId])
      await this.ctx.audit(c, 'radiology.study.start', { entityType: 'imaging.study', entityId: studyId, patientPersonId: s.patient_person_id })
      return { studyId, status: 'in_progress' }
    })
  }

  async updateChecklist(actor: StaffActor, studyId: string, dto: StudyChecklistRequest) {
    const s = await this.study(studyId, this.hospital(actor))
    if (['reported', 'withdrawn'].includes(s.status)) throw new ConflictException({ success: false, errorMessage: `Study is ${s.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `UPDATE imaging.study SET checklist = checklist || $2::jsonb, burned_in_name_checked = COALESCE($3, burned_in_name_checked), contrast = COALESCE($4, contrast) WHERE id = $1`,
        [studyId, JSON.stringify(dto.checklist), dto.burnedInNameChecked ?? null, dto.contrast ?? null],
      )
      await this.ctx.audit(c, 'radiology.study.checklist', { entityType: 'imaging.study', entityId: studyId, patientPersonId: s.patient_person_id })
    })
    const [row] = await this.db.query<any>('SELECT checklist, burned_in_name_checked, contrast FROM imaging.study WHERE id = $1', [studyId])
    return { studyId, checklist: row.checklist, burnedInNameChecked: row.burned_in_name_checked, contrast: row.contrast }
  }

  // ---------------------------------------------------------------- files
  /**
   * Record upload metadata (document + study file + series). The file bytes themselves are NOT stored by this
   * endpoint in the alpha (the web app sends them to object storage separately); a wrong-patient upload can be
   * withdrawn for 24 hours, every upload and withdrawal is audited.
   */
  async addFile(actor: StaffActor, studyId: string, dto: StudyFileMetaRequest) {
    const hospitalId = this.hospital(actor)
    const s = await this.study(studyId, hospitalId)
    if (!['in_progress', 'uploaded', 'awaiting_report'].includes(s.status)) {
      throw new ConflictException({ success: false, errorMessage: s.status === 'waiting' || s.status === 'scheduled' ? 'Start the study before uploading images' : `Study is ${s.status}` })
    }
    return this.ctx.tx(actor, async (c) => {
      let folder = (await c.query(`SELECT id FROM records.folder WHERE patient_person_id = $1 AND kind = 'doctor_uploads' LIMIT 1`, [s.patient_person_id])).rows[0]
      if (!folder) {
        await c.query('SELECT records.create_system_folders($1, $2)', [s.patient_person_id, actor.userId])
        folder = (await c.query(`SELECT id FROM records.folder WHERE patient_person_id = $1 AND kind = 'doctor_uploads' LIMIT 1`, [s.patient_person_id])).rows[0]
      }
      if (!folder) throw new ConflictException({ success: false, errorMessage: 'The patient has no folder for doctor uploads' })
      const safe = dto.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
      const key = `imaging/${studyId}/${randomUUID()}-${safe}`
      const sha = dto.sha256 ? Buffer.from(dto.sha256, 'hex') : createHash('sha256').update(`${key}:${dto.sizeBytes ?? 0}`).digest()
      const doc = (
        await c.query(
          `INSERT INTO records.document (patient_person_id, folder_id, title, doc_type, storage_key, mime_type, size_bytes, sha256, enc_key_id, created_by_user_id, order_id, source_label)
           VALUES ($1,$2,$3,'scan',$4,$5,$6,$7,'demo-none',$8,$9,$10) RETURNING id`,
          [s.patient_person_id, folder.id, dto.fileName, key, dto.mimeType ?? null, dto.sizeBytes ?? null, sha, actor.userId, s.order_id, `Radiology · uploaded by ${actor.fullName}`],
        )
      ).rows[0]
      let seriesId: string | null = null
      if (dto.seriesNo) {
        seriesId = (
          await c.query(
            `INSERT INTO imaging.study_series (study_id, series_no, modality, description, instance_count) VALUES ($1,$2,$3,$4,COALESCE($5,1))
             ON CONFLICT (study_id, series_no) DO UPDATE SET instance_count = COALESCE($5, imaging.study_series.instance_count), description = COALESCE($4, imaging.study_series.description)
             RETURNING id`,
            [studyId, dto.seriesNo, s.modality, dto.seriesDescription ?? null, dto.instanceCount ?? null],
          )
        ).rows[0].id
      }
      const f = (
        await c.query(`INSERT INTO imaging.study_file (study_id, series_id, document_id, kind, uploaded_by_user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, uploaded_at`, [studyId, seriesId, doc.id, dto.kind, actor.userId])
      ).rows[0]
      if (s.status === 'in_progress') await c.query(`UPDATE imaging.study SET status = 'uploaded' WHERE id = $1`, [studyId])
      await this.ctx.audit(c, 'radiology.file.upload', { entityType: 'imaging.study_file', entityId: f.id, patientPersonId: s.patient_person_id, details: { fileName: dto.fileName, kind: dto.kind } })
      return {
        fileId: f.id as string,
        documentId: doc.id as string,
        storageKey: key,
        uploadedAt: iso(f.uploaded_at),
        withdrawableUntil: new Date(new Date(f.uploaded_at).getTime() + 24 * 3600_000).toISOString(),
        note: 'Metadata recorded. File bytes are not stored by this demo endpoint.',
      }
    })
  }

  async withdrawFile(actor: StaffActor, studyId: string, fileId: string, dto: WithdrawFileRequest) {
    const s = await this.study(studyId, this.hospital(actor))
    const f = await this.db.query<any>('SELECT id, withdrawn_at, uploaded_at FROM imaging.study_file WHERE id = $1 AND study_id = $2', [fileId, studyId])
    if (!f[0]) notFound('File')
    if (f[0].withdrawn_at) throw new ConflictException({ success: false, errorMessage: 'This file is already withdrawn' })
    if (['reported'].includes(s.status)) throw new ConflictException({ success: false, errorMessage: 'The study has been reported; ask the reporting doctor' })
    return this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE imaging.study_file SET withdrawn_at = util.demo_now(), withdrawn_by_user_id = $2, withdrawn_reason = $3 WHERE id = $1`, [fileId, actor.userId, dto.reason])
      const left = (await c.query('SELECT count(*)::int AS n FROM imaging.study_file WHERE study_id = $1 AND withdrawn_at IS NULL', [studyId])).rows[0].n
      if (left === 0 && ['uploaded', 'awaiting_report'].includes(s.status)) await c.query(`UPDATE imaging.study SET status = 'in_progress', completed_at = NULL WHERE id = $1`, [studyId])
      await this.ctx.audit(c, 'radiology.file.withdraw', { entityType: 'imaging.study_file', entityId: fileId, patientPersonId: s.patient_person_id, details: { reason: dto.reason } })
      return { fileId, withdrawn: true, remainingFiles: left }
    })
  }

  async saveExposure(actor: StaffActor, studyId: string, dto: ExposureRequest) {
    const s = await this.study(studyId, this.hospital(actor))
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `INSERT INTO imaging.exposure (study_id, kvp, mas, dap_mgycm2, exposure_ms, operator_user_id) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (study_id) DO UPDATE SET kvp = EXCLUDED.kvp, mas = EXCLUDED.mas, dap_mgycm2 = EXCLUDED.dap_mgycm2, exposure_ms = EXCLUDED.exposure_ms, operator_user_id = EXCLUDED.operator_user_id, recorded_at = util.demo_now()`,
        [studyId, dto.kvp ?? null, dto.mas ?? null, dto.dapMgycm2 ?? null, dto.exposureMs ?? null, actor.userId],
      )
      await this.ctx.audit(c, 'radiology.exposure.save', { entityType: 'imaging.exposure', entityId: studyId, patientPersonId: s.patient_person_id })
    })
    return { studyId, saved: true }
  }

  async linkPrior(actor: StaffActor, studyId: string, dto: LinkPriorRequest) {
    const hospitalId = this.hospital(actor)
    const s = await this.study(studyId, hospitalId)
    await this.study(dto.priorStudyId, hospitalId) // prior must be in the same hospital
    await this.ctx.tx(actor, async (c) => {
      await c.query('INSERT INTO imaging.study_prior (study_id, prior_study_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [studyId, dto.priorStudyId])
      await this.ctx.audit(c, 'radiology.prior.link', { entityType: 'imaging.study', entityId: studyId, patientPersonId: s.patient_person_id })
    })
    return { studyId, priorStudyId: dto.priorStudyId, linked: true }
  }

  /** "Send to the reporting doctor": images are ready for reporting. */
  async submitStudy(actor: StaffActor, studyId: string) {
    const hospitalId = this.hospital(actor)
    const s = await this.study(studyId, hospitalId)
    if (!['in_progress', 'uploaded'].includes(s.status)) throw new ConflictException({ success: false, errorMessage: `Study is ${s.status}` })
    const files = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM imaging.study_file WHERE study_id = $1 AND withdrawn_at IS NULL', [studyId])
    const problems: string[] = []
    if (!s.burned_in_name_checked) problems.push('Confirm the patient name on the image matches the order')
    if (!files[0]?.n) problems.push('Upload at least one image file')
    if (problems.length) throw new ConflictException({ success: false, errorMessage: 'The study is not ready to send', problems })
    return this.ctx.tx(actor, async (c) => {
      await c.query(
        `UPDATE imaging.study SET status = 'awaiting_report', completed_at = util.demo_now(), performed_by_user_id = COALESCE(performed_by_user_id, $2),
                reporting_doctor_user_id = COALESCE(reporting_doctor_user_id, $3) WHERE id = $1`,
        [studyId, actor.userId, s.ordered_by_user_id],
      )
      await c.query(`UPDATE records.clinical_order SET status = 'done', completed_by_user_id = $2, completed_at = util.demo_now() WHERE id = $1 AND status::text <> 'done'`, [s.order_id, actor.userId])
      await this.ctx.emitEvent(c, actor, {
        type: 'imaging-result',
        toRoles: ['doctor'],
        toUserId: s.ordered_by_user_id,
        title: `Images ready · ${s.body_part}`,
        text: `${s.patient_name} · ${s.order_ref} · uploaded by ${actor.fullName}`,
        href: '/doctor/results',
        entityType: 'imaging.study',
        entityId: studyId,
        patientPersonId: s.patient_person_id,
      })
      await this.ctx.audit(c, 'radiology.study.submit', { entityType: 'imaging.study', entityId: studyId, patientPersonId: s.patient_person_id })
      return { studyId, status: 'awaiting_report' }
    })
  }

  // ---------------------------------------------------------------- rooms, schedule, equipment
  async rooms(actor: StaffActor) {
    const hospitalId = this.hospital(actor)
    const rooms = await this.db.query<any>(
      `SELECT r.id, r.name, r.modality, r.status, r.out_of_service_reason, r.is_active,
              (SELECT s.body_part || ' · ' || p.full_name FROM imaging.study s JOIN identity.person p ON p.id = s.patient_person_id
                WHERE s.room_id = r.id AND s.status = 'in_progress' ORDER BY s.started_at DESC LIMIT 1) AS now_scanning,
              (SELECT count(*)::int FROM imaging.study s WHERE s.room_id = r.id AND s.created_at >= date_trunc('day', util.demo_now())) AS studies_today
         FROM imaging.room r WHERE r.hospital_id = $1 AND r.is_active ORDER BY r.modality, r.name`,
      [hospitalId],
    )
    return rooms.map((r) => ({ id: r.id, name: r.name, modality: r.modality, status: r.status, outOfServiceReason: r.out_of_service_reason, nowScanning: r.now_scanning, studiesToday: r.studies_today }))
  }

  async schedule(actor: StaffActor, date?: string) {
    const hospitalId = this.hospital(actor)
    const rooms = await this.rooms(actor)
    const slots = await this.db.query<any>(
      `SELECT sl.id, sl.room_id, lower(sl.during) AS starts_at, upper(sl.during) AS ends_at, sl.label, sl.study_id, s.status, s.body_part, p.full_name AS patient_name
         FROM imaging.room_slot sl JOIN imaging.room r ON r.id = sl.room_id
         LEFT JOIN imaging.study s ON s.id = sl.study_id LEFT JOIN identity.person p ON p.id = s.patient_person_id
        WHERE r.hospital_id = $1
          AND sl.during && tstzrange(
                (COALESCE($2::date, (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata'),
                ((COALESCE($2::date, (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
        ORDER BY lower(sl.during)`,
      [hospitalId, date ?? null],
    )
    const waiting = await this.db.query<any>(
      `SELECT count(*)::int AS n FROM imaging.study WHERE hospital_id = $1 AND status = 'waiting'`,
      [hospitalId],
    )
    return {
      date: date ?? new Date(demoNowMs() + 5.5 * 3600_000).toISOString().slice(0, 10),
      unscheduledStudies: waiting[0]?.n ?? 0,
      rooms: rooms.map((r) => ({
        ...r,
        slots: slots
          .filter((s) => s.room_id === r.id)
          .map((s) => ({ id: s.id, startsAt: iso(s.starts_at), endsAt: iso(s.ends_at), label: s.label, studyId: s.study_id, studyStatus: s.status, bodyPart: s.body_part, patientName: s.patient_name })),
      })),
    }
  }

  async setRoomStatus(actor: StaffActor, roomId: string, dto: RoomStatusRequest) {
    const room = await this.roomIn(this.hospital(actor), roomId)
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE imaging.room SET status = $2, out_of_service_reason = CASE WHEN $2 = 'ok' THEN NULL ELSE $3 END WHERE id = $1`, [roomId, dto.status, dto.reason ?? null])
      if (dto.status !== 'ok') {
        await c.query(`INSERT INTO imaging.equipment_event (room_id, kind, starts_at, note, recorded_by_user_id) VALUES ($1,'downtime',util.demo_now(),$2,$3)`, [roomId, dto.reason ?? null, actor.userId])
      } else {
        await c.query(`UPDATE imaging.equipment_event SET ends_at = util.demo_now() WHERE room_id = $1 AND kind = 'downtime' AND ends_at IS NULL`, [roomId])
      }
      await this.ctx.audit(c, 'radiology.room.status', { entityType: 'imaging.room', entityId: roomId, details: { from: room.status, to: dto.status } })
    })
    return { id: roomId, status: dto.status }
  }

  async addEquipmentEvent(actor: StaffActor, dto: EquipmentEventRequest) {
    await this.roomIn(this.hospital(actor), dto.roomId)
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO imaging.equipment_event (room_id, kind, starts_at, ends_at, due_on, note, recorded_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [dto.roomId, dto.kind, dto.startsAt ?? new Date(demoNowMs()).toISOString(), dto.endsAt ?? null, dto.dueOn ?? null, dto.note ?? null, actor.userId],
      )
      await this.ctx.audit(c, 'radiology.equipment.event', { entityType: 'imaging.equipment_event', entityId: r.rows[0].id })
      return { id: r.rows[0].id as string }
    })
  }

  async equipment(actor: StaffActor) {
    const hospitalId = this.hospital(actor)
    const rooms = await this.db.query<any>(
      `SELECT r.id, r.name, r.modality, r.status, r.out_of_service_reason,
              (SELECT max(e.starts_at) FROM imaging.equipment_event e WHERE e.room_id = r.id AND e.kind IN ('calibration','flat_field')) AS last_qc,
              (SELECT min(e.due_on) FROM imaging.equipment_event e WHERE e.room_id = r.id AND e.due_on >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date) AS next_due,
              (SELECT count(*)::int FROM imaging.study s WHERE s.room_id = r.id AND s.created_at >= date_trunc('day', util.demo_now())) AS studies_today,
              COALESCE((SELECT sum(extract(epoch FROM (LEAST(COALESCE(e.ends_at, util.demo_now()), util.demo_now()) - GREATEST(e.starts_at, util.demo_now() - interval '30 days'))))
                          FROM imaging.equipment_event e
                         WHERE e.room_id = r.id AND e.kind = 'downtime' AND e.starts_at IS NOT NULL AND COALESCE(e.ends_at, util.demo_now()) >= util.demo_now() - interval '30 days'), 0)::float AS down_seconds
         FROM imaging.room r WHERE r.hospital_id = $1 AND r.is_active ORDER BY r.modality, r.name`,
      [hospitalId],
    )
    const events = await this.db.query<any>(
      `SELECT e.id, e.room_id, e.kind, e.starts_at, e.ends_at, e.due_on, e.note FROM imaging.equipment_event e JOIN imaging.room r ON r.id = e.room_id
        WHERE r.hospital_id = $1 AND (e.starts_at >= util.demo_now() - interval '30 days' OR e.due_on >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date) ORDER BY COALESCE(e.starts_at, e.due_on::timestamptz) DESC LIMIT 100`,
      [hospitalId],
    )
    const thirty = 30 * 86400
    const list = rooms.map((r) => {
      const needsAttention = r.status === 'ok' && r.next_due && new Date(r.next_due).getTime() <= demoNowMs() + 86400_000
      return {
        id: r.id,
        name: r.name,
        modality: r.modality,
        status: r.status,
        led: r.status !== 'ok' ? 'bad' : needsAttention ? 'warn' : 'ok',
        outOfServiceReason: r.out_of_service_reason,
        lastQcAt: iso(r.last_qc),
        nextServiceDue: dateStr(r.next_due),
        studiesToday: r.studies_today,
        uptime30dPercent: Math.round((1000 * Math.max(0, thirty - Math.min(thirty, r.down_seconds))) / thirty) / 10,
      }
    })
    return {
      summary: {
        total: list.length,
        working: list.filter((r) => r.led === 'ok').length,
        needsAttention: list.filter((r) => r.led === 'warn').length,
        down: list.filter((r) => r.led === 'bad').length,
        uptime30dPercent: list.length ? Math.round((10 * list.reduce((s, r) => s + r.uptime30dPercent, 0)) / list.length) / 10 : null,
      },
      rooms: list,
      events: events.map((e) => ({ id: e.id, roomId: e.room_id, kind: e.kind, startsAt: iso(e.starts_at), endsAt: iso(e.ends_at), dueOn: dateStr(e.due_on), note: e.note })),
    }
  }

  // ---------------------------------------------------------------- handover
  handoverList(actor: StaffActor) {
    return this.handovers.list(actor)
  }
  handoverColleagues(actor: StaffActor) {
    return this.handovers.colleagues(actor)
  }
  handoverSign(actor: StaffActor, id: string) {
    return this.handovers.sign(actor, id)
  }
  async handoverCreate(actor: StaffActor, dto: HandoverCreateRequest) {
    let draft: AiDraft | undefined
    if (dto.useAiDraft) {
      const w = await this.worklist(actor, {})
      draft = {
        text:
          `Simulated AI draft (needs your review): ${w.kpis.waiting} studies waiting, ${w.kpis.inProgress} in progress, ${w.kpis.awaitingReport} awaiting report, ` +
          `${w.kpis.statInQueue} STAT in queue. Decision support only.`,
        items: w.studies.filter((s) => s.priority === 'stat').map((s) => ({ orderId: s.orderId, flag: 'watch' as const, note: `${s.orderRef} ${s.bodyPart} (${s.patientName}) is STAT and not finished.` })),
      }
    }
    return this.handovers.create(actor, dto, draft)
  }
}
