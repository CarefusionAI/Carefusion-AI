import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CitizenDoseDto,
  CitizenDoseSlotDto,
  CitizenDoseSlotKey,
  CitizenFinderQuery,
  CitizenFinderResponse,
  CitizenFinderResultDto,
  CitizenJourneyStepDto,
  CitizenMedicinesSummaryResponse,
  CitizenMedicinesTodayResponse,
  CitizenPastPrescriptionDto,
  CitizenPharmacyQueueDto,
  CitizenPrescriptionDto,
  CitizenPrescriptionItemDto,
  CitizenPrescriptionsResponse,
  CitizenRefillDto,
} from '@carefusion/shared/dist/citizen-extras.js'
import { DatabaseService } from '../database/database.service'
import { RequestDbService, RequestTx } from '../events/request-db.service'
import type { CitizenCtx } from '../citizen-app/common/citizen-request'
import { demoNow, istDate, isoReq } from '../citizen-app/common/clock'
import { addDays, daysBetween, hhmmIst, openStatus, shortPlace } from './medicines.logic'

const SLOT_LABEL: Record<CitizenDoseSlotKey, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}
const SLOT_ORDER: CitizenDoseSlotKey[] = ['morning', 'afternoon', 'evening', 'night']

function slotOf(hhmm: string): CitizenDoseSlotKey {
  const h = Number(hhmm.slice(0, 2))
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

const FOOD: Record<string, string> = { before: 'before food', with: 'with food', after: 'after food' }

function medicineLabel(generic: string, strength: string, form?: string): string {
  return `${generic} ${strength}${form ? ` ${form}` : ''}`.replace(/\s+/g, ' ').trim()
}

interface DoseRow {
  id: string
  prescription_item_id: string
  scheduled_for: Date
  hhmm: string
  taken_at: Date | null
  skipped: boolean
  generic_name: string
  strength: string
  dose: string
  with_food: string | null
  sched_date: string
}

interface ItemRow {
  id: string
  prescription_id: string
  generic_name: string
  strength: string
  form: string
  dose: string
  frequency: string
  duration_days: number
  quantity: string
  instructions: string | null
  with_food: string | null
  has_schedule: boolean
  allergy_warning_shown: boolean
  interaction_warning_shown: boolean
  check_results: Record<string, unknown> | null
  taken: number
}

interface RxRow {
  id: string
  rx_number: string
  issued_at: Date
  issued_date: string
  valid_until: Date
  status: string
  doctor_name: string
  specialisation: string | null
  hospital_name: string
  sent: boolean
  pharmacy_id: string | null
  pharmacy_name: string | null
  verified_at: Date | null
  ready_at: Date | null
  collected_at: Date | null
  verifier_name: string | null
}

@Injectable()
export class MedicinesService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly db: DatabaseService,
  ) {}

  // ------------------------------------------------------------------ today's doses
  async today(c: CitizenCtx): Promise<CitizenMedicinesTodayResponse> {
    return this.requestDb.run(c.user, (tx) => this.todayIn(tx, c))
  }

  private async todayIn(tx: RequestTx, c: CitizenCtx): Promise<CitizenMedicinesTodayResponse> {
    const now = demoNow()
    const today = istDate(now)
    const rows = await tx.query<DoseRow>(
      `SELECT d.id, d.prescription_item_id, d.scheduled_for,
              to_char(d.scheduled_for AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS hhmm,
              d.taken_at, d.skipped, m.generic_name, m.strength, i.dose, i.with_food,
              (d.scheduled_for AT TIME ZONE 'Asia/Kolkata')::date::text AS sched_date
         FROM records.dose_log d
         JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
         JOIN pharmacy.prescription rx ON rx.id = i.prescription_id
         JOIN pharmacy.medicine m ON m.id = i.medicine_id
        WHERE d.patient_person_id = $1
          AND (d.scheduled_for AT TIME ZONE 'Asia/Kolkata')::date = $2::date
          AND rx.status <> 'cancelled'
        ORDER BY d.scheduled_for, m.generic_name`,
      [c.personId, today],
    )
    const bySlot = new Map<CitizenDoseSlotKey, CitizenDoseDto[]>()
    let taken = 0
    let next: { medicine: string; time: string } | null = null
    for (const r of rows) {
      const status: CitizenDoseDto['status'] = r.taken_at ? 'taken' : r.skipped ? 'skipped' : 'pending'
      if (status === 'taken') taken++
      if (!next && status === 'pending' && r.scheduled_for > now) {
        next = { medicine: `${r.generic_name} ${r.strength}`, time: r.hhmm }
      }
      const dto: CitizenDoseDto = {
        id: r.id,
        prescriptionItemId: r.prescription_item_id,
        medicine: `${r.generic_name} ${r.strength}`,
        how: [r.dose, r.with_food ? FOOD[r.with_food] : null].filter(Boolean).join(' · '),
        scheduledFor: isoReq(r.scheduled_for),
        time: r.hhmm,
        slot: slotOf(r.hhmm),
        status,
        takenAt: r.taken_at ? isoReq(r.taken_at) : null,
        canToggle: r.sched_date <= today,
      }
      const list = bySlot.get(dto.slot) ?? []
      list.push(dto)
      bySlot.set(dto.slot, list)
    }
    const slots: CitizenDoseSlotDto[] = SLOT_ORDER.filter((k) => bySlot.has(k)).map((k) => {
      const doses = bySlot.get(k)!
      return { key: k, label: SLOT_LABEL[k], time: doses[0]!.time, doses }
    })
    return { date: today, takenCount: taken, totalCount: rows.length, nextDose: next, slots }
  }

  async setDose(c: CitizenCtx, doseId: string, taken: boolean): Promise<CitizenMedicinesTodayResponse> {
    const now = demoNow()
    const today = istDate(now)
    return this.requestDb.run(c.user, async (tx) => {
      const cur = (
        await tx.query<{ id: string; sched_date: string }>(
          `SELECT id, (scheduled_for AT TIME ZONE 'Asia/Kolkata')::date::text AS sched_date
             FROM records.dose_log WHERE id = $1 AND patient_person_id = $2`,
          [doseId, c.personId],
        )
      )[0]
      if (!cur) throw new NotFoundException('Dose not found')
      if (cur.sched_date > today) throw new BadRequestException('You can only tick doses for today or earlier')
      await tx.query(
        `UPDATE records.dose_log SET taken_at = $2, skipped = false, source = 'self' WHERE id = $1 AND patient_person_id = $3`,
        [doseId, taken ? now : null, c.personId],
      )
      return this.todayIn(tx, c)
    })
  }

  // ------------------------------------------------------------------ prescriptions
  private async loadRx(tx: RequestTx, c: CitizenCtx): Promise<{ rx: RxRow; items: ItemRow[] }[]> {
    const rxs = await tx.query<RxRow>(
      `SELECT rx.id, rx.rx_number, rx.issued_at, (rx.issued_at AT TIME ZONE 'Asia/Kolkata')::date::text AS issued_date,
              rx.valid_until, rx.status::text AS status, dpp.full_name AS doctor_name, dp.specialisation, h.name AS hospital_name,
              EXISTS (SELECT 1 FROM pharmacy.prescription_delivery pd WHERE pd.prescription_id = rx.id) AS sent,
              f.pharmacy_id, ph.name AS pharmacy_name, f.verified_at, f.ready_at, f.collected_at, vp.full_name AS verifier_name
         FROM pharmacy.prescription rx
         JOIN identity.app_user du ON du.id = rx.doctor_user_id
         JOIN identity.person dpp ON dpp.id = du.person_id
         LEFT JOIN identity.doctor_profile dp ON dp.user_id = rx.doctor_user_id
         JOIN org.hospital h ON h.id = rx.hospital_id
         LEFT JOIN pharmacy.rx_fulfilment f ON f.prescription_id = rx.id
         LEFT JOIN org.pharmacy ph ON ph.id = f.pharmacy_id
         LEFT JOIN identity.app_user vu ON vu.id = f.verified_by_user_id
         LEFT JOIN identity.person vp ON vp.id = vu.person_id
        WHERE rx.patient_person_id = $1
        ORDER BY rx.issued_at DESC`,
      [c.personId],
    )
    if (rxs.length === 0) return []
    const items = await tx.query<ItemRow>(
      `SELECT i.id, i.prescription_id, m.generic_name, m.strength, m.form, i.dose, i.frequency, i.duration_days,
              i.quantity::text AS quantity, i.instructions, i.with_food, (cardinality(i.schedule_times) > 0) AS has_schedule,
              i.allergy_warning_shown, i.interaction_warning_shown, i.check_results,
              (SELECT count(*)::int FROM records.dose_log d WHERE d.prescription_item_id = i.id AND d.taken_at IS NOT NULL) AS taken
         FROM pharmacy.prescription_item i
         JOIN pharmacy.medicine m ON m.id = i.medicine_id
        WHERE i.prescription_id = ANY($1::uuid[])
        ORDER BY m.generic_name`,
      [rxs.map((r) => r.id)],
    )
    return rxs.map((rx) => ({ rx, items: items.filter((i) => i.prescription_id === rx.id) }))
  }

  private itemDto(rx: RxRow, i: ItemRow, today: string): CitizenPrescriptionItemDto {
    const endsOn = addDays(rx.issued_date, i.duration_days)
    const ended = endsOn < today
    const left = i.has_schedule ? Math.max(0, Math.round(Number(i.quantity) - i.taken)) : null
    return {
      id: i.id,
      medicine: medicineLabel(i.generic_name, i.strength, i.form),
      dose: i.dose,
      frequency: i.frequency,
      withFood: i.with_food ? (FOOD[i.with_food] ?? null) : null,
      instructions: i.instructions,
      durationDays: i.duration_days,
      unitsLeft: left,
      endsOn,
      ended,
      endingSoon: !ended && daysBetween(today, endsOn) <= 7,
    }
  }

  private isActive(rx: RxRow, items: ItemRow[], today: string): boolean {
    if (rx.status === 'cancelled' || rx.status === 'expired') return false
    return items.some((i) => addDays(rx.issued_date, i.duration_days) >= addDays(today, -7))
  }

  private fulfilment(rx: RxRow): Pick<CitizenPrescriptionDto, 'fulfilment' | 'fulfilmentLabel' | 'fulfilmentAt'> {
    if (rx.collected_at) {
      return { fulfilment: 'collected', fulfilmentLabel: `Collected ${hhmmIst(rx.collected_at)}`, fulfilmentAt: isoReq(rx.collected_at) }
    }
    if (rx.ready_at) {
      return { fulfilment: 'ready', fulfilmentLabel: `Ready to collect ${hhmmIst(rx.ready_at)}`, fulfilmentAt: isoReq(rx.ready_at) }
    }
    if (rx.verified_at) {
      return { fulfilment: 'verified', fulfilmentLabel: `Verified ${hhmmIst(rx.verified_at)}`, fulfilmentAt: isoReq(rx.verified_at) }
    }
    if (rx.sent) return { fulfilment: 'sent', fulfilmentLabel: 'Sent to pharmacy', fulfilmentAt: null }
    return { fulfilment: 'none', fulfilmentLabel: 'Signed', fulfilmentAt: isoReq(rx.issued_at) }
  }

  private journey(rx: RxRow, items: CitizenPrescriptionItemDto[], refills: Map<string, CitizenRefillDto>): CitizenJourneyStepDto[] {
    const place = rx.pharmacy_name ? shortPlace(rx.pharmacy_name) : null
    const ongoing = items.filter((i) => !i.ended)
    const refillDates = ongoing.map((i) => refills.get(i.id)?.refillBy).filter((d): d is string => !!d).sort()
    const nextStep: CitizenJourneyStepDto = refillDates.length
      ? { key: 'next', label: 'Refill due', at: null, done: false, detail: refillDates[0]! }
      : {
          key: 'next',
          label: 'Course ends',
          at: null,
          done: items.every((i) => i.ended),
          detail: items.map((i) => i.endsOn).sort().slice(-1)[0] ?? null,
        }
    return [
      { key: 'signed', label: 'Signed by doctor', at: isoReq(rx.issued_at), done: true, detail: rx.doctor_name },
      {
        key: 'verified',
        label: 'Verified by pharmacist',
        at: rx.verified_at ? isoReq(rx.verified_at) : null,
        done: !!rx.verified_at,
        detail: rx.verifier_name,
      },
      rx.collected_at
        ? { key: 'ready', label: place ? `Dispensed · ${place}` : 'Dispensed', at: isoReq(rx.collected_at), done: true, detail: null }
        : {
            key: 'ready',
            label: 'Ready to collect',
            at: rx.ready_at ? isoReq(rx.ready_at) : null,
            done: !!rx.ready_at,
            detail: place,
          },
      nextStep,
    ]
  }

  private pastStatus(rx: RxRow, items: ItemRow[]): CitizenPastPrescriptionDto['status'] {
    if (rx.status === 'cancelled') return items.some((i) => /^replaced/i.test(i.instructions ?? '')) ? 'Replaced' : 'Cancelled'
    if (rx.status === 'expired') return 'Expired'
    return 'Completed'
  }

  async prescriptions(c: CitizenCtx): Promise<CitizenPrescriptionsResponse> {
    const today = istDate(demoNow())
    return this.requestDb.run(c.user, async (tx) => {
      const all = await this.loadRx(tx, c)
      const refills = await this.refillsIn(tx, c, all)
      const refillByItem = new Map(refills.map((r) => [r.prescriptionItemId, r]))
      const active: CitizenPrescriptionDto[] = []
      const past: CitizenPastPrescriptionDto[] = []
      for (const { rx, items } of all) {
        if (this.isActive(rx, items, today)) {
          const dtoItems = items.map((i) => this.itemDto(rx, i, today))
          const allergy = items.map((i) => i.check_results?.allergy).find((a): a is string => typeof a === 'string')
          const interaction = items.map((i) => i.check_results?.interaction).find((a): a is string => typeof a === 'string')
          active.push({
            id: rx.id,
            rxNumber: rx.rx_number,
            doctorName: rx.doctor_name,
            specialisation: rx.specialisation,
            hospitalName: rx.hospital_name,
            issuedAt: isoReq(rx.issued_at),
            validUntil: isoReq(rx.valid_until),
            status: rx.status,
            ...this.fulfilment(rx),
            pharmacyName: rx.pharmacy_name,
            items: dtoItems,
            journey: this.journey(rx, dtoItems, refillByItem),
            allergyNote: items.some((i) => i.allergy_warning_shown)
              ? 'An allergy warning was shown to your doctor before signing.'
              : allergy
                ? `Allergy check passed: ${allergy}.`
                : 'Checked against your recorded allergies when signed.',
            interactionNote: items.some((i) => i.interaction_warning_shown)
              ? 'Interaction warning reviewed by your doctor'
              : !interaction || interaction === 'none'
                ? 'No conflicts found'
                : interaction,
            courseEnded: dtoItems.every((i) => i.ended),
          })
        } else {
          past.push({
            id: rx.id,
            rxNumber: rx.rx_number,
            issuedAt: isoReq(rx.issued_at),
            doctorName: rx.doctor_name,
            medicines: items.map((i) => `${i.generic_name} ${i.strength}`).join(', '),
            status: this.pastStatus(rx, items),
          })
        }
      }
      return { active, past }
    })
  }

  // ------------------------------------------------------------------ refills
  private async refillsIn(
    tx: RequestTx,
    c: CitizenCtx,
    all: { rx: RxRow; items: ItemRow[] }[],
  ): Promise<CitizenRefillDto[]> {
    const today = istDate(demoNow())
    const events = await tx.query<{ title: string; refill_date: string }>(
      `SELECT title, (starts_at AT TIME ZONE 'Asia/Kolkata')::date::text AS refill_date
         FROM records.dated_event
        WHERE patient_person_id = $1 AND event_type = 'refill_due' AND status = 'scheduled'
        ORDER BY starts_at`,
      [c.personId],
    )
    const out: CitizenRefillDto[] = []
    for (const { rx, items } of all) {
      if (!this.isActive(rx, items, today)) continue
      for (const i of items) {
        const dto = this.itemDto(rx, i, today)
        if (!i.has_schedule || dto.ended) continue
        const ev = events.find((e) => e.title.toLowerCase().startsWith(i.generic_name.toLowerCase()) && e.refill_date >= today)
        const refillBy = ev ? ev.refill_date : addDays(dto.endsOn, -7)
        const daysLeft = daysBetween(today, refillBy)
        if (daysLeft > 30) continue
        out.push({
          prescriptionItemId: i.id,
          medicine: medicineLabel(i.generic_name, i.strength),
          daysLeft,
          refillBy,
          fractionLeft: Math.max(0, Math.min(1, daysLeft / Math.max(1, i.duration_days))),
          unitsLeft: dto.unitsLeft,
          urgent: daysLeft <= 3,
          source: ev ? 'doctor' : 'schedule',
        })
      }
    }
    // The same medicine on two prescriptions: keep the soonest.
    const seen = new Map<string, CitizenRefillDto>()
    for (const r of out.sort((a, b) => a.daysLeft - b.daysLeft)) if (!seen.has(r.medicine)) seen.set(r.medicine, r)
    return [...seen.values()]
  }

  async refills(c: CitizenCtx): Promise<CitizenRefillDto[]> {
    return this.requestDb.run(c.user, async (tx) => this.refillsIn(tx, c, await this.loadRx(tx, c)))
  }

  // ------------------------------------------------------------------ summary
  async summary(c: CitizenCtx): Promise<CitizenMedicinesSummaryResponse> {
    const now = demoNow()
    const today = istDate(now)
    return this.requestDb.run(c.user, async (tx) => {
      const all = await this.loadRx(tx, c)
      const active = all.filter(({ rx, items }) => this.isActive(rx, items, today))
      const refills = await this.refillsIn(tx, c, all)
      const adh = await tx.query<{ due: number; taken: number; pdue: number; ptaken: number }>(
        `SELECT count(*) FILTER (WHERE d.scheduled_for > $2::timestamptz - interval '30 days')::int AS due,
                count(*) FILTER (WHERE d.scheduled_for > $2::timestamptz - interval '30 days' AND d.taken_at IS NOT NULL)::int AS taken,
                count(*) FILTER (WHERE d.scheduled_for <= $2::timestamptz - interval '30 days')::int AS pdue,
                count(*) FILTER (WHERE d.scheduled_for <= $2::timestamptz - interval '30 days' AND d.taken_at IS NOT NULL)::int AS ptaken
           FROM records.dose_log d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
           JOIN pharmacy.prescription rx ON rx.id = i.prescription_id
          WHERE d.patient_person_id = $1 AND rx.status <> 'cancelled'
            AND d.scheduled_for <= $2 AND d.scheduled_for > $2::timestamptz - interval '60 days'`,
        [c.personId, now],
      )
      const a = adh[0] ?? { due: 0, taken: 0, pdue: 0, ptaken: 0 }
      const pct = a.due > 0 ? Math.round((100 * a.taken) / a.due) : null
      const prevPct = a.pdue >= 5 ? Math.round((100 * a.ptaken) / a.pdue) : null
      const ready = active
        .filter(({ rx }) => rx.ready_at && !rx.collected_at)
        .sort((x, y) => y.rx.ready_at!.getTime() - x.rx.ready_at!.getTime())[0]
      const next = refills[0]
      return {
        activePrescriptions: active.length,
        doctors: new Set(active.map(({ rx }) => rx.doctor_name)).size,
        nextRefill: next ? { medicine: next.medicine, date: next.refillBy, daysLeft: next.daysLeft } : null,
        adherence: {
          percent: pct,
          due: a.due,
          taken: a.taken,
          windowDays: 30,
          trendPoints: pct !== null && prevPct !== null ? pct - prevPct : null,
        },
        readyToCollect: ready
          ? {
              rxNumber: ready.rx.rx_number,
              pharmacyName: ready.rx.pharmacy_name ?? 'Pharmacy',
              pharmacyId: ready.rx.pharmacy_id ?? '',
              pharmacistName: ready.rx.verifier_name,
              medicines: ready.items.map((i) => i.generic_name).join(', '),
              readyAt: isoReq(ready.rx.ready_at!),
            }
          : null,
      }
    })
  }

  // ------------------------------------------------------------------ queue token
  async queue(c: CitizenCtx): Promise<{ queue: CitizenPharmacyQueueDto | null }> {
    const now = demoNow()
    const today = istDate(now)
    const row = await this.requestDb.run(c.user, async (tx) => {
      const base = `
        SELECT q.token_label, q.token_no, q.counter, q.called_at, q.served_at, q.pharmacy_id, ph.name AS pharmacy_name,
               ph.opening_hours, rx.rx_number, vp.full_name AS pharmacist,
               CASE WHEN cp.approx_location IS NOT NULL
                    THEN round((ST_Distance(ph.location::geography, cp.approx_location::geography) / 1000)::numeric, 1)::text END AS km
          FROM pharmacy.queue_token q
          JOIN pharmacy.prescription rx ON rx.id = q.prescription_id
          JOIN org.pharmacy ph ON ph.id = q.pharmacy_id
          LEFT JOIN pharmacy.rx_fulfilment f ON f.prescription_id = rx.id
          LEFT JOIN identity.app_user vu ON vu.id = f.verified_by_user_id
          LEFT JOIN identity.person vp ON vp.id = vu.person_id
          LEFT JOIN identity.citizen_profile cp ON cp.person_id = rx.patient_person_id
         WHERE rx.patient_person_id = $1 AND q.token_date = $2::date
         ORDER BY q.issued_at DESC LIMIT 1`
      const tok = (await tx.query<any>(base, [c.personId, today]))[0]
      if (tok) return { kind: 'token' as const, tok }
      // No token today: show the pharmacy the latest prescription went to.
      const ph = (
        await tx.query<any>(
          `SELECT f.pharmacy_id, ph.name AS pharmacy_name, ph.opening_hours, rx.rx_number, vp.full_name AS pharmacist,
                  CASE WHEN cp.approx_location IS NOT NULL
                       THEN round((ST_Distance(ph.location::geography, cp.approx_location::geography) / 1000)::numeric, 1)::text END AS km
             FROM pharmacy.rx_fulfilment f
             JOIN pharmacy.prescription rx ON rx.id = f.prescription_id
             JOIN org.pharmacy ph ON ph.id = f.pharmacy_id
             LEFT JOIN identity.app_user vu ON vu.id = f.verified_by_user_id
             LEFT JOIN identity.person vp ON vp.id = vu.person_id
             LEFT JOIN identity.citizen_profile cp ON cp.person_id = rx.patient_person_id
            WHERE rx.patient_person_id = $1
            ORDER BY rx.issued_at DESC LIMIT 1`,
          [c.personId],
        )
      )[0]
      return ph ? { kind: 'pharmacy' as const, ph } : null
    })
    if (!row) return { queue: null }
    if (row.kind === 'pharmacy') {
      const open = openStatus(row.ph.opening_hours, now)
      return {
        queue: {
          pharmacyId: row.ph.pharmacy_id,
          pharmacyName: row.ph.pharmacy_name,
          pharmacistName: row.ph.pharmacist,
          counter: null,
          tokenLabel: null,
          tokenState: null,
          ahead: 0,
          waitMinutes: null,
          openNow: open.openNow,
          openText: open.text,
          distanceKm: row.ph.km === null ? null : Number(row.ph.km),
          rxNumber: row.ph.rx_number,
        },
      }
    }
    const t = row.tok
    // Anonymous count of tokens still ahead of mine at that counter (no names, so it reads outside the patient's own rows).
    const aheadRows = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pharmacy.queue_token
        WHERE pharmacy_id = $1 AND token_date = $2::date AND token_no < $3 AND served_at IS NULL`,
      [t.pharmacy_id, today, t.token_no],
    )
    const ahead = t.served_at ? 0 : (aheadRows[0]?.n ?? 0)
    const open = openStatus(t.opening_hours, now)
    return {
      queue: {
        pharmacyId: t.pharmacy_id,
        pharmacyName: t.pharmacy_name,
        pharmacistName: t.pharmacist,
        counter: t.counter,
        tokenLabel: t.token_label,
        tokenState: t.served_at ? 'served' : t.called_at ? 'called' : 'waiting',
        ahead,
        waitMinutes: t.served_at ? 0 : Math.round((ahead * 8) / 3),
        openNow: open.openNow,
        openText: open.text,
        distanceKm: t.km === null ? null : Number(t.km),
        rxNumber: t.rx_number,
      },
    }
  }

  // ------------------------------------------------------------------ medicine finder (published stock only)
  async finder(c: CitizenCtx, q: CitizenFinderQuery): Promise<CitizenFinderResponse> {
    const now = demoNow()
    const tokens = q.q
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[\\%_]/g, (m) => `\\${m}`))
    return this.requestDb.run(c.user, async (tx) => {
      const me = (
        await tx.query<{ district_id: string | null; district_name: string | null; has_loc: boolean }>(
          `SELECT cp.district_id, d.name AS district_name, (cp.approx_location IS NOT NULL) AS has_loc
             FROM identity.citizen_profile cp LEFT JOIN geo.district d ON d.id = cp.district_id WHERE cp.person_id = $1`,
          [c.personId],
        )
      )[0]
      const rows = await tx.query<{
        pharmacy_id: string
        pharmacy_name: string
        medicine_id: string
        generic_name: string
        strength: string
        form: string
        stock_level: 'in' | 'low' | 'out'
        min_price: string | null
        opening_hours: unknown
        pharmacy_type: string
        is_jan_aushadhi: boolean
        lat: number | null
        lon: number | null
        km: string | null
        district_id: string
      }>(
        `SELECT v.pharmacy_id, v.pharmacy_name, v.medicine_id, v.generic_name, v.strength, v.form, v.stock_level,
                v.min_price::text AS min_price, v.opening_hours, v.pharmacy_type::text AS pharmacy_type, ph.is_jan_aushadhi,
                ph.district_id, ST_Y(v.location) AS lat, ST_X(v.location) AS lon,
                CASE WHEN cp.approx_location IS NOT NULL
                     THEN round((ST_Distance(v.location::geography, cp.approx_location::geography) / 1000)::numeric, 1)::text END AS km
           FROM pharmacy.v_stock_status v
           JOIN org.pharmacy ph ON ph.id = v.pharmacy_id
           LEFT JOIN identity.citizen_profile cp ON cp.person_id = $1
          WHERE NOT EXISTS (SELECT 1 FROM unnest($2::text[]) t
                             WHERE (v.generic_name || ' ' || v.strength || ' ' || v.form) NOT ILIKE '%' || t || '%')
            AND ($3::boolean = false OR ph.pharmacy_type::text LIKE 'govt%' OR ph.is_jan_aushadhi)
          ORDER BY (v.stock_level = 'out'), (cp.approx_location IS NULL),
                   ST_Distance(v.location::geography, cp.approx_location::geography), v.pharmacy_name
          LIMIT 400`,
        [c.personId, tokens, q.govtOnly ?? false],
      )
      const results: CitizenFinderResultDto[] = []
      for (const r of rows) {
        const km = r.km === null ? null : Number(r.km)
        if (q.radiusKm !== undefined && km !== null && km > q.radiusKm) continue
        if (q.radiusKm === undefined && me?.district_id && r.district_id !== me.district_id) continue
        const open = openStatus(r.opening_hours, now)
        if (q.openNow && !open.openNow) continue
        results.push({
          pharmacyId: r.pharmacy_id,
          pharmacyName: r.pharmacy_name,
          medicineId: r.medicine_id,
          medicineName: medicineLabel(r.generic_name, r.strength, r.form),
          ownership: r.pharmacy_type.startsWith('govt') || r.is_jan_aushadhi ? 'govt' : 'private',
          isJanAushadhi: r.is_jan_aushadhi,
          distanceKm: km,
          openNow: open.openNow,
          hoursText: open.text,
          stockLevel: r.stock_level,
          minPrice: r.min_price === null ? null : Number(r.min_price),
          lat: r.lat,
          lon: r.lon,
        })
        if (results.length >= q.limit) break
      }
      // Log what the finder showed (coarse: pharmacy, medicine, district) for the pharmacy admin's "searches" count.
      const shown = results.filter((r) => r.stockLevel !== 'out').slice(0, 5)
      if (shown.length > 0) {
        await tx.query('SAVEPOINT finder_log')
        try {
          for (const r of shown) {
            await tx.query(
              `INSERT INTO pharmacy.stock_search_log (pharmacy_id, medicine_id, district_id) VALUES ($1, $2, $3)`,
              [r.pharmacyId, r.medicineId, me?.district_id ?? null],
            )
          }
          await tx.query('RELEASE SAVEPOINT finder_log')
        } catch {
          await tx.query('ROLLBACK TO SAVEPOINT finder_log')
        }
      }
      return {
        query: q.q,
        districtName: me?.district_name ?? null,
        results,
        note: 'Shows only stock that each pharmacy has published. Levels, not exact counts. Confirm by phone before you travel.',
      }
    })
  }
}
