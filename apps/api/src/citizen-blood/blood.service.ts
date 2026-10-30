import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CitizenBloodBanksResponse,
  CitizenBloodCampDto,
  CitizenBloodChecklistRequest,
  CitizenBloodChecklistResponse,
  CitizenBloodDonorDto,
  CitizenBloodHistoryResponse,
  CitizenBloodRequestDto,
  CitizenBloodRequestsResponse,
  CitizenBloodRespondRequest,
} from '@carefusion/shared/dist/citizen-extras.js'
import { EventsService } from '../events/events.service'
import { RequestDbService, RequestTx } from '../events/request-db.service'
import type { CitizenCtx } from '../citizen-app/common/citizen-request'
import { demoNow, iso, isoReq, istDate } from '../citizen-app/common/clock'
import {
  ALL_GROUPS,
  TYPE_LABEL,
  ageOn,
  compatibleRecipients,
  neededBy,
  nextTier,
  stockLevel,
  tierOf,
} from './blood.logic'

const RADIUS_KM = 40

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000)
}

interface Rules {
  gapDays: number
  minAge: number
  maxAge: number
  minWeight: number
  minHb: number
}

@Injectable()
export class BloodService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  private async rules(tx: RequestTx): Promise<Rules> {
    const rows = await tx.query<{ code: string; value: Record<string, number> }>(
      'SELECT code, value FROM admin.blood_eligibility_rule',
    )
    const get = (code: string, key: string, dflt: number) => Number(rows.find((r) => r.code === code)?.value?.[key] ?? dflt)
    return {
      gapDays: get('gap_after_donation', 'days', 90),
      minAge: get('min_age', 'years', 18),
      maxAge: get('max_age', 'years', 65),
      minWeight: get('min_weight_kg', 'kg', 45),
      minHb: get('min_hb_gdl', 'g_per_dl', 12.5),
    }
  }

  // ------------------------------------------------------------------ donor status
  private async donorIn(tx: RequestTx, c: CitizenCtx): Promise<{ dto: CitizenBloodDonorDto; districtId: string | null; resting: boolean }> {
    const now = demoNow()
    const today = istDate(now)
    const rules = await this.rules(tx)
    const d = (
      await tx.query<{
        blood_group: string
        district_id: string | null
        registered: boolean
        donor_code: string | null
        ready: boolean | null
        eligible_from: string | null
        last_donation_at: Date | null
        notify_circle: boolean | null
      }>(
        `SELECT cp.blood_group::text AS blood_group, cp.district_id, (d.person_id IS NOT NULL) AS registered, d.donor_code,
                d.ready, d.eligible_from::text AS eligible_from, d.last_donation_at, d.notify_circle
           FROM identity.citizen_profile cp
           LEFT JOIN donation.blood_donor d ON d.person_id = cp.person_id
          WHERE cp.person_id = $1`,
        [c.personId],
      )
    )[0]
    if (!d) throw new NotFoundException('Citizen profile not found')
    const st = (
      await tx.query<{ n: number; ml: number; first_year: number | null; last_hb: string | null }>(
        `SELECT count(*)::int AS n, coalesce(sum(volume_ml), 0)::int AS ml,
                extract(year FROM min(donated_at AT TIME ZONE 'Asia/Kolkata'))::int AS first_year,
                (SELECT hb_value::text FROM donation.blood_donation x WHERE x.donor_person_id = $1 AND x.hb_value IS NOT NULL
                  ORDER BY x.donated_at DESC LIMIT 1) AS last_hb
           FROM donation.blood_donation WHERE donor_person_id = $1`,
        [c.personId],
      )
    )[0]!
    const resting = !!d.eligible_from && d.eligible_from > today
    const last = d.last_donation_at
    const restDone = last ? Math.max(0, Math.min(rules.gapDays, daysBetween(istDate(last), today))) : rules.gapDays
    const nt = nextTier(st.n)
    const eligibleAt = resting && last ? new Date(last.getTime() + rules.gapDays * 86_400_000) : null
    const dto: CitizenBloodDonorDto = {
      registered: d.registered,
      donorCode: d.donor_code,
      bloodGroup: d.blood_group,
      ready: !!d.ready,
      eligibleFrom: d.eligible_from,
      eligibleAt: eligibleAt ? isoReq(eligibleAt) : d.eligible_from && resting ? isoReq(new Date(`${d.eligible_from}T00:00:00+05:30`)) : null,
      lastDonationAt: iso(last),
      resting,
      restDaysTotal: rules.gapDays,
      restDaysDone: restDone,
      daysUntilEligible: resting ? daysBetween(today, d.eligible_from!) : 0,
      tier: tierOf(st.n),
      nextTier: nt?.tier ?? null,
      donationsToNextTier: nt?.remaining ?? null,
      donations: st.n,
      livesHelped: st.n * 3,
      litres: Math.round(st.ml / 100) / 10,
      sinceYear: st.first_year,
      lastHb: st.last_hb === null ? null : Number(st.last_hb),
      minHb: rules.minHb,
      notifyCircle: !!d.notify_circle,
      switchNote: resting
        ? `You are resting until ${formatDay(d.eligible_from!)}. You can switch this on from that day.`
        : null,
    }
    return { dto, districtId: d.district_id, resting }
  }

  async donor(c: CitizenCtx): Promise<CitizenBloodDonorDto> {
    return this.requestDb.run(c.user, async (tx) => (await this.donorIn(tx, c)).dto)
  }

  async setAvailability(c: CitizenCtx, ready: boolean): Promise<CitizenBloodDonorDto> {
    return this.requestDb.run(c.user, async (tx) => {
      const cur = await this.donorIn(tx, c)
      if (ready && cur.resting) {
        throw new BadRequestException(`You are resting until ${formatDay(cur.dto.eligibleFrom!)}, so you cannot be available yet`)
      }
      await tx.query(
        `INSERT INTO donation.blood_donor (person_id, ready, eligibility_checked_at)
         VALUES ($1, $2, now())
         ON CONFLICT (person_id) DO UPDATE SET ready = EXCLUDED.ready, eligibility_checked_at = now()`,
        [c.personId, ready],
      )
      return (await this.donorIn(tx, c)).dto
    })
  }

  // ------------------------------------------------------------------ requests nearby + camps
  async requests(c: CitizenCtx): Promise<CitizenBloodRequestsResponse> {
    const now = demoNow()
    return this.requestDb.run(c.user, async (tx) => {
      const donor = await this.donorIn(tx, c)
      const groups = compatibleRecipients(donor.dto.bloodGroup)
      const rows = await tx.query<{
        id: string
        hospital_id: string
        hospital_name: string
        blood_group: string
        units: number
        urgency: 'normal' | 'urgent' | 'critical'
        created_at: Date
        closes_at: Date
        response: 'will_donate' | 'cannot' | null
        responded_at: Date | null
        km: string | null
      }>(
        `SELECT br.id, br.hospital_id, h.name AS hospital_name, br.blood_group::text AS blood_group, br.units, br.urgency::text AS urgency,
                br.created_at, br.closes_at, r.response, r.responded_at,
                CASE WHEN cp.approx_location IS NOT NULL
                     THEN round((ST_Distance(h.location::geography, cp.approx_location::geography) / 1000)::numeric, 1)::text END AS km
           FROM donation.blood_request br
           JOIN org.hospital h ON h.id = br.hospital_id
           LEFT JOIN donation.blood_request_response r ON r.request_id = br.id AND r.donor_person_id = $1
           LEFT JOIN identity.citizen_profile cp ON cp.person_id = $1
          WHERE br.status = 'open' AND br.closes_at > $3 AND br.blood_group::text = ANY($2::text[])
          ORDER BY (br.urgency = 'critical') DESC, (br.urgency = 'urgent') DESC, br.closes_at`,
        [c.personId, groups, now],
      )
      const requests: CitizenBloodRequestDto[] = rows
        .filter((r) => r.km === null || Number(r.km) <= RADIUS_KM)
        .map((r) => {
          const km = r.km === null ? null : Number(r.km)
          return {
            id: r.id,
            hospitalId: r.hospital_id,
            hospitalName: r.hospital_name,
            bloodGroup: r.blood_group,
            units: r.units,
            urgency: r.urgency,
            createdAt: isoReq(r.created_at),
            closesAt: isoReq(r.closes_at),
            distanceKm: km,
            meta: [
              r.blood_group,
              `${r.units} unit${r.units === 1 ? '' : 's'}`,
              `needed ${neededBy(r.closes_at, now)}`,
              km === null ? null : `${km} km`,
            ]
              .filter(Boolean)
              .join(' · '),
            myResponse: r.response,
            respondedAt: iso(r.responded_at),
            canDonate: !donor.resting,
          }
        })
      const campRows = await tx.query<{
        id: string
        name: string
        venue: string
        host_name: string | null
        starts_at: Date
        ends_at: Date
        status: string
        target_units: number | null
        pledged: boolean
        km: string | null
      }>(
        `SELECT cmp.id, cmp.name, cmp.venue, hh.name AS host_name, cmp.starts_at, cmp.ends_at, cmp.status, cmp.target_units,
                EXISTS (SELECT 1 FROM donation.camp_pledge p WHERE p.camp_id = cmp.id AND p.donor_person_id = $1) AS pledged,
                CASE WHEN cp.approx_location IS NOT NULL AND COALESCE(hh.location, bb.location) IS NOT NULL
                     THEN round((ST_Distance(COALESCE(hh.location, bb.location)::geography, cp.approx_location::geography) / 1000)::numeric, 1)::text END AS km
           FROM donation.blood_camp cmp
           LEFT JOIN org.hospital hh ON hh.id = cmp.host_hospital_id
           LEFT JOIN donation.blood_bank bb ON bb.id = cmp.blood_bank_id
           LEFT JOIN identity.citizen_profile cp ON cp.person_id = $1
          WHERE cmp.status IN ('planned', 'open') AND cmp.ends_at > $2
            AND ($3::uuid IS NULL OR cmp.district_id = $3)
          ORDER BY cmp.starts_at
          LIMIT 6`,
        [c.personId, now, donor.districtId],
      )
      const camps: CitizenBloodCampDto[] = campRows.map((r) => ({
        id: r.id,
        name: r.name,
        venue: r.venue,
        hostName: r.host_name,
        startsAt: isoReq(r.starts_at),
        endsAt: isoReq(r.ends_at),
        distanceKm: r.km === null ? null : Number(r.km),
        status: r.status,
        pledged: r.pledged,
        eligibleOnDay: !donor.dto.eligibleFrom || donor.dto.eligibleFrom <= istDate(r.starts_at),
        targetUnits: r.target_units,
      }))
      return { radiusKm: RADIUS_KM, compatibleGroups: groups, requests, camps }
    })
  }

  async respond(c: CitizenCtx, requestId: string, body: CitizenBloodRespondRequest): Promise<CitizenBloodRequestsResponse> {
    const now = demoNow()
    await this.requestDb.run(c.user, async (tx) => {
      const donor = await this.donorIn(tx, c)
      const req = (
        await tx.query<{ id: string; hospital_id: string; blood_group: string; units: number; status: string; closes_at: Date; hospital_name: string }>(
          `SELECT br.id, br.hospital_id, br.blood_group::text AS blood_group, br.units, br.status::text AS status, br.closes_at, h.name AS hospital_name
             FROM donation.blood_request br JOIN org.hospital h ON h.id = br.hospital_id WHERE br.id = $1`,
          [requestId],
        )
      )[0]
      if (!req) throw new NotFoundException('Blood request not found')
      if (req.status !== 'open' || req.closes_at <= now) throw new BadRequestException('This request is closed')
      if (body.response === 'will_donate') {
        if (donor.resting) {
          throw new BadRequestException(`You are resting until ${formatDay(donor.dto.eligibleFrom!)}. You can tell your circle instead.`)
        }
        if (!compatibleRecipients(donor.dto.bloodGroup).includes(req.blood_group)) {
          throw new BadRequestException('Your blood group cannot give to this request')
        }
      }
      await tx.query(
        `INSERT INTO donation.blood_request_response (request_id, donor_person_id, response, responded_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (request_id, donor_person_id) DO UPDATE SET response = EXCLUDED.response, responded_at = now()`,
        [requestId, c.personId, body.response],
      )
      if (body.response === 'cannot' && body.notifyCircle && donor.dto.registered) {
        await tx.query('UPDATE donation.blood_donor SET notify_circle = true WHERE person_id = $1', [c.personId])
      }
      if (body.response === 'will_donate') {
        const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'A donor'
        await this.events.emit(tx, {
          type: 'blood-response',
          to: ['doctor'],
          title: `Donor available · ${req.blood_group} · ${name}`,
          text: `Responding to: ${req.blood_group} · ${req.units} unit${req.units === 1 ? '' : 's'} · ${req.hospital_name}`,
          hospitalId: req.hospital_id,
          entityType: 'donation.blood_request',
          entityId: requestId,
        })
      }
    })
    return this.requests(c)
  }

  async withdraw(c: CitizenCtx, requestId: string): Promise<CitizenBloodRequestsResponse> {
    await this.requestDb.run(c.user, async (tx) => {
      const rows = await tx.query<{ request_id: string }>(
        `UPDATE donation.blood_request_response SET response = NULL, responded_at = NULL
          WHERE request_id = $1 AND donor_person_id = $2 RETURNING request_id`,
        [requestId, c.personId],
      )
      if (rows.length === 0) throw new NotFoundException('You have not responded to this request')
    })
    return this.requests(c)
  }

  // ------------------------------------------------------------------ camps
  async pledgeCamp(c: CitizenCtx, campId: string): Promise<CitizenBloodRequestsResponse> {
    const now = demoNow()
    await this.requestDb.run(c.user, async (tx) => {
      const donor = await this.donorIn(tx, c)
      const camp = (
        await tx.query<{ id: string; name: string; starts_at: Date; ends_at: Date; status: string }>(
          'SELECT id, name, starts_at, ends_at, status FROM donation.blood_camp WHERE id = $1',
          [campId],
        )
      )[0]
      if (!camp) throw new NotFoundException('Camp not found')
      if (!['planned', 'open'].includes(camp.status) || camp.ends_at <= now) throw new BadRequestException('This camp is closed')
      if (donor.dto.eligibleFrom && donor.dto.eligibleFrom > istDate(camp.starts_at)) {
        throw new BadRequestException(`You are resting until ${formatDay(donor.dto.eligibleFrom)}, after this camp`)
      }
      const ins = await tx.query<{ camp_id: string }>(
        `INSERT INTO donation.camp_pledge (camp_id, donor_person_id) VALUES ($1, $2)
         ON CONFLICT (camp_id, donor_person_id) DO NOTHING RETURNING camp_id`,
        [campId, c.personId],
      )
      if (ins.length > 0) {
        await tx.query(
          `INSERT INTO records.dated_event
             (patient_person_id, event_type, starts_at, ends_at, title, source_table, source_id, set_by_user_id, remind_before, notes)
           VALUES ($1, 'personal_reminder', $2, $3, $4, 'donation.blood_camp', $5, $6, interval '1 day', 'Blood donation camp you pledged for')`,
          [c.personId, camp.starts_at, camp.ends_at, `Blood donation camp · ${camp.name}`, campId, c.userId],
        )
      }
    })
    return this.requests(c)
  }

  // ------------------------------------------------------------------ stock
  async banks(c: CitizenCtx): Promise<CitizenBloodBanksResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      const donor = await this.donorIn(tx, c)
      const district = donor.districtId
        ? (await tx.query<{ name: string }>('SELECT name FROM geo.district WHERE id = $1', [donor.districtId]))[0]?.name ?? null
        : null
      const banks = await tx.query<{ id: string; name: string; kind: string; phone: string | null; address: string | null }>(
        `SELECT id, name, kind, phone, address FROM donation.blood_bank
          WHERE is_active AND ($1::uuid IS NULL OR district_id = $1) ORDER BY name`,
        [donor.districtId],
      )
      const stock = await tx.query<{ blood_group: string; units: number; daily_use: number; as_of: Date }>(
        `SELECT l.blood_group::text AS blood_group, sum(l.units)::int AS units, sum(l.daily_use_units)::float8 AS daily_use, max(l.as_of) AS as_of
           FROM donation.v_blood_stock_latest l JOIN donation.blood_bank b ON b.id = l.bank_id
          WHERE b.is_active AND ($1::uuid IS NULL OR b.district_id = $1)
          GROUP BY l.blood_group`,
        [donor.districtId],
      )
      const groups = ALL_GROUPS.map((g) => {
        const s = stock.find((x) => x.blood_group === g)
        const units = s?.units ?? 0
        const use = s?.daily_use ?? 0
        return {
          group: g as string,
          units,
          daysCover: use > 0 ? Math.round((units / use) * 10) / 10 : null,
          level: stockLevel(units, use),
          mine: g === donor.dto.bloodGroup,
        }
      })
      const asOf = stock.map((s) => s.as_of).sort((a, b) => b.getTime() - a.getTime())[0]
      return {
        districtName: district,
        bankCount: banks.length,
        asOf: asOf ? isoReq(asOf) : null,
        groups,
        shortGroups: groups.filter((g) => g.level !== 'good').map((g) => g.group),
        banks,
      }
    })
  }

  // ------------------------------------------------------------------ history
  async history(c: CitizenCtx): Promise<CitizenBloodHistoryResponse> {
    return this.requestDb.run(c.user, async (tx) => {
      const donor = await this.donorIn(tx, c)
      const rows = await tx.query<{
        id: string
        donated_at: Date
        donation_type: string
        hospital_name: string | null
        camp_name: string | null
        bank_name: string | null
        hb_value: string | null
        volume_ml: number | null
      }>(
        `SELECT d.id, d.donated_at, d.donation_type, h.name AS hospital_name, cmp.name AS camp_name, bb.name AS bank_name,
                d.hb_value::text AS hb_value, d.volume_ml
           FROM donation.blood_donation d
           LEFT JOIN org.hospital h ON h.id = d.hospital_id
           LEFT JOIN donation.blood_camp cmp ON cmp.id = d.camp_id
           LEFT JOIN donation.blood_bank bb ON bb.id = d.blood_bank_id
          WHERE d.donor_person_id = $1
          ORDER BY d.donated_at DESC`,
        [c.personId],
      )
      return {
        donations: rows.map((r) => ({
          id: r.id,
          donatedAt: isoReq(r.donated_at),
          type: TYPE_LABEL[r.donation_type] ?? r.donation_type,
          place: r.camp_name ?? r.hospital_name ?? r.bank_name ?? 'Blood bank',
          isCamp: !!r.camp_name,
          hb: r.hb_value === null ? null : Number(r.hb_value),
          volumeMl: r.volume_ml,
        })),
        count: donor.dto.donations,
        litres: donor.dto.litres,
        livesHelped: donor.dto.livesHelped,
        tier: donor.dto.tier,
        nextTier: donor.dto.nextTier,
        donationsToNextTier: donor.dto.donationsToNextTier,
        sinceYear: donor.dto.sinceYear,
      }
    })
  }

  // ------------------------------------------------------------------ checklist
  private async checklistIn(tx: RequestTx, c: CitizenCtx): Promise<CitizenBloodChecklistResponse> {
    const today = istDate(demoNow())
    const rules = await this.rules(tx)
    const person = (await tx.query<{ dob: string }>('SELECT date_of_birth::text AS dob FROM identity.person WHERE id = $1', [c.personId]))[0]
    const row = (
      await tx.query<{
        answered_at: Date
        weight_kg: string | null
        has_diabetes: boolean | null
        recent_illness: boolean | null
        on_medication: boolean | null
        answers: Record<string, unknown>
        eligible: boolean
        reasons: string[]
      }>(
        `SELECT answered_at, weight_kg::text AS weight_kg, has_diabetes, recent_illness, on_medication, answers, eligible, reasons
           FROM donation.donor_checklist WHERE person_id = $1 ORDER BY answered_at DESC LIMIT 1`,
        [c.personId],
      )
    )[0]
    return {
      age: person ? ageOn(person.dob, today) : null,
      minAge: rules.minAge,
      maxAge: rules.maxAge,
      weightKg: row?.weight_kg ? Number(row.weight_kg) : null,
      minWeightKg: rules.minWeight,
      hasDiabetes: row?.has_diabetes ?? null,
      onMedication: row?.on_medication ?? null,
      recentIllness: row?.recent_illness ?? null,
      diabetesNote: row?.has_diabetes ? (row.on_medication ? 'Allowed on tablets' : 'Allowed if well controlled') : 'No',
      illnessNote: row?.recent_illness ? 'Recent illness · wait 4 weeks after recovery' : 'None in 4 weeks',
      eligible: row?.eligible ?? null,
      reasons: row?.reasons ?? [],
      answeredAt: row ? isoReq(row.answered_at) : null,
      tips: {
        mealAndWater: row?.answers?.meal_2h_before !== false,
        abhaReady: row?.answers?.abha_card_ready === true,
      },
    }
  }

  async checklist(c: CitizenCtx): Promise<CitizenBloodChecklistResponse> {
    return this.requestDb.run(c.user, (tx) => this.checklistIn(tx, c))
  }

  async saveChecklist(c: CitizenCtx, body: CitizenBloodChecklistRequest): Promise<CitizenBloodChecklistResponse> {
    const today = istDate(demoNow())
    return this.requestDb.run(c.user, async (tx) => {
      const rules = await this.rules(tx)
      const donor = await this.donorIn(tx, c)
      const person = (await tx.query<{ dob: string }>('SELECT date_of_birth::text AS dob FROM identity.person WHERE id = $1', [c.personId]))[0]
      const age = person ? ageOn(person.dob, today) : null
      const reasons: string[] = []
      if (age !== null && (age < rules.minAge || age > rules.maxAge)) reasons.push(`Age must be ${rules.minAge} to ${rules.maxAge}`)
      if (body.weightKg < rules.minWeight) reasons.push(`Weight must be at least ${rules.minWeight} kg`)
      if (body.recentIllness) reasons.push('Wait 4 weeks after an illness')
      if (donor.resting) reasons.push(`Resting until ${formatDay(donor.dto.eligibleFrom!)} (${rules.gapDays} days between donations)`)
      await tx.query(
        `INSERT INTO donation.donor_checklist (person_id, weight_kg, has_diabetes, recent_illness, on_medication, answers, eligible, reasons)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          c.personId,
          body.weightKg,
          body.hasDiabetes,
          body.recentIllness,
          body.onMedication,
          JSON.stringify({ age, meal_2h_before: body.mealAndWater, water: body.mealAndWater, abha_card_ready: body.abhaReady }),
          reasons.length === 0,
          reasons,
        ],
      )
      return this.checklistIn(tx, c)
    })
  }
}

function formatDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`
}
