import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  AddVitalReadingRequest,
  AddVitalReadingResponse,
  VitalKind,
  VitalReadingDto,
  VitalTargetDto,
  VitalsSummaryResponse,
} from '@carefusion/shared/dist/citizen-app.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { demoNow, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import {
  BpTargets,
  KIND_LABEL,
  LOINC,
  TARGET_LABEL,
  VitalStatus,
  bmiBand,
  bmiOf,
  classifyBp,
  classifySpo2,
  classifySugar,
  classifyTemperature,
  isFlagged,
  shouldNotifyDoctor,
} from './vitals.logic'

interface ObsRow {
  id: string
  code: string
  value_num: string
  unit: string
  effective_at: Date
  source: string
  context: string | null
  note: string | null
  set_id: string | null
}

interface TargetRow {
  code: string
  low_value: string | null
  high_value: string | null
  goal_value: string | null
  unit: string
  note: string | null
}

const KIND_CODES: Record<VitalKind, string[]> = {
  bp: [LOINC.systolic],
  sugar: [LOINC.sugarFasting, LOINC.sugarOther],
  weight: [LOINC.weight],
  spo2: [LOINC.spo2],
  temperature: [LOINC.temperature],
}
const ALL_CODES = [
  LOINC.systolic,
  LOINC.diastolic,
  LOINC.pulse,
  LOINC.sugarFasting,
  LOINC.sugarOther,
  LOINC.weight,
  LOINC.spo2,
  LOINC.temperature,
]

const num = (v: string | null): number | null => (v === null ? null : Number(v))

function targetDto(t: TargetRow): VitalTargetDto {
  return {
    code: t.code,
    label: TARGET_LABEL[t.code] ?? t.code,
    low: num(t.low_value),
    high: num(t.high_value),
    goal: num(t.goal_value),
    unit: t.unit,
    note: t.note,
  }
}

function bpTargetsOf(targets: TargetRow[]): BpTargets | undefined {
  const s = targets.find((t) => t.code === LOINC.systolic)
  const d = targets.find((t) => t.code === LOINC.diastolic)
  if (!s || !d) return undefined
  return {
    systolic: { low: num(s.low_value), high: num(s.high_value) },
    diastolic: { low: num(d.low_value), high: num(d.high_value) },
  }
}

