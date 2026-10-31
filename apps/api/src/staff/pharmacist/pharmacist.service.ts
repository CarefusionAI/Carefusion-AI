import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { createHash } from 'node:crypto'
import { DatabaseService } from '../../database/database.service'
import { StaffActor, StaffContextService } from '../common/staff-context.service'
import type {
  CollectedRequest,
  CounterStateRequest,
  DispenseRequest,
  PharmacyStockBatch,
  PharmacyWardRequestDecision,
  RecallConfirmRequest,
  RxCheckResult,
  StockActionRequest,
} from '../common/shared'
import { ageYears, decodeDemoBytes, forbidden, iso, notFound, num, dateStr } from '../common/staff.util'
import { demoNowMs } from '../common/demo-clock'
import { neutraliseCsvText } from '../../csv'

const UNRESOLVED = ['issued', 'partly_dispensed']

@Injectable()
export class PharmacistService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ctx: StaffContextService,
  ) {}

  private pharmacy(actor: StaffActor): string {
    if (!actor.pharmacyId) forbidden('Your profile has no pharmacy')
    return actor.pharmacyId!
  }

  // ---------------------------------------------------------------- profile, counter
  async me(actor: StaffActor) {
    const pharmacyId = this.pharmacy(actor)
    const [ph] = await this.db.query<any>(
      `SELECT ph.name, ph.licence_no, ph.counters, pp.role_label, pp.shift, pp.registration_no, cs.counter, cs.state, cs.since
         FROM org.pharmacy ph
         JOIN identity.pharmacist_profile pp ON pp.pharmacy_id = ph.id AND pp.user_id = $2
         LEFT JOIN pharmacy.counter_state cs ON cs.user_id = $2
        WHERE ph.id = $1`,
      [pharmacyId, actor.userId],
    )
    return {
      userId: actor.userId,
      fullName: actor.fullName,
      pharmacyId,
      pharmacyName: ph?.name,
      licenceNo: ph?.licence_no,
      counters: ph?.counters,
      roleLabel: ph?.role_label,
      shift: ph?.shift,
      registrationNo: ph?.registration_no,
      counter: ph?.counter ? { counter: ph.counter, state: ph.state, since: iso(ph.since) } : ph?.state ? { counter: null, state: ph.state, since: iso(ph.since) } : null,
    }
  }

  async setCounter(actor: StaffActor, dto: CounterStateRequest) {
    const pharmacyId = this.pharmacy(actor)
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `INSERT INTO pharmacy.counter_state (user_id, pharmacy_id, counter, state, since, last_active_at) VALUES ($1,$2,$3,$4,util.demo_now(),util.demo_now())
         ON CONFLICT (user_id) DO UPDATE SET pharmacy_id = EXCLUDED.pharmacy_id, counter = EXCLUDED.counter, state = EXCLUDED.state, since = util.demo_now(), last_active_at = util.demo_now()`,
        [actor.userId, pharmacyId, dto.counter ?? null, dto.state],
      )
    })
    return { counter: dto.counter ?? null, state: dto.state }
  }

  // ---------------------------------------------------------------- queue
  async queue(actor: StaffActor, opts: { stage?: string; q?: string }) {
    const pharmacyId = this.pharmacy(actor)
    const rows = await this.db.query<any>(
      `SELECT rx.id, rx.rx_number, rx.issued_at, rx.valid_until, rx.status::text AS status, rx.patient_person_id,
              p.full_name, p.date_of_birth, p.sex::text AS sex, cp.blood_group::text AS blood_group,
              dp.hpr_id, drp.full_name AS doctor_name,
              f.verified_at, f.ready_at, f.collected_at, qt.token_label,
              (SELECT count(*)::int FROM pharmacy.prescription_item i WHERE i.prescription_id = rx.id) AS item_count
         FROM pharmacy.prescription rx
         JOIN identity.person p ON p.id = rx.patient_person_id
         LEFT JOIN identity.citizen_profile cp ON cp.person_id = rx.patient_person_id
         JOIN identity.doctor_profile dp ON dp.user_id = rx.doctor_user_id
         JOIN identity.app_user du ON du.id = rx.doctor_user_id JOIN identity.person drp ON drp.id = du.person_id
         LEFT JOIN pharmacy.rx_fulfilment f ON f.prescription_id = rx.id AND f.pharmacy_id = $1
         LEFT JOIN pharmacy.queue_token qt ON qt.prescription_id = rx.id AND qt.pharmacy_id = $1
        WHERE EXISTS (SELECT 1 FROM pharmacy.prescription_delivery d WHERE d.prescription_id = rx.id AND d.pharmacy_id = $1)
          AND (rx.status::text IN ('issued','partly_dispensed') OR f.collected_at >= date_trunc('day', util.demo_now()) OR f.ready_at >= date_trunc('day', util.demo_now()))
        ORDER BY f.collected_at NULLS FIRST, rx.issued_at DESC
        LIMIT 200`,
      [pharmacyId],
    )
    const now = demoNowMs()
    let list = rows.map((r) => {
      const stage = r.collected_at ? 'collected' : r.ready_at ? 'ready' : r.verified_at ? 'verified' : 'pending'
      return {
        prescriptionId: r.id,
        rxNumber: r.rx_number,
        tokenLabel: r.token_label,
        patientName: r.full_name,
        age: ageYears(r.date_of_birth),
        sex: r.sex,
        bloodGroup: r.blood_group,
        doctor: { name: r.doctor_name, hprId: r.hpr_id },
        issuedAt: iso(r.issued_at),
        validUntil: iso(r.valid_until),
        status: r.status,
        stage,
        itemCount: r.item_count,
        waitingMinutes: stage === 'pending' || stage === 'verified' ? Math.max(0, Math.round((now - new Date(r.issued_at).getTime()) / 60000)) : 0,
      }
    })
    if (opts.stage) list = list.filter((x) => x.stage === opts.stage)
    if (opts.q) {
      const q = opts.q.toLowerCase()
      list = list.filter((x) => x.patientName.toLowerCase().includes(q) || x.rxNumber.toLowerCase().includes(q))
    }
    const [k] = await this.db.query<any>(
      `SELECT (SELECT count(DISTINCT i.prescription_id)::int FROM pharmacy.dispensing d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
                WHERE d.pharmacy_id = $1 AND d.dispensed_at >= date_trunc('day', util.demo_now())) AS dispensed_today,
              (SELECT low_batches FROM pharmacy.v_stock_overview WHERE pharmacy_id = $1) AS low_batches,
              (SELECT count(*)::int FROM pharmacy.v_expiry_watch WHERE pharmacy_id = $1 AND bucket IN ('expired','within_30_days')) AS expiring`,
      [pharmacyId],
    )
    return {
      kpis: {
        waiting: list.filter((x) => x.stage === 'pending' || x.stage === 'verified').length,
        readyToCollect: list.filter((x) => x.stage === 'ready').length,
        dispensedToday: num(k?.dispensed_today) ?? 0,
        lowStockBatches: num(k?.low_batches) ?? 0,
        expiringWithin30Days: num(k?.expiring) ?? 0,
      },
      prescriptions: list,
    }
  }

  /** Walk-in patient: scan the prescription QR; the prescription then appears in this pharmacy's queue. */
  async scan(actor: StaffActor, qrToken: string) {
    const pharmacyId = this.pharmacy(actor)
    const rows = await this.db.query<any>(`SELECT id, rx_number, status::text AS status FROM pharmacy.prescription WHERE qr_token = $1`, [qrToken])
    const rx = rows[0]
    if (!rx) notFound('Prescription')
    await this.ctx.tx(actor, async (c) => {
      const has = (await c.query('SELECT 1 FROM pharmacy.prescription_delivery WHERE prescription_id = $1 AND pharmacy_id = $2', [rx.id, pharmacyId])).rows
      if (has.length === 0) {
        await c.query(`INSERT INTO pharmacy.prescription_delivery (prescription_id, pharmacy_id, sent_by, received_at) VALUES ($1,$2,'patient',util.demo_now())`, [rx.id, pharmacyId])
      }
      await this.ctx.audit(c, 'pharmacy.rx.scan', { entityType: 'pharmacy.prescription', entityId: rx.id })
    })
    return { prescriptionId: rx.id as string, rxNumber: rx.rx_number as string, status: rx.status as string }
  }

  // ---------------------------------------------------------------- prescription detail and checks
  private async loadRx(prescriptionId: string, pharmacyId: string, client?: PoolClient) {
    const sql = `SELECT rx.*, p.full_name AS patient_name, p.date_of_birth, p.sex::text AS sex, drp.full_name AS doctor_name,
                        dp.hpr_id, dp.council_reg_no, dp.hpr_verified_at
                   FROM pharmacy.prescription rx
                   JOIN identity.person p ON p.id = rx.patient_person_id
                   JOIN identity.doctor_profile dp ON dp.user_id = rx.doctor_user_id
                   JOIN identity.app_user du ON du.id = rx.doctor_user_id JOIN identity.person drp ON drp.id = du.person_id
                  WHERE rx.id = $1
                    AND EXISTS (SELECT 1 FROM pharmacy.prescription_delivery d WHERE d.prescription_id = rx.id AND d.pharmacy_id = $2)`
    const rows = client ? (await client.query(sql, [prescriptionId, pharmacyId])).rows : await this.db.query<any>(sql, [prescriptionId, pharmacyId])
    if (!rows[0]) notFound('Prescription')
    return rows[0] as any
  }

  private async items(prescriptionId: string, pharmacyId: string, client?: PoolClient) {
    const sql = `SELECT i.id, i.medicine_id, m.generic_name, m.form, m.strength, m.schedule::text AS schedule, i.dose, i.frequency, i.duration_days, i.quantity::float AS quantity,
                        i.instructions, i.with_food,
                        COALESCE((SELECT sum(d.quantity) FROM pharmacy.dispensing d WHERE d.prescription_item_id = i.id AND d.outcome::text IN ('dispensed','substitute')), 0)::float AS dispensed,
                        (SELECT count(*)::int FROM pharmacy.dispensing d WHERE d.prescription_item_id = i.id AND d.outcome::text = 'out_of_stock') AS out_of_stock_marks
                   FROM pharmacy.prescription_item i JOIN pharmacy.medicine m ON m.id = i.medicine_id WHERE i.prescription_id = $1 ORDER BY m.generic_name`
    const rows = client ? (await client.query(sql, [prescriptionId])).rows : await this.db.query<any>(sql, [prescriptionId])
    return rows as any[]
  }

  private async batches(pharmacyId: string, medicineId: string, client?: PoolClient): Promise<PharmacyStockBatch[]> {
    const sql = `SELECT id, batch_no, expiry_date, quantity::float AS quantity, unit_price::float AS unit_price, blocked_reason
                   FROM pharmacy.stock_item WHERE pharmacy_id = $1 AND medicine_id = $2 AND quantity > 0 ORDER BY expiry_date, batch_no`
    const rows = client ? (await client.query(sql, [pharmacyId, medicineId])).rows : await this.db.query<any>(sql, [pharmacyId, medicineId])
    return rows.map((b: any) => ({
      stockItemId: b.id,
      batchNo: b.batch_no,
      expiryDate: dateStr(b.expiry_date)!,
      quantity: b.quantity,
      unitPrice: b.unit_price,
      blocked: !!b.blocked_reason || new Date(b.expiry_date).getTime() < new Date(new Date(demoNowMs()).toISOString().slice(0, 10)).getTime(),
      blockedReason: b.blocked_reason ?? (new Date(b.expiry_date).getTime() < new Date(new Date(demoNowMs()).toISOString().slice(0, 10)).getTime() ? 'Expired' : null),
    }))
  }

  async detail(actor: StaffActor, prescriptionId: string) {
    const pharmacyId = this.pharmacy(actor)
    const rx = await this.loadRx(prescriptionId, pharmacyId)
    const items = await this.items(prescriptionId, pharmacyId)
    const [fulfil] = await this.db.query<any>(
      `SELECT f.verified_at, f.ready_at, f.collected_at, f.sms_sent_at, qt.token_label, qt.token_no FROM pharmacy.rx_fulfilment f
         LEFT JOIN pharmacy.queue_token qt ON qt.prescription_id = f.prescription_id AND qt.pharmacy_id = f.pharmacy_id WHERE f.prescription_id = $1 AND f.pharmacy_id = $2`,
      [prescriptionId, pharmacyId],
    )
    const lines = []
    for (const it of items) {
      const batches = await this.batches(pharmacyId, it.medicine_id)
      const usable = batches.filter((b) => !b.blocked)
      const subs = await this.substitutes(pharmacyId, it.medicine_id)
      lines.push({
        itemId: it.id,
        medicineId: it.medicine_id,
        medicine: `${it.generic_name} ${it.strength}`,
        form: it.form,
        schedule: it.schedule,
        dose: it.dose,
        frequency: it.frequency,
        durationDays: it.duration_days,
        withFood: it.with_food,
        instructions: it.instructions,
        prescribed: it.quantity,
        dispensed: it.dispensed,
        remaining: Math.max(0, it.quantity - it.dispensed),
        outOfStockMarked: it.out_of_stock_marks > 0,
        inStock: usable.reduce((s, b) => s + b.quantity, 0),
        fefoNextBatch: usable[0] ?? null,
        batches,
        substitutes: subs,
      })
    }
    const checks = await this.computeChecks(rx, items, pharmacyId)
    const history = await this.db.query<any>(
      `SELECT c.check_code AS code, c.passed, c.detail, c.checked_at FROM pharmacy.rx_verification c WHERE c.prescription_id = $1 AND c.pharmacy_id = $2 ORDER BY c.checked_at DESC LIMIT 7`,
      [prescriptionId, pharmacyId],
    )
    return {
      prescription: {
        id: rx.id,
        rxNumber: rx.rx_number,
        status: rx.status,
        issuedAt: iso(rx.issued_at),
        validUntil: iso(rx.valid_until),
        signatureMethod: rx.signature_method,
        tokenLabel: fulfil?.token_label ?? null,
        verifiedAt: iso(fulfil?.verified_at),
        readyAt: iso(fulfil?.ready_at),
        collectedAt: iso(fulfil?.collected_at),
        smsSentAt: iso(fulfil?.sms_sent_at),
      },
      patient: { personId: rx.patient_person_id, fullName: rx.patient_name, age: ageYears(rx.date_of_birth), sex: rx.sex },
      doctor: { name: rx.doctor_name, hprId: rx.hpr_id, councilRegNo: rx.council_reg_no },
      checks,
      lastVerification: history.map((h) => ({ code: h.code, passed: h.passed, detail: h.detail, checkedAt: iso(h.checked_at) })),
      items: lines,
    }
  }

  private async computeChecks(rx: any, items: any[], pharmacyId: string, client?: PoolClient): Promise<RxCheckResult[]> {
    const run = async (sql: string, params: any[]) => (client ? (await client.query(sql, params)).rows : await this.db.query<any>(sql, params))
    const out: RxCheckResult[] = []
    out.push(
      rx.signature_method && rx.signature_ref
        ? { code: 'esignature', passed: true, severity: 'ok', detail: `Signed with ${rx.signature_method} e-signature (reference on file)` }
        : { code: 'esignature', passed: false, severity: 'blocker', detail: 'No e-signature on this prescription' },
    )
    out.push(rx.qr_token ? { code: 'qr', passed: true, severity: 'ok', detail: 'QR token present and unique' } : { code: 'qr', passed: false, severity: 'blocker', detail: 'No QR token' })
    out.push(
      rx.hpr_id
        ? { code: 'hpr', passed: true, severity: rx.hpr_verified_at ? 'ok' : 'warning', detail: `Prescriber ${rx.hpr_id}${rx.hpr_verified_at ? ' (HPR verified, mock connector)' : ' (not yet verified in the HPR mock)'}` }
        : { code: 'hpr', passed: false, severity: 'blocker', detail: 'Prescriber HPR ID missing' },
    )
    const valid = new Date(rx.valid_until).getTime() > demoNowMs() && UNRESOLVED.includes(rx.status)
    out.push({ code: 'validity', passed: valid, severity: valid ? 'ok' : 'blocker', detail: valid ? `Issued ${iso(rx.issued_at)?.slice(0, 10)}, valid until ${iso(rx.valid_until)?.slice(0, 10)}` : `Prescription is ${rx.status} / past its validity date` })

    const ids = items.map((i) => i.medicine_id)
    const allergies = await run(
      `SELECT DISTINCT a.substance, m.generic_name FROM records.allergy a JOIN pharmacy.medicine m ON m.id = ANY($2::uuid[])
        WHERE a.patient_person_id = $1 AND a.status = 'active' AND a.superseded_by IS NULL
          AND (lower(m.generic_name) LIKE '%' || lower(a.substance) || '%' OR lower(a.substance) LIKE '%' || lower(m.generic_name) || '%')`,
      [rx.patient_person_id, ids],
    )
    out.push(
      allergies.length
        ? { code: 'allergy', passed: false, severity: 'warning', detail: `Allergy on record matches: ${allergies.map((a: any) => `${a.substance} ~ ${a.generic_name}`).join('; ')}` }
        : { code: 'allergy', passed: true, severity: 'ok', detail: 'No match between recorded allergies and the medicines on this prescription' },
    )
    const inter = await run(
      `SELECT di.severity, di.note, a.generic_name AS a_name, b.generic_name AS b_name FROM pharmacy.drug_interaction di
         JOIN pharmacy.medicine a ON a.id = di.medicine_a_id JOIN pharmacy.medicine b ON b.id = di.medicine_b_id
        WHERE di.medicine_a_id = ANY($1::uuid[]) AND di.medicine_b_id = ANY($1::uuid[])`,
      [ids],
    )
    out.push(
      inter.length
        ? { code: 'interaction', passed: false, severity: inter.some((i: any) => ['major', 'contraindicated'].includes(i.severity)) ? 'blocker' : 'warning', detail: inter.map((i: any) => `${i.a_name} + ${i.b_name}: ${i.severity}${i.note ? ' (' + i.note + ')' : ''}`).join('; ') }
        : { code: 'interaction', passed: true, severity: 'ok', detail: 'No known interactions between these medicines' },
    )
    const short: string[] = []
    for (const it of items) {
      const left = Math.max(0, it.quantity - it.dispensed)
      if (left === 0) continue
      const r = await run(
        `SELECT COALESCE(sum(quantity),0)::float AS q FROM pharmacy.stock_item WHERE pharmacy_id = $1 AND medicine_id = $2 AND blocked_reason IS NULL AND expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date`,
        [pharmacyId, it.medicine_id],
      )
      if (r[0].q < left) short.push(`${it.generic_name} ${it.strength} (${r[0].q} of ${left})`)
    }
    out.push(short.length ? { code: 'stock', passed: false, severity: 'warning', detail: `Short on stock: ${short.join(', ')}. Partial dispensing or a substitute may be needed.` } : { code: 'stock', passed: true, severity: 'ok', detail: 'All lines are in stock' })
    return out
  }

  /** Substitutes with stock at this pharmacy: listed substitutes plus the same medicine in another strength. */
  async substitutes(pharmacyId: string, medicineId: string) {
    const rows = await this.db.query<any>(
      `WITH me AS (SELECT generic_name FROM pharmacy.medicine WHERE id = $2)
       SELECT m.id, m.generic_name, m.form, m.strength, 'generic' AS kind, NULL AS note, false AS requires_doctor_ok,
              COALESCE((SELECT sum(quantity) FROM pharmacy.stock_item s WHERE s.pharmacy_id = $1 AND s.medicine_id = m.id AND s.blocked_reason IS NULL AND s.expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date), 0)::float AS in_stock
         FROM pharmacy.medicine m, me WHERE m.generic_name = me.generic_name AND m.id <> $2 AND m.is_active
       UNION ALL
       SELECT m.id, m.generic_name, m.form, m.strength, ms.kind, ms.note, ms.requires_doctor_ok,
              COALESCE((SELECT sum(quantity) FROM pharmacy.stock_item s WHERE s.pharmacy_id = $1 AND s.medicine_id = m.id AND s.blocked_reason IS NULL AND s.expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date), 0)::float AS in_stock
         FROM pharmacy.medicine_substitute ms JOIN pharmacy.medicine m ON m.id = ms.substitute_medicine_id WHERE ms.medicine_id = $2`,
      [pharmacyId, medicineId],
    )
    return rows.map((r) => ({ medicineId: r.id, medicine: `${r.generic_name} ${r.strength}`, form: r.form, kind: r.kind, note: r.note, requiresDoctorOk: r.requires_doctor_ok, inStock: r.in_stock }))
  }

  async itemSubstitutes(actor: StaffActor, prescriptionId: string, itemId: string) {
    const pharmacyId = this.pharmacy(actor)
    await this.loadRx(prescriptionId, pharmacyId)
    const items = await this.items(prescriptionId, pharmacyId)
    const it = items.find((i) => i.id === itemId)
    if (!it) notFound('Prescription item')
    return this.substitutes(pharmacyId, it.medicine_id)
  }

  // ---------------------------------------------------------------- verify
  async verify(actor: StaffActor, prescriptionId: string) {
    const pharmacyId = this.pharmacy(actor)
    const out = await this.ctx.tx(actor, async (c) => {
      const rx = await this.loadRx(prescriptionId, pharmacyId, c)
      const items = await this.items(prescriptionId, pharmacyId, c)
      const checks = await this.computeChecks(rx, items, pharmacyId, c)
      const blockers = checks.filter((k) => k.severity === 'blocker')
      for (const k of checks) {
        await c.query(`INSERT INTO pharmacy.rx_verification (prescription_id, pharmacy_id, pharmacist_user_id, check_code, passed, detail) VALUES ($1,$2,$3,$4,$5,$6)`, [prescriptionId, pharmacyId, actor.userId, k.code, k.passed, k.detail])
      }
      if (blockers.length) {
        // The failed checks are kept as the verification record; the prescription is not verified.
        return { verified: false, blockers, checks }
      }
      await c.query(
        `INSERT INTO pharmacy.rx_fulfilment (prescription_id, pharmacy_id, verified_by_user_id, verified_at) VALUES ($1,$2,$3,util.demo_now())
         ON CONFLICT (prescription_id) DO UPDATE SET verified_by_user_id = COALESCE(pharmacy.rx_fulfilment.verified_by_user_id, EXCLUDED.verified_by_user_id),
                                                    verified_at = COALESCE(pharmacy.rx_fulfilment.verified_at, util.demo_now())`,
        [prescriptionId, pharmacyId, actor.userId],
      )
      let tok = (await c.query('SELECT token_label FROM pharmacy.queue_token WHERE prescription_id = $1 AND pharmacy_id = $2', [prescriptionId, pharmacyId])).rows[0]
      if (!tok) {
        const n = (await c.query(`SELECT COALESCE(max(token_no), 0) + 1 AS n FROM pharmacy.queue_token WHERE pharmacy_id = $1 AND token_date = (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date`, [pharmacyId])).rows[0].n
        tok = (
          await c.query(`INSERT INTO pharmacy.queue_token (prescription_id, pharmacy_id, token_no, token_label) VALUES ($1,$2,$3,$4) RETURNING token_label`, [prescriptionId, pharmacyId, n, 'P-' + String(n).padStart(3, '0')])
        ).rows[0]
      }
      await this.ctx.audit(c, 'pharmacy.rx.verify', { entityType: 'pharmacy.prescription', entityId: prescriptionId, patientPersonId: rx.patient_person_id })
      return { verified: true, tokenLabel: tok.token_label as string, checks }
    })
    if (!out.verified) {
      throw new ConflictException({ success: false, errorMessage: 'Verification failed: ' + (out as any).blockers.map((b: RxCheckResult) => b.detail).join('; '), checks: out.checks })
    }
    return out
  }

  // ---------------------------------------------------------------- dispense
  async dispense(actor: StaffActor, prescriptionId: string, dto: DispenseRequest) {
    const pharmacyId = this.pharmacy(actor)
    return this.ctx.tx(actor, async (c) => {
      const rx = await this.loadRx(prescriptionId, pharmacyId, c)
      const ful = (await c.query('SELECT verified_at, ready_at FROM pharmacy.rx_fulfilment WHERE prescription_id = $1 AND pharmacy_id = $2', [prescriptionId, pharmacyId])).rows[0]
      if (!ful?.verified_at) throw new ConflictException({ success: false, errorMessage: 'Verify the prescription before dispensing' })
      const items = await this.items(prescriptionId, pharmacyId, c)
      const dispensedRows: { itemId: string; dispensingId: string; batchNo: string | null; quantity: number; outcome: string }[] = []
      const shortfalls: { itemId: string; medicine: string; missing: number }[] = []
      const noteForDoctor: string[] = []
      const tally: Record<string, number> = {} // quantity given earlier in this same request, per item

      for (const line of dto.lines) {
        const it = items.find((i) => i.id === line.itemId)
        if (!it) throw new BadRequestException({ success: false, errorMessage: `Item ${line.itemId} is not on this prescription` })
        const remaining = Math.max(0, it.quantity - it.dispensed - (tally[it.id] ?? 0))
        if (remaining <= 0 && line.outcome !== 'out_of_stock') throw new ConflictException({ success: false, errorMessage: `${it.generic_name} is already fully dispensed` })
        if (line.noteToDoctor) noteForDoctor.push(`${it.generic_name}: ${line.noteToDoctor}`)

        if (line.outcome === 'out_of_stock') {
          const d = await c.query(`INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, note_to_doctor) VALUES ($1,$2,$3,'out_of_stock',0,$4) RETURNING id`, [it.id, pharmacyId, actor.userId, line.noteToDoctor ?? null])
          dispensedRows.push({ itemId: it.id, dispensingId: d.rows[0].id, batchNo: null, quantity: 0, outcome: 'out_of_stock' })
          continue
        }

        let medicineId = it.medicine_id as string
        if (line.outcome === 'substitute') {
          const subs = await this.substitutes(pharmacyId, it.medicine_id)
          const sub = subs.find((s) => s.medicineId === line.substituteMedicineId)
          if (!sub) throw new BadRequestException({ success: false, errorMessage: 'That substitute is not allowed for this medicine' })
          if (sub.requiresDoctorOk && !line.prescriberAgreed) throw new ConflictException({ success: false, errorMessage: `${sub.medicine} is a therapeutic swap; get the prescriber's agreement first` })
          medicineId = sub.medicineId
        }
        const want = Math.min(line.quantity ?? remaining, remaining)
        let need = want
        const picks: { id: string; take: number; batchNo: string }[] = []
        if (line.stockItemId) {
          const b = (await c.query('SELECT id, batch_no, quantity::float AS quantity, medicine_id FROM pharmacy.stock_item WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE', [line.stockItemId, pharmacyId])).rows[0]
          if (!b || b.medicine_id !== medicineId) throw new BadRequestException({ success: false, errorMessage: 'That batch is not this medicine in your pharmacy' })
          const take = Math.min(need, b.quantity)
          if (take > 0) picks.push({ id: b.id, take, batchNo: b.batch_no })
          need -= take
        } else {
          const bs = (
            await c.query(
              `SELECT id, batch_no, quantity::float AS quantity FROM pharmacy.stock_item
                WHERE pharmacy_id = $1 AND medicine_id = $2 AND quantity > 0 AND blocked_reason IS NULL AND expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date
                ORDER BY expiry_date, batch_no FOR UPDATE`,
              [pharmacyId, medicineId],
            )
          ).rows
          for (const b of bs) {
            if (need <= 0) break
            const take = Math.min(need, b.quantity)
            picks.push({ id: b.id, take, batchNo: b.batch_no })
            need -= take
          }
        }
        if (picks.length === 0) throw new ConflictException({ success: false, errorMessage: `No usable stock for ${it.generic_name}; mark it out of stock or choose a substitute` })
        if (need > 0) shortfalls.push({ itemId: it.id, medicine: `${it.generic_name} ${it.strength}`, missing: need })
        for (const p of picks) {
          const d = await c.query(
            `INSERT INTO pharmacy.dispensing (prescription_item_id, pharmacy_id, pharmacist_user_id, outcome, quantity, stock_item_id, substitute_medicine_id, note_to_doctor, batch_override_reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [it.id, pharmacyId, actor.userId, line.outcome, p.take, p.id, line.outcome === 'substitute' ? medicineId : null, line.noteToDoctor ?? null, line.batchOverrideReason ?? null],
          )
          dispensedRows.push({ itemId: it.id, dispensingId: d.rows[0].id, batchNo: p.batchNo, quantity: p.take, outcome: line.outcome })
          tally[it.id] = (tally[it.id] ?? 0) + p.take
          if (['H1', 'X'].includes(it.schedule)) {
            const pat = (await c.query(`SELECT p.full_name, cp.address_enc FROM identity.person p LEFT JOIN identity.citizen_profile cp ON cp.person_id = p.id WHERE p.id = $1`, [rx.patient_person_id])).rows[0]
            await c.query(
              `INSERT INTO pharmacy.controlled_drug_register (dispensing_id, pharmacy_id, schedule, patient_name, patient_address, doctor_name, doctor_reg_no, medicine_name, quantity)
               VALUES ($1,$2,$3::pharmacy.schedule,$4,$5,$6,$7,$8,$9)`,
              [d.rows[0].id, pharmacyId, it.schedule, pat.full_name, decodeDemoBytes(pat.address_enc) || 'Address on file (demo)', rx.doctor_name, rx.council_reg_no, `${it.generic_name} ${it.strength}`, p.take],
            )
          }
        }
      }

      // Is the whole prescription now resolved? (every line fully dispensed, or marked out of stock with a note)
      const after = await this.items(prescriptionId, pharmacyId, c)
      const allFull = after.every((i) => i.dispensed >= i.quantity)
      const settled = after.every((i) => i.dispensed >= i.quantity || i.out_of_stock_marks > 0)
      const rxRow = (await c.query('SELECT status::text AS status FROM pharmacy.prescription WHERE id = $1', [prescriptionId])).rows[0]
      const anyDispensed = after.some((i) => i.dispensed > 0)
      let readyNow = false
      // The database closes a prescription (status 'dispensed') once every line has at least one dispensing row, and then
      // refuses more (CF051). So that is the last chance to hand over: mark it ready, any balance is reported as open.
      if (anyDispensed && !ful.ready_at && (allFull || settled || rxRow.status === 'dispensed')) {
        await this.makeReady(c, actor, rx, pharmacyId, allFull)
        readyNow = true
      }
      if (noteForDoctor.length) {
        await this.ctx.emitEvent(c, actor, {
          type: 'message',
          toRoles: ['doctor'],
          toUserId: rx.doctor_user_id,
          title: `Pharmacy note · ${rx.rx_number}`,
          text: noteForDoctor.join(' | ').slice(0, 500),
          href: '/doctor/prescriptions',
          entityType: 'pharmacy.prescription',
          entityId: prescriptionId,
          patientPersonId: rx.patient_person_id,
          pharmacyId,
        })
      }
      await this.ctx.audit(c, 'pharmacy.rx.dispense', { entityType: 'pharmacy.prescription', entityId: prescriptionId, patientPersonId: rx.patient_person_id, details: { lines: dispensedRows.length } })
      return {
        prescriptionId,
        status: rxRow.status,
        partial: !allFull,
        canDispenseMore: rxRow.status !== 'dispensed',
        readyToCollect: readyNow || !!ful.ready_at,
        dispensed: dispensedRows,
        shortfalls,
        balanceOpen: after.filter((i) => i.dispensed < i.quantity).map((i) => ({ itemId: i.id, medicine: `${i.generic_name} ${i.strength}`, remaining: i.quantity - i.dispensed })),
        smsSent: readyNow,
        smsNote: readyNow ? 'SMS sent through the mock SMS connector' : undefined,
      }
    })
  }

  private async makeReady(c: PoolClient, actor: StaffActor, rx: any, pharmacyId: string, allFull: boolean) {
    const pName = (await c.query('SELECT name FROM org.pharmacy WHERE id = $1', [pharmacyId])).rows[0].name
    await c.query(`UPDATE pharmacy.rx_fulfilment SET ready_at = util.demo_now(), sms_sent_at = util.demo_now() WHERE prescription_id = $1`, [rx.id]) // sms_sent_at: mock SMS connector
    await this.ctx.emitEvent(c, actor, {
      type: 'dispensed',
      toRoles: ['citizen'],
      title: `Ready to collect · ${pName}`,
      text: `${rx.rx_number} · ${allFull ? 'all medicines' : 'part of the prescription; the balance stays open'} · ${actor.fullName}`,
      href: '/citizen/medicines',
      entityType: 'pharmacy.prescription',
      entityId: rx.id,
      patientPersonId: rx.patient_person_id,
      pharmacyId,
    })
  }

  /** Close a partly filled prescription as ready to collect (anything dispensed, balance stays open). */
  async markReady(actor: StaffActor, prescriptionId: string) {
    const pharmacyId = this.pharmacy(actor)
    return this.ctx.tx(actor, async (c) => {
      const rx = await this.loadRx(prescriptionId, pharmacyId, c)
      const ful = (await c.query('SELECT verified_at, ready_at FROM pharmacy.rx_fulfilment WHERE prescription_id = $1 AND pharmacy_id = $2', [prescriptionId, pharmacyId])).rows[0]
      if (!ful?.verified_at) throw new ConflictException({ success: false, errorMessage: 'Verify the prescription first' })
      if (ful.ready_at) throw new ConflictException({ success: false, errorMessage: 'Already marked ready' })
      const items = await this.items(prescriptionId, pharmacyId, c)
      if (!items.some((i) => i.dispensed > 0)) throw new ConflictException({ success: false, errorMessage: 'Nothing has been dispensed yet' })
      await this.makeReady(c, actor, rx, pharmacyId, items.every((i) => i.dispensed >= i.quantity))
      await this.ctx.audit(c, 'pharmacy.rx.ready', { entityType: 'pharmacy.prescription', entityId: prescriptionId, patientPersonId: rx.patient_person_id })
      return { prescriptionId, readyToCollect: true }
    })
  }

  // ---------------------------------------------------------------- handover QR and collection
  private handoverCode(rx: any, readyAt: unknown, pharmacyId: string): string {
    return createHash('sha256').update(`${rx.qr_token}|${new Date(readyAt as any).toISOString()}|${pharmacyId}`).digest('hex').slice(0, 12).toUpperCase()
  }

  async handoverQr(actor: StaffActor, prescriptionId: string) {
    const pharmacyId = this.pharmacy(actor)
    const rx = await this.loadRx(prescriptionId, pharmacyId)
    const f = (await this.db.query<any>('SELECT ready_at, collected_at FROM pharmacy.rx_fulfilment WHERE prescription_id = $1 AND pharmacy_id = $2', [prescriptionId, pharmacyId]))[0]
    if (!f?.ready_at) throw new ConflictException({ success: false, errorMessage: 'Nothing is ready to hand over yet' })
    const code = this.handoverCode(rx, f.ready_at, pharmacyId)
    return { rxNumber: rx.rx_number, handoverCode: code, payload: `CFHO|${rx.rx_number}|${code}`, readyAt: iso(f.ready_at), collectedAt: iso(f.collected_at), note: 'Print on the pack label. Scan or type the code at hand-over; the prescription QR token is never shown here.' }
  }

  async collected(actor: StaffActor, prescriptionId: string, dto: CollectedRequest) {
    const pharmacyId = this.pharmacy(actor)
    const rx = await this.loadRx(prescriptionId, pharmacyId)
    const f = (await this.db.query<any>('SELECT ready_at, collected_at FROM pharmacy.rx_fulfilment WHERE prescription_id = $1 AND pharmacy_id = $2', [prescriptionId, pharmacyId]))[0]
    if (!f?.ready_at) throw new ConflictException({ success: false, errorMessage: 'Nothing is ready to hand over yet' })
    if (f.collected_at) throw new ConflictException({ success: false, errorMessage: 'Already collected' })
    if (dto.qrToken) {
      const code = this.handoverCode(rx, f.ready_at, pharmacyId)
      const t = dto.qrToken.trim()
      if (t !== rx.qr_token && t.toUpperCase() !== code && t !== `CFHO|${rx.rx_number}|${code}`) throw new ConflictException({ success: false, errorMessage: 'The scanned code does not match this prescription' })
    }
    return this.ctx.tx(actor, async (c) => {
      await c.query(`UPDATE pharmacy.rx_fulfilment SET collected_at = util.demo_now(), collected_by_person_id = COALESCE($2::uuid, $3::uuid) WHERE prescription_id = $1`, [prescriptionId, dto.collectedByPersonId ?? null, rx.patient_person_id])
      await c.query(`UPDATE pharmacy.queue_token SET served_at = util.demo_now() WHERE prescription_id = $1 AND pharmacy_id = $2`, [prescriptionId, pharmacyId])
      await this.ctx.emitEvent(c, actor, {
        type: 'collected',
        toRoles: ['citizen'],
        title: 'Medicines collected',
        text: `${rx.rx_number} · handed over by ${actor.fullName}${dto.collectedByName ? ' to ' + dto.collectedByName : ''}`,
        href: '/citizen/medicines',
        entityType: 'pharmacy.prescription',
        entityId: prescriptionId,
        patientPersonId: rx.patient_person_id,
        pharmacyId,
      })
      await this.ctx.audit(c, 'pharmacy.rx.collected', { entityType: 'pharmacy.prescription', entityId: prescriptionId, patientPersonId: rx.patient_person_id })
      return { prescriptionId, collected: true }
    })
  }

  // ---------------------------------------------------------------- history and refills
  async patientHistory(actor: StaffActor, personId: string) {
    const pharmacyId = this.pharmacy(actor)
    const ok = await this.db.query(
      `SELECT 1 FROM pharmacy.prescription rx WHERE rx.patient_person_id = $1
          AND EXISTS (SELECT 1 FROM pharmacy.prescription_delivery d WHERE d.prescription_id = rx.id AND d.pharmacy_id = $2) LIMIT 1`,
      [personId, pharmacyId],
    )
    if (ok.length === 0) forbidden('You can only see the medicine history of patients whose prescription was sent to your pharmacy')
    const [rows, allergies, person] = await Promise.all([
      this.db.query<any>(
        `SELECT d.dispensed_at, rx.rx_number, m.generic_name, m.strength, d.quantity::float AS dispensed_qty, i.quantity::float AS prescribed_qty, d.outcome::text AS outcome,
                drp.full_name AS doctor_name, ph.name AS pharmacy_name
           FROM pharmacy.dispensing d
           JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
           JOIN pharmacy.prescription rx ON rx.id = i.prescription_id
           JOIN pharmacy.medicine m ON m.id = COALESCE(d.substitute_medicine_id, i.medicine_id)
           JOIN identity.app_user du ON du.id = rx.doctor_user_id JOIN identity.person drp ON drp.id = du.person_id
           JOIN org.pharmacy ph ON ph.id = d.pharmacy_id
          WHERE rx.patient_person_id = $1 AND d.outcome::text IN ('dispensed','substitute') ORDER BY d.dispensed_at DESC LIMIT 50`,
        [personId],
      ),
      this.db.query<any>(`SELECT substance FROM records.allergy WHERE patient_person_id = $1 AND status = 'active' AND superseded_by IS NULL`, [personId]),
      this.db.query<any>('SELECT full_name FROM identity.person WHERE id = $1', [personId]),
    ])
    return {
      patientName: person[0]?.full_name,
      allergies: allergies.map((a) => a.substance),
      lastDispensedAt: iso(rows[0]?.dispensed_at),
      history: rows.map((r) => ({
        dispensedAt: iso(r.dispensed_at),
        rxNumber: r.rx_number,
        medicine: `${r.generic_name} ${r.strength}`,
        quantity: r.dispensed_qty,
        prescribed: r.prescribed_qty,
        type: r.dispensed_qty >= r.prescribed_qty ? 'full' : 'partial',
        doctor: r.doctor_name,
        pharmacy: r.pharmacy_name,
        substitute: r.outcome === 'substitute',
      })),
    }
  }

  async refills(actor: StaffActor, withinDays = 7) {
    const pharmacyId = this.pharmacy(actor)
    const rows = await this.db.query<any>(
      `SELECT rx.patient_person_id, p.full_name, rx.rx_number, m.generic_name, m.strength, i.duration_days, max(d.dispensed_at) AS last_dispensed,
              max(d.dispensed_at) + (i.duration_days * interval '1 day') AS refill_due
         FROM pharmacy.dispensing d
         JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
         JOIN pharmacy.prescription rx ON rx.id = i.prescription_id
         JOIN pharmacy.medicine m ON m.id = i.medicine_id
         JOIN identity.person p ON p.id = rx.patient_person_id
        WHERE d.pharmacy_id = $1 AND d.outcome::text IN ('dispensed','substitute')
        GROUP BY rx.patient_person_id, p.full_name, rx.rx_number, m.generic_name, m.strength, i.duration_days, i.id
       HAVING max(d.dispensed_at) + (i.duration_days * interval '1 day') <= util.demo_now() + ($2::int * interval '1 day')
          AND max(d.dispensed_at) + (i.duration_days * interval '1 day') >= util.demo_now() - interval '30 days'
        ORDER BY refill_due`,
      [pharmacyId, withinDays],
    )
    return rows.map((r) => ({
      patientPersonId: r.patient_person_id,
      patientName: r.full_name,
      rxNumber: r.rx_number,
      medicine: `${r.generic_name} ${r.strength}`,
      lastDispensedAt: iso(r.last_dispensed),
      refillDueAt: iso(r.refill_due),
      overdue: new Date(r.refill_due).getTime() < demoNowMs(),
    }))
  }

  // ---------------------------------------------------------------- stock, expiry, log
  async stock(actor: StaffActor, opts: { q?: string; level?: string }) {
    const pharmacyId = this.pharmacy(actor)
    const rows = await this.db.query<any>(
      `SELECT m.id, m.generic_name, m.form, m.strength, m.schedule::text AS schedule, m.category,
              COALESCE(sum(s.quantity) FILTER (WHERE s.blocked_reason IS NULL AND s.expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date), 0)::float AS on_hand,
              max(s.low_threshold)::float AS reorder_at, count(s.id)::int AS batches,
              min(s.expiry_date) FILTER (WHERE s.quantity > 0 AND s.expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date) AS nearest_expiry,
              COALESCE((SELECT sum(-mv.quantity_delta) FROM pharmacy.stock_movement mv JOIN pharmacy.stock_item si ON si.id = mv.stock_item_id
                         WHERE mv.pharmacy_id = $1 AND si.medicine_id = m.id AND mv.movement_type = 'dispense' AND mv.at >= util.demo_now() - interval '14 days'), 0)::float / 14 AS used_per_day,
              (SELECT min(po.expected_on) FROM pharmacy.purchase_order po JOIN pharmacy.po_line pl ON pl.po_id = po.id
                WHERE po.pharmacy_id = $1 AND pl.medicine_id = m.id AND po.status IN ('approved','sent','in_transit')) AS next_supply
         FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
        WHERE s.pharmacy_id = $1 AND ($2::text IS NULL OR m.generic_name ILIKE '%' || $2 || '%')
        GROUP BY m.id ORDER BY m.generic_name`,
      [pharmacyId, opts.q ?? null],
    )
    let list = rows.map((r) => ({
      medicineId: r.id,
      medicine: `${r.generic_name} ${r.strength}`,
      form: r.form,
      schedule: r.schedule,
      category: r.category,
      onHand: r.on_hand,
      reorderAt: r.reorder_at,
      level: r.on_hand <= 0 ? 'out' : r.on_hand < r.reorder_at ? 'low' : 'ok',
      batches: r.batches,
      nearestExpiry: dateStr(r.nearest_expiry),
      usedPerDay: Math.round(r.used_per_day * 10) / 10,
      nextSupply: dateStr(r.next_supply),
    }))
    if (opts.level) list = list.filter((x) => x.level === opts.level)
    const [ov] = await this.db.query<any>('SELECT skus, low_batches, blocked_batches, stock_value::float AS stock_value FROM pharmacy.v_stock_overview WHERE pharmacy_id = $1', [pharmacyId])
    const [ind] = await this.db.query<any>(`SELECT count(*)::int AS n FROM pharmacy.purchase_order WHERE pharmacy_id = $1 AND is_indent AND status IN ('draft','pending_approval','approved','sent','in_transit')`, [pharmacyId])
    return {
      summary: {
        itemsTracked: ov?.skus ?? 0,
        low: list.filter((x) => x.level === 'low').length,
        out: list.filter((x) => x.level === 'out').length,
        blockedBatches: ov?.blocked_batches ?? 0,
        stockValue: ov?.stock_value ?? 0,
        indentPending: ind?.n ?? 0,
      },
      items: list,
    }
  }

  async medicineBatches(actor: StaffActor, medicineId: string) {
    return this.batches(this.pharmacy(actor), medicineId)
  }

  async stockAction(actor: StaffActor, stockItemId: string, dto: StockActionRequest) {
    const pharmacyId = this.pharmacy(actor)
    const s = (await this.db.query<any>('SELECT id, quantity::float AS quantity, batch_no, blocked_reason FROM pharmacy.stock_item WHERE id = $1 AND pharmacy_id = $2', [stockItemId, pharmacyId]))[0]
    if (!s) notFound('Stock batch')
    return this.ctx.tx(actor, async (c) => {
      if (dto.action === 'quarantine') {
        await c.query(`UPDATE pharmacy.stock_item SET blocked_reason = $2, blocked_at = util.demo_now(), is_published = false WHERE id = $1`, [stockItemId, dto.reason])
        await this.ctx.audit(c, 'pharmacy.stock.quarantine', { entityType: 'pharmacy.stock_item', entityId: stockItemId, details: { reason: dto.reason } })
        return { stockItemId, action: 'quarantine', batchNo: s.batch_no }
      }
      let delta: number
      if (dto.action === 'adjustment') {
        if (dto.quantity === undefined || dto.quantity === 0) throw new BadRequestException({ success: false, errorMessage: 'An adjustment needs a non-zero signed quantity' })
        delta = dto.quantity
      } else {
        const take = dto.quantity !== undefined ? Math.abs(dto.quantity) : s.quantity
        if (take <= 0) throw new BadRequestException({ success: false, errorMessage: 'Nothing to remove' })
        delta = -take
      }
      await c.query(`INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta, reason, by_user_id) VALUES ($1,$2,$3::pharmacy.movement_type,$4,$5,$6)`, [pharmacyId, stockItemId, dto.action, delta, dto.reason, actor.userId])
      await this.ctx.audit(c, `pharmacy.stock.${dto.action}`, { entityType: 'pharmacy.stock_item', entityId: stockItemId, details: { delta, reason: dto.reason } })
      return { stockItemId, action: dto.action, delta, batchNo: s.batch_no }
    })
  }

  async expiry(actor: StaffActor) {
    const list = await this.db.query<any>(
      `SELECT w.medicine_id, w.generic_name, w.batch_no, w.expiry_date, w.quantity::float AS quantity, w.value_at_cost::float AS value_at_cost, w.bucket,
              (SELECT s.id FROM pharmacy.stock_item s WHERE s.pharmacy_id = w.pharmacy_id AND s.medicine_id = w.medicine_id AND s.batch_no = w.batch_no) AS stock_item_id,
              (w.expiry_date - (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date) AS days_left
         FROM pharmacy.v_expiry_watch w WHERE w.pharmacy_id = $1 ORDER BY w.expiry_date`,
      [this.pharmacy(actor)],
    )
    const map = (r: any) => ({
      stockItemId: r.stock_item_id,
      medicineId: r.medicine_id,
      medicine: r.generic_name,
      batchNo: r.batch_no,
      expiryDate: dateStr(r.expiry_date)!,
      daysLeft: r.days_left,
      quantity: r.quantity,
      valueAtCost: r.value_at_cost,
      suggestedAction: r.bucket === 'expired' ? 'quarantine' : r.bucket === 'within_30_days' ? 'return_to_supplier' : 'use_first',
    })
    const within30 = list.filter((r) => r.bucket !== 'within_90_days')
    return {
      rule: 'FEFO: first expiry, first out. Choosing a later-expiring batch needs a reason.',
      within30Days: within30.map(map),
      within31to90Days: list.filter((r) => r.bucket === 'within_90_days').map(map),
      within30DaysValue: within30.reduce((s, r) => s + r.value_at_cost, 0),
    }
  }

  private async logRows(pharmacyId: string, from?: string, to?: string) {
    return this.db.query<any>(
      `SELECT dispensed_at, rx_number, pharmacist, generic_name, strength, outcome::text AS outcome, quantity::float AS quantity, batch_no, batch_override_reason
         FROM pharmacy.v_dispensing_log
        WHERE pharmacy_id = $1 AND dispensed_at >= COALESCE($2::date, (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
          AND dispensed_at < (COALESCE($3::date, COALESCE($2::date, (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date)) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
        ORDER BY dispensed_at DESC LIMIT 1000`,
      [pharmacyId, from ?? null, to ?? null],
    )
  }

  async dispensingLog(actor: StaffActor, from?: string, to?: string) {
    const rows = await this.logRows(this.pharmacy(actor), from, to)
    return rows.map((r) => ({
      dispensedAt: iso(r.dispensed_at), rxNumber: r.rx_number, pharmacist: r.pharmacist, medicine: `${r.generic_name} ${r.strength}`,
      outcome: r.outcome, quantity: r.quantity, batchNo: r.batch_no, batchOverrideReason: r.batch_override_reason,
    }))
  }

  async dispensingLogCsv(actor: StaffActor, from?: string, to?: string): Promise<string> {
    const rows = await this.dispensingLog(actor, from, to)
    const esc = (v: unknown) => `"${neutraliseCsvText(String(v ?? '')).replace(/"/g, '""')}"`
    const head = ['dispensed_at', 'rx_number', 'pharmacist', 'medicine', 'outcome', 'quantity', 'batch_no', 'fefo_override_reason']
    return [head.join(','), ...rows.map((r) => [r.dispensedAt, r.rxNumber, r.pharmacist, r.medicine, r.outcome, r.quantity, r.batchNo, r.batchOverrideReason].map(esc).join(','))].join('\n') + '\n'
  }

  // ---------------------------------------------------------------- recalls, ward requests
  async recalls(actor: StaffActor) {
    const rows = await this.db.query<any>(
      `SELECT r.id, r.recall_ref, r.source, r.medicine_name, r.batch_no, r.recall_class, r.issued_on, r.title, r.reason, r.urgent, r.action_text,
              a.status, a.qty_on_shelf::float AS qty_on_shelf, a.confirmed_at, a.note
         FROM pharmacy.recall_ack a JOIN pharmacy.drug_recall r ON r.id = a.recall_id WHERE a.pharmacy_id = $1 ORDER BY r.issued_on DESC, r.urgent DESC`,
      [this.pharmacy(actor)],
    )
    return rows.map((r) => ({
      recallId: r.id, recallRef: r.recall_ref, source: r.source, medicine: r.medicine_name, batchNo: r.batch_no, recallClass: r.recall_class, issuedOn: dateStr(r.issued_on)!,
      title: r.title, reason: r.reason, urgent: r.urgent, actionText: r.action_text, status: r.status, qtyOnShelf: r.qty_on_shelf, confirmedAt: iso(r.confirmed_at), note: r.note,
    }))
  }

  async confirmRecall(actor: StaffActor, recallId: string, dto: RecallConfirmRequest) {
    const pharmacyId = this.pharmacy(actor)
    const r = await this.db.query('SELECT 1 FROM pharmacy.recall_ack WHERE recall_id = $1 AND pharmacy_id = $2', [recallId, pharmacyId])
    if (r.length === 0) notFound('Recall')
    await this.ctx.tx(actor, async (c) => {
      await c.query(
        `UPDATE pharmacy.recall_ack SET status = $3, qty_on_shelf = COALESCE($4, qty_on_shelf), confirmed_by_user_id = $5, confirmed_at = util.demo_now(), note = $6 WHERE recall_id = $1 AND pharmacy_id = $2`,
        [recallId, pharmacyId, dto.status, dto.qtyOnShelf ?? null, actor.userId, dto.note ?? null],
      )
      await this.ctx.audit(c, 'pharmacy.recall.confirm', { entityType: 'pharmacy.drug_recall', entityId: recallId })
    })
    return { recallId, status: dto.status }
  }

  async wardRequests(actor: StaffActor) {
    const rows = await this.db.query<any>(
      `SELECT r.id, r.quantity::float AS quantity, r.status, r.note, r.requested_at, m.generic_name, m.strength, w.name AS ward_name, p.full_name AS requested_by
         FROM org.ward_stock_request r JOIN pharmacy.medicine m ON m.id = r.medicine_id JOIN org.ward w ON w.id = r.ward_id
         JOIN identity.app_user u ON u.id = r.requested_by_user_id JOIN identity.person p ON p.id = u.person_id
        WHERE r.pharmacy_id = $1 ORDER BY (r.status = 'requested') DESC, r.requested_at DESC LIMIT 100`,
      [this.pharmacy(actor)],
    )
    return rows.map((r) => ({ id: r.id, ward: r.ward_name, medicine: `${r.generic_name} ${r.strength}`, quantity: r.quantity, status: r.status, note: r.note, requestedBy: r.requested_by, requestedAt: iso(r.requested_at) }))
  }

  async decideWardRequest(actor: StaffActor, requestId: string, dto: PharmacyWardRequestDecision) {
    const pharmacyId = this.pharmacy(actor)
    const req = (await this.db.query<any>(`SELECT id, ward_id, medicine_id, quantity::float AS quantity, status FROM org.ward_stock_request WHERE id = $1 AND pharmacy_id = $2`, [requestId, pharmacyId]))[0]
    if (!req) notFound('Ward stock request')
    if (!['requested', 'approved'].includes(req.status)) throw new ConflictException({ success: false, errorMessage: `Request is already ${req.status}` })
    return this.ctx.tx(actor, async (c) => {
      if (dto.decision === 'rejected') {
        await c.query(`UPDATE org.ward_stock_request SET status = 'rejected', decided_by_user_id = $2, note = COALESCE($3, note) WHERE id = $1`, [requestId, actor.userId, dto.note ?? null])
        return { id: requestId, status: 'rejected' }
      }
      let need = req.quantity
      const bs = (
        await c.query(
          `SELECT id, quantity::float AS quantity FROM pharmacy.stock_item WHERE pharmacy_id = $1 AND medicine_id = $2 AND quantity > 0 AND blocked_reason IS NULL AND expiry_date >= (util.demo_now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY expiry_date FOR UPDATE`,
          [pharmacyId, req.medicine_id],
        )
      ).rows
      for (const b of bs) {
        if (need <= 0) break
        const take = Math.min(need, b.quantity)
        await c.query(`INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta, reason, ref_table, ref_id, by_user_id) VALUES ($1,$2,'transfer',$3,'Issued to ward',$4,$5,$6)`, [pharmacyId, b.id, -take, 'org.ward_stock_request', requestId, actor.userId])
        need -= take
      }
      if (need > 0) throw new ConflictException({ success: false, errorMessage: `Not enough stock to issue (${need} short)` })
      await c.query(
        `INSERT INTO org.ward_stock (ward_id, medicine_id, quantity) VALUES ($1,$2,$3) ON CONFLICT (ward_id, medicine_id) DO UPDATE SET quantity = org.ward_stock.quantity + EXCLUDED.quantity`,
        [req.ward_id, req.medicine_id, req.quantity],
      )
      await c.query(`UPDATE org.ward_stock_request SET status = 'issued', decided_by_user_id = $2, fulfilled_at = util.demo_now(), note = COALESCE($3, note) WHERE id = $1`, [requestId, actor.userId, dto.note ?? null])
      await this.ctx.audit(c, 'pharmacy.ward_request.issue', { entityType: 'org.ward_stock_request', entityId: requestId })
      return { id: requestId, status: 'issued' }
    })
  }
}
