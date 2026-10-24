import { ForbiddenException, Injectable } from '@nestjs/common'
import type { CreateBloodRequest } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { DoctorDbService, toIso } from './doctor-db.service'

@Injectable()
export class NetworkService {
  constructor(private readonly db: DoctorDbService) {}

  /** Blood donors near my hospital (donors who switched "ready to donate" on, plus resting donors) and blood-bank cover. */
  async donors(user: AuthenticatedUser | undefined, bloodGroup: string, radiusKm: number) {
    return this.db.run(user, async (tx) => {
      const hospitalId = await tx.hospitalId()
      const rows = await tx.query<any>(
        `SELECT p.id, p.full_name, bd.ready, bd.eligible_from::text AS eligible_from, bd.last_donation_at, bd.donor_code,
                round((ST_Distance(cp.approx_location::geography, h.location::geography) / 100)::numeric) / 10 AS km,
                (SELECT count(*)::int FROM donation.blood_donation b WHERE b.donor_person_id = p.id) AS donations
           FROM donation.blood_donor bd
           JOIN identity.person p ON p.id = bd.person_id AND p.deceased_at IS NULL
           JOIN identity.citizen_profile cp ON cp.person_id = bd.person_id
           JOIN org.hospital h ON h.id = $1
          WHERE cp.blood_group = $2::identity.blood_group AND cp.approx_location IS NOT NULL
            AND ST_DWithin(cp.approx_location::geography, h.location::geography, $3)
          ORDER BY bd.ready DESC, km LIMIT 40`,
        [hospitalId, bloodGroup, radiusKm * 1000],
      )
      const bank = await tx.query<any>(
        `SELECT b.name, l.blood_group::text AS blood_group, l.units, l.days_cover::float8 AS days_cover, l.as_of
           FROM donation.v_blood_stock_latest l JOIN donation.blood_bank b ON b.id = l.bank_id
          WHERE b.is_active AND b.district_id = (SELECT district_id FROM org.hospital WHERE id = $1) ORDER BY b.name, l.blood_group`,
        [hospitalId],
      )
      return {
        bloodGroup,
        radiusKm,
        donors: rows.map((d) => ({
          personId: d.id,
          name: d.full_name,
          ready: d.ready,
          distanceKm: Number(d.km),
          donations: d.donations,
          lastDonationAt: toIso(d.last_donation_at),
          note: d.ready ? (d.donations ? `gave ${d.donations} time${d.donations === 1 ? '' : 's'}` : 'first-time donor') : `Resting until ${d.eligible_from ?? 'later'}`,
        })),
        bloodBank: bank.map((b) => ({ bank: b.name, bloodGroup: b.blood_group, units: b.units, daysCover: b.days_cover, asOf: toIso(b.as_of) })),
        organPledgeNote: 'Organ pledge lookup is restricted (KNOS) and is not shown here.',
      }
    })
  }