@Injectable()
export class VitalsService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  private loadTargets(tx: RequestTx, personId: string): Promise<TargetRow[]> {
    return tx.query<TargetRow>(
      `SELECT code, low_value, high_value, goal_value, unit, note
         FROM records.vital_target WHERE patient_person_id = $1 AND valid @> now() ORDER BY code`,
      [personId],
    )
  }

  async targets(c: CitizenCtx): Promise<VitalTargetDto[]> {
    const rows = await this.requestDb.run(c.user, (tx) => this.loadTargets(tx, c.personId))
    return rows.map(targetDto)
  }

  /** Readings, newest first. BP rows are merged with their diastolic and pulse partner. */
  async readings(c: CitizenCtx, opts: { kind?: VitalKind; days: number; limit: number }): Promise<VitalReadingDto[]> {
    const since = new Date(demoNow().getTime() - opts.days * 86_400_000)
    const { obs, targets } = await this.requestDb.run(c.user, async (tx) => ({
      obs: await tx.query<ObsRow>(this.obsSql(), [c.personId, ALL_CODES, since]),
      targets: await this.loadTargets(tx, c.personId),
    }))
    const list = this.buildReadings(obs, targets)
    const filtered = opts.kind ? list.filter((r) => r.kind === opts.kind) : list
    return filtered.slice(0, opts.limit)
  }

  private obsSql(): string {
    return `SELECT id, code, value_num::text AS value_num, unit, effective_at, source::text AS source, context, note, set_id
              FROM records.vital_observation
             WHERE patient_person_id = $1 AND NOT entered_in_error AND code = ANY ($2::text[]) AND effective_at >= $3
             ORDER BY effective_at DESC, id DESC`
  }

  private buildReadings(obs: ObsRow[], targets: TargetRow[]): VitalReadingDto[] {
    const bpT = bpTargetsOf(targets)
    const sugarT = targets.find((t) => t.code === LOINC.sugarFasting)
    const bySet = new Map<string, ObsRow[]>()
    const byTime = new Map<string, ObsRow[]>()
    for (const o of obs) {
      if (o.set_id) bySet.set(o.set_id, [...(bySet.get(o.set_id) ?? []), o])
      const key = `${o.effective_at.getTime()}`
      byTime.set(key, [...(byTime.get(key) ?? []), o])
    }
    const partner = (o: ObsRow, code: string): ObsRow | undefined => {
      const group = o.set_id ? bySet.get(o.set_id) : byTime.get(`${o.effective_at.getTime()}`)
      return group?.find((g) => g.code === code)
    }
    const out: VitalReadingDto[] = []
    for (const o of obs) {
      const base = { id: o.id, measuredAt: isoReq(o.effective_at), context: o.context, note: o.note, source: o.source }
      if (o.code === LOINC.systolic) {
        const d = partner(o, LOINC.diastolic)
        if (!d) continue
        const p = partner(o, LOINC.pulse)
        const sys = Number(o.value_num)
        const dia = Number(d.value_num)
        const status = classifyBp(sys, dia, bpT)
        out.push({
          ...base,
          kind: 'bp',
          label: KIND_LABEL.bp,
          display: `${sys}/${dia} mmHg`,
          value: null,
          systolic: sys,
          diastolic: dia,
          pulse: p ? Number(p.value_num) : null,
          unit: o.unit,
          status,
          flagged: isFlagged(status),
        })
      } else if (o.code === LOINC.sugarFasting || o.code === LOINC.sugarOther) {
        const v = Number(o.value_num)
        const status = classifySugar(v, o.code === LOINC.sugarFasting ? 'fasting' : o.context, num(sugarT?.high_value ?? null))
        out.push({
          ...base,
          kind: 'sugar',
          label: o.code === LOINC.sugarFasting ? 'Fasting sugar' : 'Sugar',
          display: `${v} mg/dL`,
          value: v,
          systolic: null,
          diastolic: null,
          pulse: null,
          unit: o.unit,
          status,
          flagged: isFlagged(status),
        })
      } else if (o.code === LOINC.weight) {
        const v = Number(o.value_num)
        out.push({ ...base, kind: 'weight', label: KIND_LABEL.weight, display: `${v} kg`, value: v, systolic: null, diastolic: null, pulse: null, unit: o.unit, status: 'normal', flagged: false })
      } else if (o.code === LOINC.spo2) {
        const v = Number(o.value_num)
        const p = partner(o, LOINC.pulse)
        const status = classifySpo2(v)
        out.push({ ...base, kind: 'spo2', label: KIND_LABEL.spo2, display: `${v}%`, value: v, systolic: null, diastolic: null, pulse: p ? Number(p.value_num) : null, unit: o.unit, status, flagged: isFlagged(status) })
      } else if (o.code === LOINC.temperature) {
        const v = Number(o.value_num)
        const status = classifyTemperature(v)
        out.push({ ...base, kind: 'temperature', label: KIND_LABEL.temperature, display: `${v} °C`, value: v, systolic: null, diastolic: null, pulse: null, unit: o.unit, status, flagged: isFlagged(status) })
      }
    }
    return out
  }

  async summary(c: CitizenCtx): Promise<VitalsSummaryResponse> {
    const now = demoNow()
    const since = new Date(now.getTime() - 120 * 86_400_000) // covers 12 weeks of weight and 30 days of BP
    const data = await this.requestDb.run(c.user, async (tx) => {
      const obs = await tx.query<ObsRow>(this.obsSql(), [c.personId, ALL_CODES, since])
      const targets = await this.loadTargets(tx, c.personId)
      const single = await tx.query<{ code: string; value_num: string; unit: string; effective_at: Date }>(
        `SELECT DISTINCT ON (code) code, value_num::text AS value_num, unit, effective_at
           FROM records.vital_observation
          WHERE patient_person_id = $1 AND NOT entered_in_error AND code = ANY ($2::text[])
          ORDER BY code, effective_at DESC`,
        [c.personId, [LOINC.height, LOINC.hba1c]],
      )
      return { obs, targets, single }
    })
    const readings = this.buildReadings(data.obs, data.targets)
    const latest: VitalsSummaryResponse['latest'] = {}
    for (const r of readings) if (!latest[r.kind]) latest[r.kind] = r // list is newest-first

    // BP over the last 30 days
    const bpT = bpTargetsOf(data.targets)
    const cutoff30 = now.getTime() - 30 * 86_400_000
    const bp = readings.filter((r) => r.kind === 'bp' && new Date(r.measuredAt).getTime() >= cutoff30)
    const inRange = bp.filter((r) => r.status === 'in_range' || r.status === 'normal').length
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
    const highest = bp.reduce<VitalReadingDto | null>(
      (best, r) => (!best || (r.systolic ?? 0) > (best.systolic ?? 0) ? r : best),
      null,
    )

    // Weight, BMI
    const heightRow = data.single.find((s) => s.code === LOINC.height)
    const heightCm = heightRow ? Number(heightRow.value_num) : null
    const weightT = data.targets.find((t) => t.code === LOINC.weight)
    const latestWeight = latest.weight?.value ?? null
    const bmi = latestWeight !== null && heightCm ? bmiOf(latestWeight, heightCm) : null

    const hba1c = data.single.find((s) => s.code === LOINC.hba1c)
    const hba1cT = data.targets.find((t) => t.code === LOINC.hba1c)
    const sugarT = data.targets.find((t) => t.code === LOINC.sugarFasting)
    const cutoff8w = now.getTime() - 56 * 86_400_000
    const cutoff12w = now.getTime() - 84 * 86_400_000

    return {
      latest,
      bp30: {
        days: 30,
        count: bp.length,
        inRange,
        avgSystolic: avg(bp.map((r) => r.systolic!)),
        avgDiastolic: avg(bp.map((r) => r.diastolic!)),
        highest: highest ? { systolic: highest.systolic!, diastolic: highest.diastolic!, measuredAt: highest.measuredAt } : null,
        series: bp
          .map((r) => ({ measuredAt: r.measuredAt, systolic: r.systolic!, diastolic: r.diastolic! }))
          .reverse(),
      },
      sugar: {
        target: sugarT ? targetDto(sugarT) : null,
        series: readings
          .filter((r) => r.kind === 'sugar' && r.label === 'Fasting sugar' && new Date(r.measuredAt).getTime() >= cutoff8w)
          .map((r) => ({ measuredAt: r.measuredAt, value: r.value! }))
          .reverse(),
      },
      weight: {
        heightCm,
        goalKg: num(weightT?.goal_value ?? null),
        bmi,
        bmiBand: bmi !== null ? bmiBand(bmi) : null,
        series: readings
          .filter((r) => r.kind === 'weight' && new Date(r.measuredAt).getTime() >= cutoff12w)
          .map((r) => ({ measuredAt: r.measuredAt, value: r.value! }))
          .reverse(),
      },
      hba1c: {
        value: hba1c ? Number(hba1c.value_num) : null,
        unit: hba1c?.unit ?? '%',
        measuredAt: hba1c ? isoReq(hba1c.effective_at) : null,
        targetMax: num(hba1cT?.high_value ?? null),
      },
      targets: data.targets.map(targetDto),
      devices: [
        { name: 'Bluetooth BP monitor', status: 'Coming soon', hint: 'Pair from the phone app' },
        { name: 'Glucometer', status: 'Coming soon', hint: 'Type readings in for now' },
        { name: 'Phone health apps', status: 'Coming soon', hint: 'Steps and sleep, read-only' },
      ],
    }
  }

  async addReading(c: CitizenCtx, req: AddVitalReadingRequest): Promise<AddVitalReadingResponse> {
    const now = demoNow()
    const when = req.measuredAt ? new Date(req.measuredAt) : now
    if (when.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException('measuredAt cannot be in the future')

    return this.requestDb.run(c.user, async (tx) => {
      const targets = await this.loadTargets(tx, c.personId)
      const insert = async (code: string, value: number, unit: string, context: string | null, setId: string | null) => {
        const rows = await tx.query<{ id: string }>(
          `INSERT INTO records.vital_observation
             (patient_person_id, code, value_num, unit, effective_at, source, recorded_by_user_id, context, note, set_id)
           VALUES ($1, $2, $3, $4, $5, 'self_reported', $6, $7, $8, $9::uuid) RETURNING id`,
          [c.personId, code, value, unit, when, c.userId, context, req.note ?? null, setId],
        )
        return rows[0]!.id
      }

      let status: VitalStatus
      let summary: string
      let firstId: string
      if (req.kind === 'bp') {
        const setId = (await tx.query<{ id: string }>('SELECT util.uuid_v7() AS id'))[0]!.id
        firstId = await insert(LOINC.systolic, req.systolic, 'mm[Hg]', 'sitting', setId)
        await insert(LOINC.diastolic, req.diastolic, 'mm[Hg]', 'sitting', setId)
        if (req.pulse !== undefined) await insert(LOINC.pulse, req.pulse, '/min', 'sitting', setId)
        status = classifyBp(req.systolic, req.diastolic, bpTargetsOf(targets))
        summary = `Blood pressure ${req.systolic}/${req.diastolic} mmHg`
      } else if (req.kind === 'sugar') {
        const code = req.context === 'fasting' ? LOINC.sugarFasting : LOINC.sugarOther
        firstId = await insert(code, req.value, 'mg/dL', req.context, null)
        const t = targets.find((x) => x.code === LOINC.sugarFasting)
        status = classifySugar(req.value, req.context, num(t?.high_value ?? null))
        summary = `Sugar ${req.value} mg/dL (${req.context.replace('_', ' ')})`
      } else if (req.kind === 'weight') {
        firstId = await insert(LOINC.weight, req.value, 'kg', null, null)
        status = 'normal'
        summary = `Weight ${req.value} kg`
      } else if (req.kind === 'spo2') {
        const setId = req.pulse !== undefined ? (await tx.query<{ id: string }>('SELECT util.uuid_v7() AS id'))[0]!.id : null
        firstId = await insert(LOINC.spo2, req.value, '%', null, setId)
        if (req.pulse !== undefined) await insert(LOINC.pulse, req.pulse, '/min', null, setId)
        status = classifySpo2(req.value)
        summary = `SpO2 ${req.value}%`
      } else {
        firstId = await insert(LOINC.temperature, req.value, 'Cel', req.context, null)
        status = classifyTemperature(req.value)
        summary = `Temperature ${req.value} °C`
      }

      const flagged = isFlagged(status)
      let doctorNotified = false
      if (shouldNotifyDoctor(status)) doctorNotified = await this.notifyDoctor(tx, c, summary, firstId)

      const obs = await tx.query<ObsRow>(this.obsSql(), [c.personId, ALL_CODES, new Date(when.getTime() - 1000)])
      const mine = this.buildReadings(obs, targets).filter((r) => r.id === firstId)
      return { readings: mine, flagged, doctorNotified }
    })
  }

  /** Tell the doctor who last saw the patient: a direct event plus a clinical alert in their inbox. */
  private async notifyDoctor(tx: RequestTx, c: CitizenCtx, summary: string, sourceId: string): Promise<boolean> {
    const visit = await tx.query<{ doctor_user_id: string | null; hospital_id: string }>(
      `SELECT doctor_user_id, hospital_id FROM engage.op_visit
        WHERE patient_person_id = $1 AND doctor_user_id IS NOT NULL
        ORDER BY visit_date DESC, created_at DESC LIMIT 1`,
      [c.personId],
    )
    const v = visit[0]
    if (!v?.doctor_user_id) return false
    const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Patient'
    const ev = await this.events.emit(tx, {
      type: 'vitals',
      to: ['doctor'],
      toUserId: v.doctor_user_id,
      title: `Home reading outside target · ${name}`,
      text: `${summary} · self-reported`,
      patientPersonId: c.personId,
      hospitalId: v.hospital_id,
      entityType: 'records.vital_observation',
      entityId: sourceId,
    })
    await tx.query(
      `INSERT INTO records.clinical_alert
         (kind, severity, patient_person_id, hospital_id, target_user_id, title, detail, source_table, source_id, event_id)
       VALUES ('home_reading', 'warning', $1, $2, $3, $4, $5, 'records.vital_observation', $6, $7)`,
      [c.personId, v.hospital_id, v.doctor_user_id, `Home reading outside target · ${name}`, `${summary} · self-reported`, sourceId, ev.id],
    )
    return true
  }
}
