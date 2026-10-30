import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { GovBlood } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'
import type { GovScope } from './gov-scope.service'
import { iso, median, num, numOr0, round1, unavailable, available } from './gov-util'

const levelOf = (days: number | null): 'low' | 'watch' | 'good' | null => (days === null ? null : days < 4 ? 'low' : days < 7 ? 'watch' : 'good')

@Injectable()
export class BloodService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async blood(scope: GovScope): Promise<GovBlood> {
    const ids = scope.districtIds

    // --- stock by group (latest reading per bank and group)
    const groups = await this.db.query<any>(
      `SELECT l.blood_group::text AS blood_group, sum(l.units)::int AS units, sum(l.daily_use_units) AS daily
         FROM donation.v_blood_stock_latest l JOIN donation.blood_bank b ON b.id = l.bank_id AND b.is_active
        WHERE b.district_id = ANY($1::uuid[]) GROUP BY l.blood_group ORDER BY l.blood_group`,
      [ids],
    )
    const byGroup = groups.map((g) => {
      const days = numOr0(g.daily) > 0 ? round1(g.units / numOr0(g.daily)) : null
      return { group: g.blood_group as string, units: g.units as number, daysCover: days, level: levelOf(days) }
    })
    const totalUnits = byGroup.reduce((a, g) => a + g.units, 0)
    const lowGroups = byGroup.filter((g) => g.level === 'low').map((g) => g.group)

    // --- blood banks
    const banks = await this.db.query<any>(
      `SELECT b.id, b.name, b.kind, d.name AS district, sum(l.units)::int AS units, sum(l.daily_use_units) AS daily
         FROM donation.blood_bank b
         JOIN geo.district d ON d.id = b.district_id
         LEFT JOIN donation.v_blood_stock_latest l ON l.bank_id = b.id
        WHERE b.is_active AND b.district_id = ANY($1::uuid[])
        GROUP BY b.id, b.name, b.kind, d.name ORDER BY b.name`,
      [ids],
    )

    // --- camps
    const camps = await this.db.query<any>(
      `SELECT c.id, c.name, c.venue, c.starts_at, c.target_units, c.status, d.name AS district,
              (SELECT count(*) FROM donation.camp_pledge p WHERE p.camp_id = c.id)::int AS pledges
         FROM donation.blood_camp c JOIN geo.district d ON d.id = c.district_id
        WHERE c.district_id = ANY($1::uuid[]) AND c.status IN ('planned','open') AND c.ends_at >= now() - interval '7 days'
        ORDER BY c.starts_at LIMIT 20`,
      [ids],
    )

