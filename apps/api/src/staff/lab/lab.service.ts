import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { randomInt } from 'node:crypto'
import { DatabaseService } from '../../database/database.service'
import { StaffActor, StaffContextService } from '../common/staff-context.service'
import { AiDraft, HandoverService } from '../common/handover.service'
import type {
  CollectSpecimenRequest,
  CriticalCallRequest,
  HandoverCreateRequest,
  InstrumentStatusRequest,
  LabResultValueRow,
  QcRunRequest,
  ReadBackRequest,
  ResultEntryRequest,
  StaffRejectRequest,
} from '../common/shared'
import { ageYears, forbidden, iso, notFound, num, dateStr } from '../common/staff.util'
import { demoNowMs } from '../common/demo-clock'

/** Turnaround targets in minutes by priority (design: STAT 60 min, routine 4 h). */
const TAT_TARGET_MIN: Record<string, number> = { stat: 60, urgent: 120, routine: 240 }

type Stage = 'new' | 'awaiting_sample' | 'running' | 'to_verify' | 'to_release'

@Injectable()
export class LabService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ctx: StaffContextService,
    private readonly handovers: HandoverService,
  ) {}

  private hospital(actor: StaffActor): string {
    if (!actor.hospitalId) forbidden('Your staff profile has no hospital')
    return actor.hospitalId!
  }

  /** A lab order of the technician's own hospital. */
  private async labOrder(orderId: string, hospitalId: string, client?: PoolClient) {
    const sql = `SELECT o.id, o.order_ref, o.patient_person_id, o.ordered_by_user_id, o.status::text AS status, o.priority::text AS priority,
                        o.details, o.admission_id, o.bed_id, o.created_at, p.full_name AS patient_name
                   FROM records.clinical_order o JOIN identity.person p ON p.id = o.patient_person_id
                  WHERE o.id = $1 AND o.hospital_id = $2 AND o.order_type::text = 'lab'`
    const rows = client ? (await client.query(sql, [orderId, hospitalId])).rows : await this.db.query<any>(sql, [orderId, hospitalId])
    if (!rows[0]) notFound('Lab order')
    return rows[0] as any
  }

  // ---------------------------------------------------------------- worklist
  async worklist(actor: StaffActor, opts: { stage?: string; priority?: string; q?: string }) {
    const hospitalId = this.hospital(actor)
    const rows = await this.db.query<any>(
      `SELECT o.id, o.order_ref, o.patient_person_id, p.full_name, p.date_of_birth, p.sex::text AS sex,
              o.priority::text AS priority, o.status::text AS status, o.created_at, o.accepted_at, o.details,
              b.bed_no, w.name AS ward_name, dp.full_name AS ordered_by,
              (SELECT string_agg(i.test_code::text, ', ' ORDER BY i.test_code) FROM lab.order_item i WHERE i.order_id = o.id) AS tests,
              (SELECT s.status FROM lab.specimen s WHERE s.order_id = o.id AND s.status <> 'rejected' ORDER BY s.created_at DESC LIMIT 1) AS specimen_status,
              (SELECT r.status FROM lab.result r WHERE r.order_id = o.id ORDER BY r.created_at DESC LIMIT 1) AS result_status
         FROM records.clinical_order o
         JOIN identity.person p ON p.id = o.patient_person_id
         JOIN identity.app_user du ON du.id = o.ordered_by_user_id JOIN identity.person dp ON dp.id = du.person_id
         LEFT JOIN access.admission a ON a.id = o.admission_id
         LEFT JOIN org.bed b ON b.id = COALESCE(o.bed_id, a.bed_id) LEFT JOIN org.ward w ON w.id = b.ward_id
        WHERE o.hospital_id = $1 AND o.order_type::text = 'lab' AND o.status::text IN ('open','accepted','in_progress')
        ORDER BY CASE o.priority::text WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, o.created_at`,
      [hospitalId],
    )
    const now = demoNowMs()
    let list = rows.map((r) => {
      let stage: Stage
      if (r.status === 'open') stage = 'new'
      else if (r.result_status === 'verified') stage = 'to_release'
      else if (r.result_status === 'draft' || r.result_status === 'preliminary') stage = 'to_verify'
      else if (r.specimen_status === 'collected' || r.specimen_status === 'in_lab') stage = 'running'
      else stage = 'awaiting_sample'
      return {
        orderId: r.id,
        orderRef: r.order_ref,
        patientPersonId: r.patient_person_id,
        patientName: r.full_name,
        age: ageYears(r.date_of_birth),
        sex: r.sex,
        priority: r.priority,
        status: r.status,
        stage,
        tests: r.tests ?? r.details,
        from: r.bed_no ? `${r.ward_name ?? 'Ward'} · Bed ${r.bed_no}` : 'OP / doctor app',
        orderedBy: r.ordered_by,
        orderedAt: iso(r.created_at),
        waitingMinutes: Math.max(0, Math.round((now - new Date(r.created_at).getTime()) / 60000)),
      }
    })
    const all = list
    if (opts.stage) list = list.filter((x) => x.stage === opts.stage)
    if (opts.priority) list = list.filter((x) => x.priority === opts.priority)
    if (opts.q) {
      const q = opts.q.toLowerCase()
      list = list.filter((x) => x.patientName.toLowerCase().includes(q) || x.orderRef.toLowerCase().includes(q) || (x.tests ?? '').toLowerCase().includes(q))
    }
    const [today] = await this.db.query<any>(
      `SELECT
         (SELECT count(*) FROM lab.specimen s JOIN records.clinical_order o ON o.id = s.order_id
           WHERE o.hospital_id = $1 AND s.rejected_at >= date_trunc('day', util.demo_now())) AS rejected_today,
         (SELECT count(*) FROM lab.result r JOIN records.clinical_order o ON o.id = r.order_id
           WHERE o.hospital_id = $1 AND r.released_at >= date_trunc('day', util.demo_now())) AS released_today,
         (SELECT count(*) FROM lab.specimen s JOIN records.clinical_order o ON o.id = s.order_id
           WHERE o.hospital_id = $1 AND s.collected_at >= date_trunc('day', util.demo_now())) AS collected_today`,
      [hospitalId],
    )
    const awaiting = all.filter((x) => x.stage === 'awaiting_sample' || x.stage === 'new')
    return {
      kpis: {
        openOrders: all.length,
        statOrders: all.filter((x) => x.priority === 'stat').length,
        awaitingSample: awaiting.length,
        oldestAwaitingMinutes: awaiting.reduce((m, x) => Math.max(m, x.waitingMinutes), 0),
        toVerify: all.filter((x) => x.stage === 'to_verify').length,
        toRelease: all.filter((x) => x.stage === 'to_release').length,
        samplesCollectedToday: num(today?.collected_today) ?? 0,
        samplesRejectedToday: num(today?.rejected_today) ?? 0,
        resultsReleasedToday: num(today?.released_today) ?? 0,
      },
      orders: list,
    }
  }

  // ---------------------------------------------------------------- order detail
  async orderDetail(actor: StaffActor, orderId: string) {
    const hospitalId = this.hospital(actor)
    const o = await this.labOrder(orderId, hospitalId)
    const [pat] = await this.db.query<any>(
      `SELECT p.date_of_birth, p.sex::text AS sex, b.bed_no, w.name AS ward_name, a.ip_number
         FROM identity.person p
         LEFT JOIN access.admission a ON a.id = $2
         LEFT JOIN org.bed b ON b.id = COALESCE($3::uuid, a.bed_id) LEFT JOIN org.ward w ON w.id = b.ward_id
        WHERE p.id = $1`,
      [o.patient_person_id, o.admission_id, o.bed_id],
    )
    const [doctor] = await this.db.query<any>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = $1`, [o.ordered_by_user_id])
    const tests = await this.db.query<any>(
      `SELECT i.id, i.test_code::text AS test_code, t.name, t.category, t.specimen_type, t.tube_type, t.unit, t.ref_low::float AS ref_low, t.ref_high::float AS ref_high,
              t.critical_low::float AS critical_low, t.critical_high::float AS critical_high, t.ref_text, t.fasting_required, t.tat_target_minutes, i.status, i.panel_code::text AS panel_code
         FROM lab.order_item i JOIN lab.test_catalogue t ON t.code = i.test_code WHERE i.order_id = $1 ORDER BY i.test_code`,
      [orderId],
    )
    const specimens = await this.db.query<any>(
      `SELECT s.id, s.barcode, s.tube_type, s.tube_count, s.fasting, s.status, s.collected_at, s.send_by, s.received_at, s.rejected_reason, s.rejected_at, cp.full_name AS collected_by
         FROM lab.specimen s LEFT JOIN identity.app_user cu ON cu.id = s.collected_by_user_id LEFT JOIN identity.person cp ON cp.id = cu.person_id
        WHERE s.order_id = $1 ORDER BY s.created_at`,
      [orderId],
    )
    const results = await this.resultsOfOrder(orderId)
    return {
      order: {
        id: o.id,
        orderRef: o.order_ref,
        status: o.status,
        priority: o.priority,
        details: o.details,
        orderedBy: doctor?.full_name ?? null,
        orderedAt: iso(o.created_at),
      },
      patient: {
        personId: o.patient_person_id,
        fullName: o.patient_name,
        age: ageYears(pat?.date_of_birth),
        sex: pat?.sex ?? null,
        location: pat?.bed_no ? `${pat.ward_name} · Bed ${pat.bed_no}` : 'OP / doctor app',
        ipNumber: pat?.ip_number ?? null,
      },
      tests: tests.map((t) => ({
        itemId: t.id,
        testCode: t.test_code,
        name: t.name,
        category: t.category,
        specimenType: t.specimen_type,
        tubeType: t.tube_type,
        unit: t.unit,
        refLow: t.ref_low,
        refHigh: t.ref_high,
        criticalLow: t.critical_low,
        criticalHigh: t.critical_high,
        refText: t.ref_text,
        fastingRequired: t.fasting_required,
        tatTargetMinutes: t.tat_target_minutes,
        panelCode: t.panel_code,
        status: t.status,
      })),
      specimens: specimens.map((s) => ({
        id: s.id,
        barcode: s.barcode,
        tubeType: s.tube_type,
        tubeCount: s.tube_count,
        fasting: s.fasting,
        status: s.status,
        collectedAt: iso(s.collected_at),
        collectedBy: s.collected_by,
        sendBy: iso(s.send_by),
        receivedAt: iso(s.received_at),
        rejectedReason: s.rejected_reason,
        rejectedAt: iso(s.rejected_at),
      })),
      results,
    }
  }

  private async resultsOfOrder(orderId: string) {
    const results = await this.db.query<any>(
      `SELECT r.id, r.status, r.entered_by_user_id, r.released_at, r.clinical_comment, r.awaiting_esign, r.created_at,
              ep.full_name AS entered_by, vp.full_name AS verified_by, rp.full_name AS released_by
         FROM lab.result r
         JOIN identity.app_user eu ON eu.id = r.entered_by_user_id JOIN identity.person ep ON ep.id = eu.person_id
         LEFT JOIN identity.app_user vu ON vu.id = r.verified_by_user_id LEFT JOIN identity.person vp ON vp.id = vu.person_id
         LEFT JOIN identity.app_user ru ON ru.id = r.released_by_user_id LEFT JOIN identity.person rp ON rp.id = ru.person_id
        WHERE r.order_id = $1 ORDER BY r.created_at`,
      [orderId],
    )
    if (results.length === 0) return []
    const values = await this.db.query<any>(
      `SELECT v.id, v.result_id, v.test_code::text AS test_code, t.name, v.unit, v.value_num::float AS value_num, v.value_text,
              v.ref_low::float AS ref_low, v.ref_high::float AS ref_high, v.flag, v.is_critical, v.delta_prev::float AS delta_prev,
              (SELECT pv.value_num::float FROM lab.result_value pv WHERE pv.id = v.prev_value_id) AS prev_value
         FROM lab.result_value v JOIN lab.test_catalogue t ON t.code = v.test_code
        WHERE v.result_id = ANY($1::uuid[]) ORDER BY t.category, v.test_code`,
      [results.map((r) => r.id)],
    )
    return results.map((r) => ({
      id: r.id,
      status: r.status,
      enteredBy: r.entered_by,
      verifiedBy: r.verified_by,
      releasedBy: r.released_by,
      releasedAt: iso(r.released_at),
      clinicalComment: r.clinical_comment,
      awaitingEsign: r.awaiting_esign,
      createdAt: iso(r.created_at),
      values: values
        .filter((v) => v.result_id === r.id)
        .map((v): LabResultValueRow & { prevValue: number | null } => ({
          id: v.id,
          testCode: v.test_code,
          testName: v.name,
          unit: v.unit,
          valueNum: v.value_num,
          valueText: v.value_text,
          refLow: v.ref_low,
          refHigh: v.ref_high,
          flag: v.flag,
          isCritical: v.is_critical,
          deltaPrev: v.delta_prev,
          prevValue: v.prev_value,
        })),
    }))
  }

  // ---------------------------------------------------------------- accept / reject
  async acceptOrder(actor: StaffActor, orderId: string) {
    const o = await this.labOrder(orderId, this.hospital(actor))
    if (o.status !== 'open') throw new ConflictException({ success: false, errorMessage: `Order is already ${o.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_order SET status = 'accepted', accepted_by_user_id = $2, accepted_at = util.demo_now(), assigned_to_user_id = $2 WHERE id = $1`, [orderId, actor.userId])
      await this.ctx.audit(c, 'lab.order.accept', { entityType: 'records.clinical_order', entityId: orderId, patientPersonId: o.patient_person_id })
    })
    return { id: orderId, status: 'accepted' }
  }

  async rejectOrder(actor: StaffActor, orderId: string, dto: StaffRejectRequest) {
    const o = await this.labOrder(orderId, this.hospital(actor))
    if (!['open', 'accepted'].includes(o.status)) throw new ConflictException({ success: false, errorMessage: `Order is already ${o.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE records.clinical_order SET status = 'rejected', rejected_reason = $2, accepted_by_user_id = $3, accepted_at = util.demo_now() WHERE id = $1`, [orderId, dto.reason, actor.userId])
      await this.ctx.emitEvent(c, actor, {
        type: 'message',
        toRoles: ['doctor'],
        toUserId: o.ordered_by_user_id,
        title: `Lab order declined · ${o.order_ref}`,
        text: `${actor.fullName}: ${dto.reason}`,
        href: '/doctor/orders',
        entityType: 'records.clinical_order',
        entityId: orderId,
        patientPersonId: o.patient_person_id,
      })
      await this.ctx.audit(c, 'lab.order.reject', { entityType: 'records.clinical_order', entityId: orderId, patientPersonId: o.patient_person_id })
    })
    return { id: orderId, status: 'rejected' }
  }

  // ---------------------------------------------------------------- specimens
  async collectSpecimen(actor: StaffActor, orderId: string, dto: CollectSpecimenRequest) {
    const o = await this.labOrder(orderId, this.hospital(actor))
    if (!['open', 'accepted', 'in_progress'].includes(o.status)) throw new ConflictException({ success: false, errorMessage: `Order is ${o.status}` })
    const digits = String(o.order_ref).replace(/\D/g, '')
    const barcode = dto.barcode ?? `LO-${digits}-${String(randomInt(0, 10000)).padStart(4, '0')}`
    return this.ctx.tx(actor, async (c) => {
      const s = await c.query(
        `INSERT INTO lab.specimen (order_id, patient_person_id, barcode, tube_type, tube_count, fasting, status, collected_by_user_id, collected_at, send_by)
         VALUES ($1,$2,$3,$4,$5,$6,'collected',$7,util.demo_now(),$8) RETURNING id, barcode, collected_at`,
        [orderId, o.patient_person_id, barcode, dto.tubeType ?? null, dto.tubeCount, dto.fasting ?? null, actor.userId, dto.sendBy ?? null],
      )
      await c.query(`UPDATE lab.order_item SET status = 'collected' WHERE order_id = $1 AND status = 'ordered'`, [orderId])
      await c.query(
        `UPDATE records.clinical_order SET status = 'in_progress', accepted_by_user_id = COALESCE(accepted_by_user_id, $2), accepted_at = COALESCE(accepted_at, util.demo_now()), assigned_to_user_id = COALESCE(assigned_to_user_id, $2) WHERE id = $1 AND status::text IN ('open','accepted')`,
        [orderId, actor.userId],
      )
      await this.ctx.audit(c, 'lab.specimen.collect', { entityType: 'lab.specimen', entityId: s.rows[0].id, patientPersonId: o.patient_person_id })
      return { id: s.rows[0].id as string, barcode: s.rows[0].barcode as string, status: 'collected', collectedAt: iso(s.rows[0].collected_at) }
    })
  }

  private async specimen(specimenId: string, hospitalId: string) {
    const r = await this.db.query<any>(
      `SELECT s.id, s.status, s.order_id, s.patient_person_id, o.ordered_by_user_id, o.order_ref
         FROM lab.specimen s JOIN records.clinical_order o ON o.id = s.order_id WHERE s.id = $1 AND o.hospital_id = $2`,
      [specimenId, hospitalId],
    )
    if (!r[0]) notFound('Specimen')
    return r[0]
  }

  async receiveSpecimen(actor: StaffActor, specimenId: string) {
    const s = await this.specimen(specimenId, this.hospital(actor))
    if (s.status !== 'collected') throw new ConflictException({ success: false, errorMessage: `Specimen is ${s.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE lab.specimen SET status = 'in_lab', received_at = util.demo_now() WHERE id = $1`, [specimenId])
      await this.ctx.audit(c, 'lab.specimen.receive', { entityType: 'lab.specimen', entityId: specimenId, patientPersonId: s.patient_person_id })
    })
    return { id: specimenId, status: 'in_lab' }
  }

  async rejectSpecimen(actor: StaffActor, specimenId: string, dto: StaffRejectRequest) {
    const s = await this.specimen(specimenId, this.hospital(actor))
    if (!['pending', 'collected', 'in_lab'].includes(s.status)) throw new ConflictException({ success: false, errorMessage: `Specimen is ${s.status}` })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE lab.specimen SET status = 'rejected', rejected_reason = $2, rejected_at = util.demo_now() WHERE id = $1`, [specimenId, dto.reason])
      await c.query(`UPDATE lab.order_item SET status = 'ordered' WHERE order_id = $1 AND status = 'collected'`, [s.order_id])
      await this.ctx.emitEvent(c, actor, {
        type: 'message',
        toRoles: ['doctor'],
        toUserId: s.ordered_by_user_id,
        title: `Sample rejected · ${s.order_ref}`,
        text: `${actor.fullName}: ${dto.reason}. A new sample is needed.`,
        href: '/doctor/orders',
        entityType: 'lab.specimen',
        entityId: specimenId,
        patientPersonId: s.patient_person_id,
      })
      await this.ctx.audit(c, 'lab.specimen.reject', { entityType: 'lab.specimen', entityId: specimenId, patientPersonId: s.patient_person_id, details: { reason: dto.reason } })
    })
    return { id: specimenId, status: 'rejected' }
  }

  // ---------------------------------------------------------------- results
  async enterResults(actor: StaffActor, orderId: string, dto: ResultEntryRequest) {
    const hospitalId = this.hospital(actor)
    const o = await this.labOrder(orderId, hospitalId)
    if (!['open', 'accepted', 'in_progress'].includes(o.status)) throw new ConflictException({ success: false, errorMessage: `Order is ${o.status}` })

    const codes = [...new Set(dto.values.map((v) => v.testCode.toUpperCase()))]
    if (codes.length !== dto.values.length) throw new BadRequestException({ success: false, errorMessage: 'Each test can appear once' })
    const known = await this.db.query<{ code: string }>('SELECT code::text AS code FROM lab.test_catalogue WHERE is_active AND code = ANY($1::citext[])', [codes])
    const unknown = codes.filter((c) => !known.some((k) => k.code.toUpperCase() === c))
    if (unknown.length) throw new BadRequestException({ success: false, errorMessage: `Unknown test code(s): ${unknown.join(', ')}` })

    const resultId = await this.ctx.tx(actor, async (c) => {
      let res = (await c.query(`SELECT id, status FROM lab.result WHERE order_id = $1 AND status IN ('draft','preliminary','verified') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [orderId])).rows[0]
      if (!res) {
        res = (
          await c.query(`INSERT INTO lab.result (order_id, patient_person_id, status, entered_by_user_id, clinical_comment) VALUES ($1,$2,'draft',$3,$4) RETURNING id, status`, [orderId, o.patient_person_id, actor.userId, dto.clinicalComment ?? null])
        ).rows[0]
      } else if (res.status === 'verified') {
        // New values after verification: the result goes back to draft and must be verified again.
        await c.query(`UPDATE lab.result SET status = 'draft', verified_by_user_id = NULL WHERE id = $1`, [res.id])
      }
      if (dto.clinicalComment !== undefined) await c.query(`UPDATE lab.result SET clinical_comment = $2 WHERE id = $1`, [res.id, dto.clinicalComment])
      for (const v of dto.values) {
        const code = v.testCode.toUpperCase()
        await c.query(
          `INSERT INTO lab.order_item (order_id, patient_person_id, test_code, status) VALUES ($1,$2,$3,'collected') ON CONFLICT (order_id, test_code) DO NOTHING`,
          [orderId, o.patient_person_id, code],
        )
        await c.query(
          `INSERT INTO lab.result_value (result_id, test_code, value_num, value_text) VALUES ($1,$2,$3,$4)
           ON CONFLICT (result_id, test_code) DO UPDATE
             SET value_num = EXCLUDED.value_num, value_text = EXCLUDED.value_text, flag = NULL, prev_value_id = NULL, delta_prev = NULL`,
          [res.id, code, v.valueNum ?? null, v.valueText ?? null],
        )
      }
      await c.query(
        `UPDATE records.clinical_order SET status = 'in_progress', accepted_by_user_id = COALESCE(accepted_by_user_id, $2), accepted_at = COALESCE(accepted_at, util.demo_now()) WHERE id = $1 AND status::text IN ('open','accepted')`,
        [orderId, actor.userId],
      )
      await this.ctx.audit(c, 'lab.result.save', { entityType: 'lab.result', entityId: res.id, patientPersonId: o.patient_person_id })
      if (dto.action === 'verify' || dto.action === 'release') await this.transition(c, actor, o, res.id, 'verify')
      if (dto.action === 'release') await this.transition(c, actor, o, res.id, 'release')
      return res.id as string
    })
    return { resultId, ...(await this.resultView(resultId)) }
  }

  private async resultView(resultId: string) {
    const r = await this.db.query<any>('SELECT order_id FROM lab.result WHERE id = $1', [resultId])
    const results = await this.resultsOfOrder(r[0].order_id)
    const result = results.find((x) => x.id === resultId)!
    return { result, criticalValues: result.values.filter((v) => v.isCritical) }
  }

  async verifyResult(actor: StaffActor, resultId: string) {
    return this.stage(actor, resultId, 'verify')
  }
  async releaseResult(actor: StaffActor, resultId: string) {
    return this.stage(actor, resultId, 'release')
  }

  private async stage(actor: StaffActor, resultId: string, to: 'verify' | 'release') {
    const hospitalId = this.hospital(actor)
    const rows = await this.db.query<any>(
      `SELECT r.id, r.order_id, r.status FROM lab.result r JOIN records.clinical_order o ON o.id = r.order_id WHERE r.id = $1 AND o.hospital_id = $2`,
      [resultId, hospitalId],
    )
    if (!rows[0]) notFound('Result')
    const o = await this.labOrder(rows[0].order_id, hospitalId)
    await this.ctx.tx(actor, async (c) => {
      if (to === 'release' && rows[0].status === 'draft') await this.transition(c, actor, o, resultId, 'verify')
      await this.transition(c, actor, o, resultId, to)
    })
    return { resultId, ...(await this.resultView(resultId)) }
  }

  /** draft -> verified -> released. Release closes the order and tells the ordering doctor (and the patient when nothing is critical). */
  private async transition(c: PoolClient, actor: StaffActor, o: any, resultId: string, to: 'verify' | 'release') {
    const res = (await c.query('SELECT id, status FROM lab.result WHERE id = $1 FOR UPDATE', [resultId])).rows[0]
    if (to === 'verify') {
      if (res.status === 'verified') return
      if (!['draft', 'preliminary'].includes(res.status)) throw new ConflictException({ success: false, errorMessage: `Result is already ${res.status}` })
      await this.assertComplete(c, o.id, resultId)
      await c.query(`UPDATE lab.result SET status = 'verified', verified_by_user_id = $2 WHERE id = $1`, [resultId, actor.userId])
      await this.ctx.audit(c, 'lab.result.verify', { entityType: 'lab.result', entityId: resultId, patientPersonId: o.patient_person_id })
      return
    }
    if (res.status !== 'verified') throw new ConflictException({ success: false, errorMessage: 'Verify the result before releasing it' })
    await c.query(
      `UPDATE lab.result SET status = 'released', released_at = util.demo_now(), released_by_user_id = $2, delivered_to_doctor_at = util.demo_now() WHERE id = $1`,
      [resultId, actor.userId],
    )
    await c.query(`UPDATE lab.order_item SET status = 'resulted' WHERE order_id = $1 AND test_code IN (SELECT test_code FROM lab.result_value WHERE result_id = $2)`, [o.id, resultId])
    await c.query(`UPDATE lab.specimen SET status = 'done' WHERE order_id = $1 AND status IN ('collected','in_lab')`, [o.id])
    await c.query(
      `UPDATE records.clinical_order SET status = 'done', completed_by_user_id = $2, completed_at = util.demo_now() WHERE id = $1`,
      [o.id, actor.userId],
    )
    const vals = (
      await c.query(
        `SELECT v.id, v.test_code::text AS test_code, t.name, v.value_num::float AS value_num, v.value_text, v.unit, v.flag, v.is_critical
           FROM lab.result_value v JOIN lab.test_catalogue t ON t.code = v.test_code WHERE v.result_id = $1 ORDER BY v.test_code`,
        [resultId],
      )
    ).rows
    const critical = vals.filter((v: any) => v.is_critical)
    const abnormal = vals.filter((v: any) => v.flag && v.flag !== 'N').length
    const names = vals.map((v: any) => v.test_code).join(', ')
    const dtext = `${o.patient_name} · ${o.order_ref} · ${abnormal} flagged · released by ${actor.fullName}`
    if (critical.length) {
      const first = critical[0]
      const ev = await this.ctx.emitEvent(c, actor, {
        type: 'lab-result',
        toRoles: ['doctor'],
        toUserId: o.ordered_by_user_id,
        title: `CRITICAL value · ${first.test_code} ${first.value_num ?? first.value_text}${first.unit ? ' ' + first.unit : ''}`,
        text: `${dtext}. A phone call with read-back is required.`,
        href: '/doctor/results',
        entityType: 'lab.result',
        entityId: resultId,
        patientPersonId: o.patient_person_id,
      })
      for (const v of critical) {
        await c.query(
          `INSERT INTO records.clinical_alert (kind, severity, patient_person_id, hospital_id, target_user_id, title, detail, source_table, source_id, event_id)
           VALUES ('critical_lab','critical',$1,$2,$3,$4,$5,'lab.result_value',$6,$7)`,
          [o.patient_person_id, actor.hospitalId, o.ordered_by_user_id, `Critical ${v.test_code} ${v.value_num ?? v.value_text}`, `${o.order_ref} · ${o.patient_name}`, v.id, ev],
        )
      }
    } else {
      await this.ctx.emitEvent(c, actor, {
        type: 'lab-result',
        toRoles: ['doctor'],
        toUserId: o.ordered_by_user_id,
        title: `Result ready · ${names}`,
        text: dtext,
        href: '/doctor/results',
        entityType: 'lab.result',
        entityId: resultId,
        patientPersonId: o.patient_person_id,
      })
      // The patient sees released results; critical ones wait for the doctor's call first.
      await this.ctx.emitEvent(c, actor, {
        type: 'lab-result',
        toRoles: ['citizen'],
        title: `Result ready · ${names}`,
        text: `${o.order_ref} · released by the lab`,
        href: '/citizen/documents',
        entityType: 'lab.result',
        entityId: resultId,
        patientPersonId: o.patient_person_id,
      })
      await c.query('UPDATE lab.result SET delivered_to_patient_at = util.demo_now() WHERE id = $1', [resultId])
    }
    await this.ctx.audit(c, 'lab.result.release', { entityType: 'lab.result', entityId: resultId, patientPersonId: o.patient_person_id, details: { critical: critical.length } })
  }

  /** Every test on the order must have a value before verify / release. */
  private async assertComplete(c: PoolClient, orderId: string, resultId: string) {
    const missing = (
      await c.query(
        `SELECT i.test_code::text AS test_code FROM lab.order_item i
          WHERE i.order_id = $1 AND i.status <> 'cancelled'
            AND NOT EXISTS (SELECT 1 FROM lab.result_value v WHERE v.result_id = $2 AND v.test_code = i.test_code)`,
        [orderId, resultId],
      )
    ).rows
    if (missing.length) throw new ConflictException({ success: false, errorMessage: `Values are missing for: ${missing.map((m: any) => m.test_code).join(', ')}` })
    const n = (await c.query('SELECT count(*)::int AS n FROM lab.result_value WHERE result_id = $1', [resultId])).rows[0].n
    if (n === 0) throw new ConflictException({ success: false, errorMessage: 'No values entered' })
  }

  async recentResults(actor: StaffActor, hours = 24) {
    const rows = await this.db.query<any>(
      `SELECT r.id, r.status, r.released_at, o.order_ref, p.full_name AS patient_name,
              (SELECT string_agg(v.test_code::text, ', ' ORDER BY v.test_code) FROM lab.result_value v WHERE v.result_id = r.id) AS tests,
              EXISTS (SELECT 1 FROM lab.result_value v WHERE v.result_id = r.id AND v.is_critical) AS has_critical
         FROM lab.result r JOIN records.clinical_order o ON o.id = r.order_id JOIN identity.person p ON p.id = r.patient_person_id
        WHERE o.hospital_id = $1 AND r.status IN ('released','amended') AND r.released_at >= util.demo_now() - ($2::int * interval '1 hour')
        ORDER BY r.released_at DESC LIMIT 50`,
      [this.hospital(actor), hours],
    )
    return rows.map((r) => ({ resultId: r.id, orderRef: r.order_ref, patientName: r.patient_name, tests: r.tests, releasedAt: iso(r.released_at), hasCritical: r.has_critical }))
  }

  // ---------------------------------------------------------------- catalogue
  async catalogue() {
    const [tests, panels] = await Promise.all([
      this.db.query<any>(
        `SELECT code::text AS code, name, category, specimen_type, tube_type, unit, ref_low::float AS ref_low, ref_high::float AS ref_high,
                critical_low::float AS critical_low, critical_high::float AS critical_high, ref_text, tat_target_minutes, fasting_required, loinc
           FROM lab.test_catalogue WHERE is_active ORDER BY category, name`,
      ),
      this.db.query<any>(
        `SELECT p.code::text AS code, p.name, array_agg(pt.test_code::text ORDER BY pt.sort_order) AS tests
           FROM lab.panel p JOIN lab.panel_test pt ON pt.panel_code = p.code WHERE p.is_active GROUP BY p.code, p.name ORDER BY p.name`,
      ),
    ])
    return {
      tests: tests.map((t) => ({
        code: t.code, name: t.name, category: t.category, specimenType: t.specimen_type, tubeType: t.tube_type, unit: t.unit,
        refLow: t.ref_low, refHigh: t.ref_high, criticalLow: t.critical_low, criticalHigh: t.critical_high, refText: t.ref_text,
        tatTargetMinutes: t.tat_target_minutes, fastingRequired: t.fasting_required, loinc: t.loinc,
      })),
      panels: panels.map((p) => ({ code: p.code, name: p.name, tests: p.tests })),
    }
  }

  // ---------------------------------------------------------------- critical values
  async critical(actor: StaffActor) {
    const hospitalId = this.hospital(actor)
    const [uncalled, calls] = await Promise.all([
      this.db.query<any>(
        `SELECT u.result_value_id, u.test_code::text AS test_code, t.name, u.value_num::float AS value_num, u.flag, u.created_at, o.order_ref, o.ordered_by_user_id,
                p.full_name AS patient_name, dp.full_name AS doctor_name, b.bed_no, v.unit
           FROM lab.v_critical_uncalled u
           JOIN records.clinical_order o ON o.id = u.order_id
           JOIN identity.person p ON p.id = u.patient_person_id
           JOIN lab.result_value v ON v.id = u.result_value_id
           JOIN lab.test_catalogue t ON t.code = u.test_code
           JOIN identity.app_user du ON du.id = o.ordered_by_user_id JOIN identity.person dp ON dp.id = du.person_id
           LEFT JOIN access.admission a ON a.id = o.admission_id LEFT JOIN org.bed b ON b.id = COALESCE(o.bed_id, a.bed_id)
          WHERE o.hospital_id = $1 AND o.order_type::text = 'lab' AND (SELECT status FROM lab.result WHERE id = v.result_id) IN ('released','amended')
          ORDER BY u.created_at DESC LIMIT 50`,
        [hospitalId],
      ),
      this.db.query<any>(
        `SELECT c.id, c.result_value_id, c.called_at, c.called_to_name, c.called_to_user_id, c.read_back_confirmed, c.read_back_at, c.note,
                v.test_code::text AS test_code, v.value_num::float AS value_num, v.unit, p.full_name AS patient_name, cp.full_name AS called_by, tp.full_name AS called_to_user_name
           FROM lab.critical_call c
           JOIN lab.result_value v ON v.id = c.result_value_id
           JOIN lab.result r ON r.id = v.result_id JOIN records.clinical_order o ON o.id = r.order_id
           JOIN identity.person p ON p.id = c.patient_person_id
           JOIN identity.app_user cu ON cu.id = c.called_by_user_id JOIN identity.person cp ON cp.id = cu.person_id
           LEFT JOIN identity.app_user tu ON tu.id = c.called_to_user_id LEFT JOIN identity.person tp ON tp.id = tu.person_id
          WHERE o.hospital_id = $1 AND c.called_at >= util.demo_now() - interval '7 days'
          ORDER BY c.called_at DESC LIMIT 100`,
        [hospitalId],
      ),
    ])
    return {
      uncalled: uncalled.map((u) => ({
        resultValueId: u.result_value_id,
        orderRef: u.order_ref,
        patientName: u.patient_name,
        bedNo: u.bed_no,
        testCode: u.test_code,
        testName: u.name,
        valueNum: u.value_num,
        unit: u.unit,
        flag: u.flag,
        since: iso(u.created_at),
        callDoctor: { userId: u.ordered_by_user_id, name: u.doctor_name },
      })),
      calls: calls.map((c) => ({
        id: c.id,
        resultValueId: c.result_value_id,
        patientName: c.patient_name,
        testCode: c.test_code,
        valueNum: c.value_num,
        unit: c.unit,
        calledAt: iso(c.called_at),
        calledBy: c.called_by,
        calledTo: c.called_to_user_name ?? c.called_to_name,
        calledToUserId: c.called_to_user_id,
        readBackConfirmed: c.read_back_confirmed,
        readBackAt: iso(c.read_back_at),
        note: c.note,
      })),
    }
  }

  async logCriticalCall(actor: StaffActor, dto: CriticalCallRequest) {
    const hospitalId = this.hospital(actor)
    const rows = await this.db.query<any>(
      `SELECT v.id, v.is_critical, r.patient_person_id FROM lab.result_value v JOIN lab.result r ON r.id = v.result_id
         JOIN records.clinical_order o ON o.id = r.order_id WHERE v.id = $1 AND o.hospital_id = $2`,
      [dto.resultValueId, hospitalId],
    )
    if (!rows[0]) notFound('Result value')
    if (!rows[0].is_critical) throw new BadRequestException({ success: false, errorMessage: 'That value is not critical' })
    if (dto.calledToUserId) {
      const ok = await this.db.query(
        `SELECT 1 FROM identity.app_user u WHERE u.id = $1 AND u.status = 'active' AND u.account_type IN ('doctor','staff')
           AND (EXISTS (SELECT 1 FROM identity.doctor_profile d WHERE d.user_id = u.id AND d.hospital_id = $2)
             OR EXISTS (SELECT 1 FROM identity.staff_profile s WHERE s.user_id = u.id AND s.hospital_id = $2))`,
        [dto.calledToUserId, hospitalId],
      )
      if (ok.length === 0) throw new BadRequestException({ success: false, errorMessage: 'The person who took the call must be a doctor or nurse at your hospital' })
    }
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO lab.critical_call (result_value_id, patient_person_id, called_by_user_id, called_to_user_id, called_to_name, note, read_back_confirmed, read_back_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 THEN util.demo_now() END) RETURNING id, called_at`,
        [dto.resultValueId, rows[0].patient_person_id, actor.userId, dto.calledToUserId ?? null, dto.calledToName ?? null, dto.note ?? null, dto.readBackConfirmed],
      )
      await this.ctx.audit(c, 'lab.critical.call', { entityType: 'lab.critical_call', entityId: r.rows[0].id, patientPersonId: rows[0].patient_person_id })
      return { id: r.rows[0].id as string, calledAt: iso(r.rows[0].called_at), readBackConfirmed: dto.readBackConfirmed }
    })
  }

  async ackCriticalCall(actor: StaffActor, callId: string, dto: ReadBackRequest) {
    const hospitalId = this.hospital(actor)
    const rows = await this.db.query<any>(
      `SELECT c.id, c.read_back_confirmed, c.patient_person_id FROM lab.critical_call c
         JOIN lab.result_value v ON v.id = c.result_value_id JOIN lab.result r ON r.id = v.result_id JOIN records.clinical_order o ON o.id = r.order_id
        WHERE c.id = $1 AND o.hospital_id = $2`,
      [callId, hospitalId],
    )
    if (!rows[0]) notFound('Critical call')
    if (rows[0].read_back_confirmed) throw new ConflictException({ success: false, errorMessage: 'Read-back is already confirmed' })
    await this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE lab.critical_call SET read_back_confirmed = true, read_back_at = util.demo_now(), note = COALESCE($2, note) WHERE id = $1`, [callId, dto.note ?? null])
      await this.ctx.audit(c, 'lab.critical.ack', { entityType: 'lab.critical_call', entityId: callId, patientPersonId: rows[0].patient_person_id })
    })
    return { id: callId, readBackConfirmed: true }
  }

  // ---------------------------------------------------------------- QC and instruments
  async instruments(actor: StaffActor) {
    const rows = await this.db.query<any>(
      `SELECT id, name, kind, model, serial_no, status, last_calibrated_at, next_calibration_due, location FROM lab.instrument WHERE hospital_id = $1 ORDER BY name`,
      [this.hospital(actor)],
    )
    return rows.map((i) => ({
      id: i.id, name: i.name, kind: i.kind, model: i.model, serialNo: i.serial_no, status: i.status,
      lastCalibratedAt: iso(i.last_calibrated_at), nextCalibrationDue: dateStr(i.next_calibration_due), location: i.location,
    }))
  }

  async setInstrumentStatus(actor: StaffActor, instrumentId: string, dto: InstrumentStatusRequest) {
    const r = await this.db.query<any>('SELECT id, status FROM lab.instrument WHERE id = $1 AND hospital_id = $2', [instrumentId, this.hospital(actor)])
    if (!r[0]) notFound('Instrument')
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `UPDATE lab.instrument SET status = $2,
                last_calibrated_at = CASE WHEN $3 = 'calibrating' AND $2 = 'ok' THEN util.demo_now() ELSE last_calibrated_at END,
                next_calibration_due = COALESCE($4::date, next_calibration_due)
          WHERE id = $1`,
        [instrumentId, dto.status, r[0].status, dto.nextCalibrationDue ?? null],
      )
      await this.ctx.audit(c, 'lab.instrument.status', { entityType: 'lab.instrument', entityId: instrumentId, details: { from: r[0].status, to: dto.status } })
    })
    return { id: instrumentId, status: dto.status }
  }

  async reagentLots(actor: StaffActor) {
    const rows = await this.db.query<any>(
      `SELECT l.id, l.reagent, l.lot_no, l.opened_at, l.expiry_date, l.status, i.name AS instrument
         FROM lab.reagent_lot l LEFT JOIN lab.instrument i ON i.id = l.instrument_id WHERE l.hospital_id = $1 ORDER BY l.expiry_date`,
      [this.hospital(actor)],
    )
    return rows.map((l) => ({ id: l.id, reagent: l.reagent, lotNo: l.lot_no, openedAt: dateStr(l.opened_at), expiryDate: dateStr(l.expiry_date), status: l.status, instrument: l.instrument }))
  }

  async qc(actor: StaffActor, days = 7) {
    const hospitalId = this.hospital(actor)
    const runs = await this.db.query<any>(
      `SELECT q.id, q.run_at, q.test_code::text AS test_code, t.name AS test_name, q.qc_level, q.value_num::float AS value_num, q.target_mean::float AS target_mean,
              q.target_sd::float AS target_sd, q.z_score::float AS z_score, q.westgard_rule, q.accepted, q.comment, i.name AS instrument, i.id AS instrument_id, t.unit
         FROM lab.qc_run q JOIN lab.instrument i ON i.id = q.instrument_id JOIN lab.test_catalogue t ON t.code = q.test_code
        WHERE i.hospital_id = $1 AND q.run_at >= util.demo_now() - ($2::int * interval '1 day')
        ORDER BY q.run_at DESC LIMIT 300`,
      [hospitalId, days],
    )
    const mapRun = (q: any) => ({
      id: q.id, runAt: iso(q.run_at), testCode: q.test_code, testName: q.test_name, unit: q.unit, qcLevel: q.qc_level, valueNum: q.value_num,
      targetMean: q.target_mean, targetSd: q.target_sd, zScore: q.z_score, westgardRule: q.westgard_rule, accepted: q.accepted,
      result: !q.accepted ? 'reject' : q.westgard_rule ? 'warning' : 'pass', comment: q.comment, instrument: q.instrument, instrumentId: q.instrument_id,
    })
    const today = runs.filter((q) => new Date(q.run_at).getTime() >= demoNowMs() - 24 * 3600_000)
    const series: Record<string, ReturnType<typeof mapRun>[]> = {}
    for (const q of runs) {
      const k = `${q.instrument_id}|${q.test_code}|${q.qc_level}`
      ;(series[k] ??= []).push(mapRun(q))
    }
    return {
      summary: {
        runsLast24h: today.length,
        passedLast24h: today.filter((q) => q.accepted && !q.westgard_rule).length,
        warnings: runs.filter((q) => q.accepted && q.westgard_rule).length,
        rejected: runs.filter((q) => !q.accepted).length,
      },
      runs: runs.map(mapRun),
      series: Object.entries(series).map(([key, points]) => ({ key, instrument: points[0]!.instrument, testCode: points[0]!.testCode, qcLevel: points[0]!.qcLevel, points: points.slice(0, 30).reverse() })),
      instruments: await this.instruments(actor),
      reagentLots: await this.reagentLots(actor),
    }
  }

  async recordQc(actor: StaffActor, dto: QcRunRequest) {
    const hospitalId = this.hospital(actor)
    const inst = await this.db.query<any>('SELECT id, status FROM lab.instrument WHERE id = $1 AND hospital_id = $2', [dto.instrumentId, hospitalId])
    if (!inst[0]) notFound('Instrument')
    const test = await this.db.query('SELECT 1 FROM lab.test_catalogue WHERE code = $1', [dto.testCode.toUpperCase()])
    if (test.length === 0) throw new BadRequestException({ success: false, errorMessage: 'Unknown test code' })
    if (dto.reagentLotId) {
      const lot = await this.db.query('SELECT 1 FROM lab.reagent_lot WHERE id = $1 AND hospital_id = $2', [dto.reagentLotId, hospitalId])
      if (lot.length === 0) notFound('Reagent lot')
    }
    return this.ctx.tx(actor, async (c) => {
      const r = await c.query(
        `INSERT INTO lab.qc_run (instrument_id, test_code, reagent_lot_id, qc_level, run_by_user_id, value_num, target_mean, target_sd, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, z_score::float AS z_score, westgard_rule, accepted`,
        [dto.instrumentId, dto.testCode.toUpperCase(), dto.reagentLotId ?? null, dto.qcLevel, actor.userId, dto.valueNum, dto.targetMean, dto.targetSd, dto.comment ?? null],
      )
      const q = r.rows[0]
      await this.ctx.audit(c, 'lab.qc.run', { entityType: 'lab.qc_run', entityId: q.id, details: { accepted: q.accepted, rule: q.westgard_rule } })
      return {
        id: q.id as string,
        zScore: q.z_score as number,
        westgardRule: q.westgard_rule as string | null,
        accepted: q.accepted as boolean,
        result: !q.accepted ? 'reject' : q.westgard_rule ? 'warning' : 'pass',
        message: !q.accepted ? 'QC rejected (1-3s). Do not release patient results for this test until the run is repeated and passes.' : q.westgard_rule ? 'Warning (1-2s). Check the next run before releasing.' : 'In control.',
      }
    })
  }

  // ---------------------------------------------------------------- turnaround
  async tat(actor: StaffActor, days = 7) {
    const hospitalId = this.hospital(actor)
    const byPriority = await this.db.query<any>(
      `SELECT priority::text AS priority, count(*)::int AS n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY tat_minutes)::float AS median_minutes
         FROM lab.v_order_tat WHERE hospital_id = $1 AND released_at >= util.demo_now() - ($2::int * interval '1 day') AND tat_minutes IS NOT NULL
        GROUP BY priority::text`,
      [hospitalId, days],
    )
    const within = await this.db.query<any>(
      `SELECT priority::text AS priority, count(*)::int AS n,
              count(*) FILTER (WHERE tat_minutes <= CASE priority::text WHEN 'stat' THEN 60 WHEN 'urgent' THEN 120 ELSE 240 END)::int AS ok
         FROM lab.v_order_tat WHERE hospital_id = $1 AND released_at >= util.demo_now() - ($2::int * interval '1 day') AND tat_minutes IS NOT NULL GROUP BY priority::text`,
      [hospitalId, days],
    )
    const daily = await this.db.query<any>(
      `SELECT (released_at AT TIME ZONE 'Asia/Kolkata')::date AS day, percentile_cont(0.5) WITHIN GROUP (ORDER BY tat_minutes)::float AS median_minutes, count(*)::int AS n
         FROM lab.v_order_tat WHERE hospital_id = $1 AND priority::text = 'stat' AND released_at >= util.demo_now() - ($2::int * interval '1 day') AND tat_minutes IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      [hospitalId, days],
    )
    const slowest = await this.db.query<any>(
      `SELECT i.test_code::text AS test_code, t.name, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY tt.tat_minutes)::float AS median_minutes
         FROM lab.v_order_tat tt JOIN lab.order_item i ON i.order_id = tt.order_id JOIN lab.test_catalogue t ON t.code = i.test_code
        WHERE tt.hospital_id = $1 AND tt.released_at >= util.demo_now() - ($2::int * interval '1 day') AND tt.tat_minutes IS NOT NULL
        GROUP BY i.test_code, t.name ORDER BY median_minutes DESC LIMIT 5`,
      [hospitalId, days],
    )
    const [rej] = await this.db.query<any>(
      `SELECT count(*) FILTER (WHERE s.status = 'rejected')::int AS rejected, count(*)::int AS total
         FROM lab.specimen s JOIN records.clinical_order o ON o.id = s.order_id
        WHERE o.hospital_id = $1 AND s.created_at >= util.demo_now() - ($2::int * interval '1 day')`,
      [hospitalId, days],
    )
    const totalN = within.reduce((s, r) => s + r.n, 0)
    const okN = within.reduce((s, r) => s + r.ok, 0)
    return {
      windowDays: days,
      targetsMinutes: TAT_TARGET_MIN,
      byPriority: byPriority.map((r) => ({ priority: r.priority, orders: r.n, medianMinutes: r.median_minutes, targetMinutes: TAT_TARGET_MIN[r.priority] ?? null })),
      withinTargetPercent: totalN ? Math.round((100 * okN) / totalN) : null,
      statMedianByDay: daily.map((d) => ({ day: dateStr(d.day), medianMinutes: d.median_minutes, orders: d.n })),
      slowestTests: slowest.map((s) => ({ testCode: s.test_code, testName: s.name, orders: s.n, medianMinutes: s.median_minutes })),
      rejectedSamplePercent: rej && rej.total ? Math.round((1000 * rej.rejected) / rej.total) / 10 : 0,
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
          `Simulated AI draft (needs your review): ${w.kpis.openOrders} open orders (${w.kpis.statOrders} STAT), ${w.kpis.awaitingSample} awaiting sample, ` +
          `${w.kpis.toVerify} to verify, ${w.kpis.samplesRejectedToday} sample(s) rejected today. Decision support only.`,
        items: w.orders.filter((o) => o.priority === 'stat').map((o) => ({ orderId: o.orderId, flag: 'watch' as const, note: `${o.orderRef} ${o.tests} (${o.patientName}) is STAT and still open.` })),
      }
    }
    return this.handovers.create(actor, dto, draft)
  }
}
