import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  AppointmentDto,
  BookAppointmentRequest,
  BookAppointmentResponse,
  PastVisitDto,
  ProviderDto,
  ProvidersQuery,
  SlotDto,
} from '@carefusion/shared/dist/citizen-app.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { demoNow, iso, isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { tokenForIndex } from './care.service.token'

interface ApptRow {
  id: string
  booking_ref: string
  status: string
  token_no: number | null
  starts_at: Date
  ends_at: Date
  doctor_user_id: string | null
  doctor_name: string | null
  hospital_id: string
  hospital_name: string
  reason: string | null
  visit_type: string
  fee_amount: string
  cancelled_reason: string | null
}

const APPT_SELECT = `
  SELECT a.id, a.booking_ref, a.status::text AS status, a.token_no, lower(s.during) AS starts_at, upper(s.during) AS ends_at,
         s.doctor_user_id, dp.full_name AS doctor_name, s.hospital_id, h.name AS hospital_name,
         a.reason, a.visit_type, a.fee_amount::text AS fee_amount, a.cancelled_reason
    FROM engage.appointment a
    JOIN engage.appointment_slot s ON s.id = a.slot_id
    JOIN org.hospital h ON h.id = s.hospital_id
    LEFT JOIN (SELECT u.id, p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id) dp
           ON dp.id = s.doctor_user_id`

function apptDto(r: ApptRow): AppointmentDto {
  return {
    id: r.id,
    bookingRef: r.booking_ref,
    status: r.status,
    tokenNo: r.token_no,
    startsAt: isoReq(r.starts_at),
    endsAt: isoReq(r.ends_at),
    doctorUserId: r.doctor_user_id,
    doctorName: r.doctor_name,
    hospitalId: r.hospital_id,
    hospitalName: r.hospital_name,
    reason: r.reason,
    visitType: r.visit_type,
    feeAmount: Number(r.fee_amount),
    cancelledReason: r.cancelled_reason,
  }
}


const SLOT_WINDOW_SQL = `
  WITH day_slots AS (
    SELECT s.id, lower(s.during) AS starts_at, upper(s.during) AS ends_at, s.slot_type::text AS slot_type, s.capacity,
           row_number() OVER (PARTITION BY s.doctor_user_id, (lower(s.during) AT TIME ZONE 'Asia/Kolkata')::date
                              ORDER BY lower(s.during)) - 1 AS idx,
           (SELECT count(*)::int FROM engage.appointment a WHERE a.slot_id = s.id AND a.status IN ('requested','confirmed')) AS booked
      FROM engage.appointment_slot s
     WHERE s.doctor_user_id = $1
       AND (lower(s.during) AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
                                                               AND ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
  )`