    // --- donors, pledges, transplants
    const donors = await this.db.query<any>(
      `SELECT count(*)::int AS registered, count(*) FILTER (WHERE d.ready)::int AS ready
         FROM donation.blood_donor d JOIN identity.citizen_profile c ON c.person_id = d.person_id
        WHERE c.district_id = ANY($1::uuid[])`,
      [ids],
    )
    const pledges = await this.db.query<any>(
      `SELECT count(*) FILTER (WHERE p.status = 'registered' AND p.withdrawn_at IS NULL)::int AS registered,
              count(*) FILTER (WHERE p.status <> 'registered' AND p.status <> 'withdrawn' AND p.withdrawn_at IS NULL)::int AS in_progress
         FROM donation.organ_pledge p JOIN identity.citizen_profile c ON c.person_id = p.person_id
        WHERE c.district_id = ANY($1::uuid[])`,
      [ids],
    )
    const waitlist = await this.db.query<any>(
      `SELECT w.organ::text AS organ, sum(w.waiting)::int AS waiting, sum(w.transplants_ytd)::int AS transplants,
              array_agg(w.median_wait_days) FILTER (WHERE w.median_wait_days IS NOT NULL) AS medians, max(w.as_of)::text AS as_of
         FROM (SELECT DISTINCT ON (state_id, organ) * FROM donation.organ_waitlist_snapshot WHERE state_id = ANY($1::smallint[]) ORDER BY state_id, organ, as_of DESC) w
        GROUP BY w.organ ORDER BY sum(w.waiting) DESC`,
      [scope.stateIds],
    )
    const centres = await this.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM donation.transplant_centre WHERE is_active AND state_id = ANY($1::smallint[])',
      [scope.stateIds],
    )

    // --- open requests from hospitals in the area
    const requests = await this.db.query<any>(
      `SELECT r.id, r.blood_group::text AS blood_group, r.units, r.urgency::text AS urgency, r.created_at, r.closes_at, h.name AS hospital, d.name AS district
         FROM donation.blood_request r
         JOIN org.hospital h ON h.id = r.hospital_id
         JOIN geo.district d ON d.id = h.district_id
        WHERE r.status = 'open' AND h.district_id = ANY($1::uuid[])
        ORDER BY (r.urgency::text = 'critical') DESC, (r.urgency::text = 'urgent') DESC, r.created_at DESC LIMIT 20`,
      [ids],
    )

    const kidney = waitlist.find((w) => w.organ === 'kidneys' || w.organ === 'kidney')
    return {
      level: scope.level,
      stock: byGroup.length
        ? available({ totalUnits, byGroup, lowGroups, thresholds: { lowBelowDays: 4, watchBelowDays: 7 } })
        : unavailable('No blood stock readings exist for this area.'),
      banks: banks.map((b) => {
        const days = numOr0(b.daily) > 0 ? round1(numOr0(b.units) / numOr0(b.daily)) : null
        return { id: b.id, name: b.name, kind: b.kind, district: b.district, units: numOr0(b.units), daysCover: days, level: levelOf(days) }
      }),
      camps: camps.map((c) => ({
        id: c.id, name: c.name, venue: c.venue, district: c.district, startsAt: iso(c.starts_at)!, targetUnits: num(c.target_units), pledges: c.pledges, status: c.status,
      })),
      donors: { registered: donors[0]?.registered ?? 0, ready: donors[0]?.ready ?? 0 },
      organPledges: { registered: pledges[0]?.registered ?? 0, inProgress: pledges[0]?.in_progress ?? 0 },
      transplantsThisYear: waitlist.length ? available(waitlist.reduce((a, w) => a + w.transplants, 0)) : unavailable('No waiting-list snapshots exist for this area.'),
      waitingList: waitlist.length
        ? available({
            asOf: waitlist[0]!.as_of as string,
            organs: waitlist.map((w) => ({ organ: w.organ as string, waiting: w.waiting as number })),
            medianWaitKidneyDays: kidney?.medians?.length ? Math.round(median((kidney.medians as number[]).map(Number))!) : null,
            medianNote: 'Median of the state medians',
            certifiedTransplantCentres: numOr0(centres[0]?.n),
          })
        : unavailable('No waiting-list snapshots exist for this area.'),
      requests: requests.map((r) => ({
        id: r.id, bloodGroup: r.blood_group, units: r.units, urgency: r.urgency, hospital: r.hospital, district: r.district,
        createdAt: iso(r.created_at)!, closesAt: iso(r.closes_at),
      })),
      callForDonors:
        lowGroups.length > 0
          ? {
              title: `Blood donors needed: ${lowGroups.join(', ')}`,
              body: 'Your nearest blood bank is running low. If you are eligible, please donate this week. Open CareFusion to see the nearest bank and its hours.',
              category: 'blood_donation',
              lowGroups,
            }
          : null,
    }
  }

  /** "Notify matching donors": counts eligible, ready donors of that group in the hospital's district. Delivery is simulated in the alpha. */
  async notifyDonors(scope: GovScope, actor: AuthenticatedUser, requestId: string) {
    const rows = await this.db.query<any>(
      `SELECT r.id, r.blood_group::text AS blood_group, h.district_id::text AS district_id
         FROM donation.blood_request r JOIN org.hospital h ON h.id = r.hospital_id WHERE r.id = $1::uuid AND r.status = 'open'`,
      [requestId],
    )
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Open blood request not found.' })
    if (!scope.districtIds.includes(r.district_id)) throw new ForbiddenException({ success: false, errorMessage: 'That request is outside your area.' })
    const m = await this.db.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM donation.blood_donor d
         JOIN identity.citizen_profile c ON c.person_id = d.person_id
        WHERE c.blood_group = $1::identity.blood_group AND d.ready AND (d.eligible_from IS NULL OR d.eligible_from <= current_date)
          AND c.district_id = $2::uuid`,
      [r.blood_group, r.district_id],
    )
    const matching = numOr0(m[0]?.n)
    await this.audit.logAction(actor, 'blood.notify_donors', {
      entityType: 'blood_request',
      entityId: requestId,
      details: { bloodGroup: r.blood_group, matching, channel: 'citizen app', simulated: true },
    })
    return { success: true, matchingDonors: matching, channel: 'Citizen app', simulated: true }
  }
}