  async createBloodRequest(user: AuthenticatedUser | undefined, body: CreateBloodRequest) {
    return this.db.run(user, async (tx) => {
      const hospitalId = await tx.hospitalId()
      const h = await tx.one<{ name: string }>(`SELECT name FROM org.hospital WHERE id = $1`, [hospitalId])
      const me = await tx.one<{ full_name: string }>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = util.ctx_user_id()`)
      if (body.patientPersonId) {
        const treated = await tx.one(`SELECT 1 FROM access.access_session WHERE user_id = util.ctx_user_id() AND patient_person_id = $1 LIMIT 1`, [body.patientPersonId])
        if (!treated) throw new ForbiddenException('You can only link a patient you have treated')
      }
      const r = await tx.one<{ id: string; created_at: Date; closes_at: Date }>(
        `INSERT INTO donation.blood_request (requested_by_user_id, patient_person_id, blood_group, units, hospital_id, urgency, closes_at)
         VALUES (util.ctx_user_id(), $1, $2::identity.blood_group, $3, $4, $5::donation.urgency, now() + make_interval(hours => $6)) RETURNING id, created_at, closes_at`,
        [body.patientPersonId ?? null, body.bloodGroup, body.units, hospitalId, body.urgency, body.closesInHours],
      )
      const alerted = await tx.one<{ n: number }>(
        `WITH ins AS (INSERT INTO donation.blood_request_response (request_id, donor_person_id)
                      SELECT $1, donor_person_id FROM donation.matching_donors($1) ON CONFLICT DO NOTHING RETURNING 1)
         SELECT count(*)::int AS n FROM ins`,
        [r!.id],
      )
      await tx.emit({
        type: 'blood-request',
        toRoles: ['citizen', 'district'],
        title: `Blood needed · ${body.bloodGroup} · ${body.units} unit${body.units === 1 ? '' : 's'}`,
        text: `${h?.name} · requested by ${me?.full_name}${body.reason ? ` · ${body.reason}` : ''}`,
        entityType: 'donation.blood_request',
        entityId: r!.id,
        hospitalId,
      })
      await tx.audit('blood.request', { entityType: 'blood_request', entityId: r!.id, details: { group: body.bloodGroup, units: body.units, urgency: body.urgency } })
      return { requestId: r!.id, bloodGroup: body.bloodGroup, units: body.units, urgency: body.urgency, donorsAlerted: alerted?.n ?? 0, closesAt: toIso(r!.closes_at) }
    })
  }

  async myBloodRequests(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT r.id, r.blood_group::text AS blood_group, r.units, r.urgency::text AS urgency, r.status::text AS status, r.created_at, r.closes_at,
                (SELECT count(*)::int FROM donation.blood_request_response x WHERE x.request_id = r.id) AS alerted,
                (SELECT count(*)::int FROM donation.blood_request_response x WHERE x.request_id = r.id AND x.response = 'will_donate') AS will_donate
           FROM donation.blood_request r WHERE r.requested_by_user_id = util.ctx_user_id() ORDER BY r.created_at DESC LIMIT 20`,
      )
      return rows.map((r) => ({ id: r.id, bloodGroup: r.blood_group, units: r.units, urgency: r.urgency, status: r.status, createdAt: toIso(r.created_at), closesAt: toIso(r.closes_at), donorsAlerted: r.alerted, willDonate: r.will_donate }))
    })
  }

  /** Where is a medicine in stock? Nearest first, with exact quantity (doctor view). */
  async pharmacyStock(user: AuthenticatedUser | undefined, q: string) {
    return this.db.run(user, async (tx) => {
      const hospitalId = await tx.hospitalId()
      const rows = await tx.query<any>(
        `SELECT v.pharmacy_id, v.pharmacy_name, v.generic_name, v.strength, v.form, v.schedule::text AS schedule, v.stock_level, v.quantity::float8 AS quantity, v.min_price::float8 AS min_price,
                round((ST_Distance(v.location::geography, h.location::geography) / 100)::numeric) / 10 AS km, ph.is_jan_aushadhi, (ph.linked_hospital_id = h.id) AS own_pharmacy
           FROM pharmacy.v_stock_status v
           JOIN org.pharmacy ph ON ph.id = v.pharmacy_id JOIN org.hospital h ON h.id = $1
          WHERE ($2 = '' OR v.generic_name ILIKE $2 || '%' OR v.generic_name ILIKE '% ' || $2 || '%')
          ORDER BY v.generic_name, km, v.pharmacy_name LIMIT 60`,
        [hospitalId, q.trim()],
      )
      return rows.map((r) => ({
        medicine: `${r.generic_name} ${r.strength}`,
        form: r.form,
        schedule: r.schedule,
        pharmacyId: r.pharmacy_id,
        pharmacy: r.pharmacy_name,
        distanceKm: Number(r.km),
        status: r.stock_level,
        quantity: r.quantity,
        minPrice: r.min_price,
        janAushadhi: r.is_jan_aushadhi,
        ownPharmacy: r.own_pharmacy,
      }))
    })
  }
}