@Injectable()
export class CareService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  async providers(c: CitizenCtx, q: ProvidersQuery): Promise<ProviderDto[]> {
    const now = demoNow()
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<{
        user_id: string
        full_name: string
        specialisation: string | null
        hospital_id: string
        hospital_name: string
        ownership: string
        hospital_type: string
        languages: string[] | null
        fee_amount: string | null
        years_experience: number | null
        accepts_walkin: boolean
        offers_teleconsult: boolean
        distance_km: string | null
        next_slot: Date | null
      }>(
        `SELECT dp.user_id, p.full_name, dp.specialisation, h.id AS hospital_id, h.name AS hospital_name,
                h.ownership::text AS ownership, h.hospital_type::text AS hospital_type, dp.languages,
                dp.fee_amount::text AS fee_amount, dp.years_experience, dp.accepts_walkin, dp.offers_teleconsult,
                CASE WHEN cp.approx_location IS NOT NULL
                     THEN round((ST_Distance(h.location::geography, cp.approx_location::geography) / 1000)::numeric, 1)::text END AS distance_km,
                (SELECT min(lower(s.during)) FROM engage.appointment_slot s
                  WHERE s.doctor_user_id = dp.user_id AND lower(s.during) > $2
                    AND s.capacity > (SELECT count(*) FROM engage.appointment a
                                       WHERE a.slot_id = s.id AND a.status IN ('requested','confirmed'))) AS next_slot
           FROM identity.doctor_profile dp
           JOIN identity.app_user u ON u.id = dp.user_id AND u.status = 'active'
           JOIN identity.person p ON p.id = u.person_id
           JOIN org.hospital h ON h.id = dp.hospital_id AND h.status = 'active' AND h.show_in_find_care
           LEFT JOIN identity.citizen_profile cp ON cp.person_id = $1
          WHERE ($3::text IS NULL OR p.full_name ILIKE '%' || $3 || '%' OR dp.specialisation ILIKE '%' || $3 || '%' OR h.name ILIKE '%' || $3 || '%')
            AND ($4::text IS NULL OR ($4 = 'govt' AND h.ownership = 'govt') OR ($4 = 'private' AND h.ownership <> 'govt'))
            AND (NOT $5::boolean OR dp.offers_teleconsult)
            AND (NOT $6::boolean OR dp.accepts_walkin)
          ORDER BY (cp.approx_location IS NULL), ST_Distance(h.location::geography, cp.approx_location::geography), p.full_name
          LIMIT $7`,
        [c.personId, now, q.q ?? null, q.type ?? null, q.telemedicine ?? false, q.walkIn ?? false, q.limit],
      ),
    )
    return rows.map((r) => ({
      doctorUserId: r.user_id,
      name: r.full_name,
      specialisation: r.specialisation,
      hospitalId: r.hospital_id,
      hospitalName: r.hospital_name,
      ownership: r.ownership,
      hospitalType: r.hospital_type,
      languages: r.languages ?? [],
      feeAmount: r.fee_amount === null ? null : Number(r.fee_amount),
      yearsExperience: r.years_experience,
      acceptsWalkIn: r.accepts_walkin,
      offersTeleconsult: r.offers_teleconsult,
      distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      nextSlotAt: iso(r.next_slot),
    }))
  }

  async slots(c: CitizenCtx, doctorUserId: string, fromIso: string | undefined, days: number): Promise<SlotDto[]> {
    const now = demoNow()
    const from = fromIso && new Date(fromIso) > now ? new Date(fromIso) : now
    const to = new Date(from.getTime() + days * 86_400_000)
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<{ id: string; starts_at: Date; ends_at: Date; slot_type: string; capacity: number; booked: number; idx: string }>(
        `${SLOT_WINDOW_SQL}
         SELECT id, starts_at, ends_at, slot_type, capacity, booked, idx::text AS idx FROM day_slots
          WHERE starts_at > $4 ORDER BY starts_at`,
        [doctorUserId, from, to, now],
      ),
    )
    return rows.map((r) => ({
      slotId: r.id,
      startsAt: isoReq(r.starts_at),
      endsAt: isoReq(r.ends_at),
      slotType: r.slot_type,
      capacity: r.capacity,
      booked: r.booked,
      full: r.booked >= r.capacity,
      tokenPreview: tokenForIndex(Number(r.idx)),
    }))
  }

  async appointments(c: CitizenCtx, scope: 'upcoming' | 'past' | 'all'): Promise<AppointmentDto[]> {
    const now = demoNow()
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<ApptRow>(
        `${APPT_SELECT}
          WHERE a.citizen_person_id = $1
            AND ($2 = 'all' OR ($2 = 'upcoming' AND lower(s.during) > $3 AND a.status IN ('requested','confirmed'))
                            OR ($2 = 'past' AND (lower(s.during) <= $3 OR a.status NOT IN ('requested','confirmed'))))
          ORDER BY lower(s.during) ${scope === 'upcoming' ? 'ASC' : 'DESC'}`,
        [c.personId, scope, now],
      ),
    )
    return rows.map(apptDto)
  }

  async book(c: CitizenCtx, req: BookAppointmentRequest): Promise<BookAppointmentResponse> {
    const now = demoNow()
    return this.requestDb.run(c.user, async (tx) => {
      const slot = (
        await tx.query<{
          id: string
          starts_at: Date
          ends_at: Date
          hospital_id: string
          hospital_name: string
          doctor_user_id: string | null
          doctor_name: string | null
          accepts_bookings: boolean
          fee: string | null
          idx: string
          slot_type: string
        }>(
          `SELECT s.id, lower(s.during) AS starts_at, upper(s.during) AS ends_at, s.hospital_id, h.name AS hospital_name,
                  s.doctor_user_id, p.full_name AS doctor_name, h.accepts_bookings, dp.fee_amount::text AS fee,
                  s.slot_type::text AS slot_type,
                  (SELECT count(*) FROM engage.appointment_slot o
                    WHERE o.doctor_user_id = s.doctor_user_id
                      AND (lower(o.during) AT TIME ZONE 'Asia/Kolkata')::date = (lower(s.during) AT TIME ZONE 'Asia/Kolkata')::date
                      AND lower(o.during) < lower(s.during))::text AS idx
             FROM engage.appointment_slot s
             JOIN org.hospital h ON h.id = s.hospital_id
             LEFT JOIN identity.doctor_profile dp ON dp.user_id = s.doctor_user_id
             LEFT JOIN identity.app_user u ON u.id = s.doctor_user_id
             LEFT JOIN identity.person p ON p.id = u.person_id
            WHERE s.id = $1`,
          [req.slotId],
        )
      )[0]
      if (!slot) throw new NotFoundException('Slot not found')
      if (slot.starts_at <= now) throw new BadRequestException('This slot is in the past')
      if (!slot.accepts_bookings) throw new BadRequestException('This hospital is not taking bookings in the app')

      const prior = await tx.query<{ id: string; status: string }>(
        `SELECT id, status::text AS status FROM engage.appointment WHERE slot_id = $1 AND citizen_person_id = $2`,
        [req.slotId, c.personId],
      )
      if (prior[0] && ['requested', 'confirmed', 'completed'].includes(prior[0].status)) {
        throw new ConflictException('You already have a booking in this slot')
      }

      const visitType = slot.slot_type === 'teleconsult' ? 'teleconsult' : req.visitType
      const token = tokenForIndex(Number(slot.idx))
      // booking_ref comes from a sequence; if a seeded/manual ref already uses the number, try the next one.
      let ins: { id: string }[] = []
      const revive = prior[0] // a cancelled booking of the same slot is re-used (one row per slot and citizen)
      for (let attempt = 0; ; attempt++) {
        await tx.query('SAVEPOINT book_try')
        try {
          ins = revive
            ? await tx.query<{ id: string }>(
                `UPDATE engage.appointment SET status = 'confirmed', reason = $1, visit_type = $2, fee_amount = COALESCE($3::numeric, 0),
                        token_no = $4, cancelled_reason = NULL, requested_at = now() WHERE id = $5 RETURNING id`,
                [req.reason, visitType, slot.fee, token, revive.id],
              )
            : await tx.query<{ id: string }>(
            `INSERT INTO engage.appointment (slot_id, citizen_person_id, status, reason, visit_type, fee_amount, token_no)
             VALUES ($1, $2, 'confirmed', $3, $4, COALESCE($5::numeric, 0), $6) RETURNING id`,
            [req.slotId, c.personId, req.reason, visitType, slot.fee, token],
          )
          await tx.query('RELEASE SAVEPOINT book_try')
          break
        } catch (err) {
          await tx.query('ROLLBACK TO SAVEPOINT book_try')
          const e = err as { code?: string; constraint?: string }
          if (e.code === '23505' && e.constraint === 'appointment_booking_ref_uq' && attempt < 5) continue
          throw err
        }
      }
      const id = ins[0]!.id
      const appt = (await tx.query<ApptRow>(`${APPT_SELECT} WHERE a.id = $1`, [id]))[0]!

      const hhmm = new Date(slot.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
      const doctor = slot.doctor_name ?? 'the doctor'
      await tx.query(
        `INSERT INTO records.dated_event
           (patient_person_id, event_type, starts_at, ends_at, title, source_table, source_id, set_by_user_id, remind_before, notes)
         VALUES ($1, 'appointment', $2, $3, $4, 'engage.appointment', $5, $6, interval '1 day', $7)`,
        [
          c.personId,
          slot.starts_at,
          slot.ends_at,
          `${req.reason} with ${doctor}`,
          id,
          c.userId,
          `${hhmm} · ${slot.hospital_name} · token ${token}${req.shareKeyAtCheckIn ? ' · key shared at check-in' : ''}`,
        ],
      )

      const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Patient'
      const dayText = new Date(slot.starts_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
      await this.events.emit(tx, {
        type: 'booking',
        to: ['doctor', 'hospitaladmin'],
        title: `New booking · ${name}`,
        text: `${dayText} · ${hhmm} · ${doctor} · token ${token}`,
        patientPersonId: c.personId,
        hospitalId: slot.hospital_id,
        entityType: 'engage.appointment',
        entityId: id,
      })

      return {
        appointment: apptDto(appt),
        message: `Your token ${token} is held for ${dayText}, ${hhmm}.`,
        reminder: "We'll remind you the day before.",
      }
    })
  }

  async cancel(c: CitizenCtx, id: string, reason?: string): Promise<AppointmentDto> {
    const now = demoNow()
    return this.requestDb.run(c.user, async (tx) => {
      const cur = (await tx.query<ApptRow>(`${APPT_SELECT} WHERE a.id = $1 AND a.citizen_person_id = $2 FOR UPDATE OF a`, [id, c.personId]))[0]
      if (!cur) throw new NotFoundException('Appointment not found')
      if (!['requested', 'confirmed'].includes(cur.status)) throw new BadRequestException(`A ${cur.status} appointment cannot be cancelled`)
      if (new Date(cur.starts_at) <= now) throw new BadRequestException('This appointment has already started')
      await tx.query(`UPDATE engage.appointment SET status = 'cancelled', cancelled_reason = $2 WHERE id = $1`, [id, reason ?? 'Cancelled by patient'])
      await tx.query(
        `UPDATE records.dated_event SET status = 'cancelled' WHERE source_table = 'engage.appointment' AND source_id = $1 AND patient_person_id = $2`,
        [id, c.personId],
      )
      const name = (await tx.query<{ full_name: string }>('SELECT full_name FROM identity.person WHERE id = $1', [c.personId]))[0]?.full_name ?? 'Patient'
      await this.events.emit(tx, {
        type: 'booking',
        to: ['doctor', 'hospitaladmin'],
        title: `Booking cancelled · ${name}`,
        text: `${cur.booking_ref} · token ${cur.token_no ?? '-'}${reason ? ` · ${reason}` : ''}`,
        patientPersonId: c.personId,
        hospitalId: cur.hospital_id,
        entityType: 'engage.appointment',
        entityId: id,
      })
      return apptDto((await tx.query<ApptRow>(`${APPT_SELECT} WHERE a.id = $1`, [id]))[0]!)
    })
  }

  /** Past visits for the "Last 6 months" list: finished visits, tests and scans from the dates record. */
  async pastVisits(c: CitizenCtx, months: number): Promise<PastVisitDto[]> {
    const now = demoNow()
    const since = new Date(now.getTime() - months * 30 * 86_400_000)
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<{ id: string; starts_at: Date; title: string; notes: string | null; status: string }>(
        `SELECT id, starts_at, title, notes, status FROM records.dated_event
          WHERE patient_person_id = $1 AND event_type = 'past_visit' AND starts_at >= $2 AND starts_at <= $3
          ORDER BY starts_at DESC`,
        [c.personId, since, now],
      ),
    )
    return rows.map((r) => ({ id: r.id, startsAt: isoReq(r.starts_at), title: r.title, sub: r.notes, status: r.status }))
  }
}
