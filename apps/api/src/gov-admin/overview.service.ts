import { Injectable } from '@nestjs/common'
import type { GovContext, GovMap, GovOverview, GovUnit } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { LEVEL_META } from './gov-scope.service'
import type { GovScope } from './gov-scope.service'
import { GovUnitsService } from './gov-units.service'
import { SurveillanceService } from './surveillance.service'
import { GovApprovalsService } from './approvals.service'
import { OversightService } from './oversight.service'
import { BloodService } from './blood.service'
import { DirectoryService } from './directory.service'
import { PlatformService } from './platform.service'
import { available, iso, num, numOr0, round1, suppress, unavailable } from './gov-util'

type MapMetric = 'registered' | 'disease' | 'blood'

@Injectable()
export class OverviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly units: GovUnitsService,
    private readonly surveillance: SurveillanceService,
    private readonly approvals: GovApprovalsService,
    private readonly oversight: OversightService,
    private readonly blood: BloodService,
    private readonly directory: DirectoryService,
    private readonly platform: PlatformService,
  ) {}

  // ------------------------------------------------------------ context (who am I, what can I see)

  async context(scope: GovScope): Promise<GovContext> {
    const meta = LEVEL_META[scope.level]
    const [population, waiting, openFlags, openAnomalies, aiWaiting] = await Promise.all([
      this.units.areaPopulation(scope),
      this.approvals.list(scope, 'waiting', 1),
      this.oversight.openFlagCount(scope),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM surveillance.anomaly a WHERE a.status = 'open'
            AND ((a.level = 'district' AND a.district_id = ANY($1::uuid[])) OR (a.level = 'state' AND a.state_id = ANY($2::smallint[]))
              OR (a.level = 'zonal' AND ($3::text IN ('zonal','central'))) OR (a.level = 'central' AND $3::text = 'central'))`,
        [scope.districtIds, scope.stateIds, scope.level],
      ),
      scope.level === 'central' ? this.platform.waitingReleaseRequests() : Promise.resolve(0),
    ])
    const hasAI = scope.level === 'central'
    const sections = [
      { id: 'overview', label: 'Overview', group: null, badge: null },
      { id: 'map', label: `Map & ${meta.childPlural.toLowerCase()}`, group: null, badge: null },
      { id: 'approvals', label: 'Approvals', group: null, badge: waiting.stats.waiting },
      { id: 'inbox', label: 'Approval inbox', group: null, badge: waiting.stats.waiting },
      { id: 'alerts', label: 'Health alerts', group: 'Public health', badge: null },
      { id: 'surveillance', label: 'Disease surveillance', group: 'Public health', badge: numOr0(openAnomalies[0]?.n) },
      { id: 'blood', label: 'Blood & organ', group: 'Public health', badge: null },
      { id: 'audit', label: 'Audit & security', group: 'Oversight', badge: openFlags },
      { id: 'logs', label: 'Audit log', group: 'Oversight', badge: null },
      { id: 'reports', label: 'Reports & export', group: 'Oversight', badge: null },
      ...(hasAI ? [{ id: 'ai', label: 'AI governance', group: 'Oversight', badge: aiWaiting }] : []),
      { id: 'directory', label: 'Directory', group: 'People', badge: null },
      { id: 'admins', label: 'Admin accounts', group: 'People', badge: null },
      ...(scope.level === 'central' ? [{ id: 'settings', label: 'System settings', group: 'People', badge: null }] : []),
    ]
    return {
      level: scope.level,
      role: scope.role,
      person: { name: scope.personName },
      unit: { kind: scope.unitKind, name: scope.unitName },
      population,
      child: { kind: meta.childKind, label: meta.childLabel, plural: meta.childPlural },
      escalateTo: meta.escalateTo,
      createLevel: meta.createLevel,
      hasAI,
      sections,
      smallCellMin: scope.smallCellMin,
      banner: 'Synthetic demo data. Every number here is aggregated and de-identified. The Admin Console never shows an individual patient record.',
    }
  }

  // ------------------------------------------------------------ map and ranking

  async map(scope: GovScope, metric: MapMetric, disease?: string | null): Promise<GovMap> {
    const own = (await this.surveillance.anomalies(scope)).find((a) => a.level === scope.level && a.status !== 'dismissed')
    const diseaseCode = disease ?? own?.disease ?? (await this.surveillance.defaultDisease(scope)) ?? 'dengue'
    const um = await this.units.unitMetrics(scope, own?.disease ?? null, own?.hotUnits ?? [])

    const value = (u: GovUnit): number | null =>
      metric === 'registered' ? (u.registered?.pctOfPopulation ?? null) : metric === 'disease' ? (u.diseases[diseaseCode]?.perLakh ?? null) : (u.blood?.daysCover ?? null)
    // ranking: registered -> highest first; disease -> highest first; blood cover -> lowest first
    const sorted = [...um.units].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === null && vb === null) return a.name.localeCompare(b.name)
      if (va === null) return 1
      if (vb === null) return -1
      return metric === 'blood' ? va - vb : vb - va
    })
    const withData = sorted.filter((u) => value(u) !== null)
    const needsAttention =
      metric === 'registered' ? [...withData].reverse().slice(0, 3) : withData.slice(0, 3)

    const dz = um.diseases.find((d) => d.code === diseaseCode)
    const kind = um.units[0]?.kind ?? LEVEL_META[scope.level].childKind
    return {
      level: scope.level,
      metric,
      disease: dz ? { code: dz.code, name: dz.name, thresholdPerLakh: dz.thresholdPerLakh } : null,
      week: um.week,
      unitKind: kind,
      units: um.units,
      ranking: sorted.slice(0, 8).map((u, i) => ({ rank: i + 1, id: u.id, name: u.name, value: value(u) })),
      needsAttention: needsAttention.map((u) => ({ id: u.id, name: u.name, value: value(u) })),
      availability: {
        registered:
          kind === 'block'
            ? { available: false as const, reason: 'Citizens record a district, not a block, so the registered share cannot be split by block.' }
            : { available: true as const, data: null },
        disease: um.week ? { available: true as const, data: null } : { available: false as const, reason: 'No case reports have been received from this area yet.' },
        blood:
          kind === 'block'
            ? { available: false as const, reason: 'Blood banks belong to a district, so blood cover cannot be split by block.' }
            : { available: true as const, data: null },
        facilities: kind === 'block' ? { available: false as const, reason: 'Facilities record a district, not a block.' } : { available: true as const, data: null },
      },
      legend: {
        disease: dz ? { thresholdPerLakh: dz.thresholdPerLakh } : null,
        blood: { lowBelowDays: 4, watchBelowDays: 7 },
        note: `Registered = share of residents with an ABHA-linked account. Disease = cases per 1 lakh people this week. Blood cover = days the stock lasts at the current use rate. Units with fewer than ${scope.smallCellMin} cases show "<${scope.smallCellMin}".`,
      },
      anomaly: own ? { id: own.id, disease: own.disease, title: own.title, hotUnits: own.hotUnits } : null,
    }
  }

  // ------------------------------------------------------------ overview page

  async overview(scope: GovScope): Promise<GovOverview> {
    const ids = scope.districtIds
    const meta = LEVEL_META[scope.level]

    const [population, kpiRows, liveRow, hourRows, regMonths, channelRows, mix, eventRows, waiting, flags, mapRank, anomalies, bloodView, grievances, inbox, approvalList] =
      await Promise.all([
        this.units.areaPopulation(scope),
        this.db.query<any>(
          `SELECT
             (SELECT count(*) FROM identity.citizen_profile cp JOIN identity.app_user au ON au.person_id = cp.person_id AND au.account_type = 'citizen' AND au.status = 'active'
               WHERE cp.district_id = ANY($1::uuid[]))::int AS citizens,
             (SELECT count(*) FROM identity.citizen_profile cp JOIN identity.person p ON p.id = cp.person_id
                JOIN identity.app_user au ON au.person_id = p.id AND au.account_type = 'citizen' AND au.status = 'active'
               WHERE cp.district_id = ANY($1::uuid[]) AND p.abha_number IS NOT NULL)::int AS abha,
             (SELECT count(*) FROM identity.doctor_profile dp JOIN identity.app_user au ON au.id = dp.user_id AND au.status = 'active'
                JOIN org.hospital h ON h.id = dp.hospital_id WHERE h.district_id = ANY($1::uuid[]))::int AS doctors,
             (SELECT count(*) FROM org.hospital WHERE status = 'active' AND district_id = ANY($1::uuid[]))::int AS hospitals,
             (SELECT count(*) FROM org.pharmacy WHERE status = 'active' AND district_id = ANY($1::uuid[]))::int AS pharmacies`,
          [ids],
        ),
        this.db.query<any>(
          `SELECT count(*)::int AS n FROM access.access_session s JOIN identity.doctor_profile dp ON dp.user_id = s.user_id JOIN org.hospital h ON h.id = dp.hospital_id
            WHERE s.ended_at IS NULL AND s.expires_at > now() AND h.district_id = ANY($1::uuid[])`,
          [ids],
        ),
        this.db.query<any>(
          `WITH latest AS (SELECT max(day) AS day FROM report.v_sessions_by_hour WHERE district_id = ANY($1::uuid[]))
           SELECT g.hour, coalesce(sum(v.sessions), 0)::int AS sessions, (SELECT day::text FROM latest) AS day
             FROM generate_series(0, 23) g(hour)
             LEFT JOIN report.v_sessions_by_hour v ON v.hour = g.hour AND v.district_id = ANY($1::uuid[]) AND v.day = (SELECT day FROM latest)
            GROUP BY g.hour ORDER BY g.hour`,
          [ids],
        ),
        this.db.query<any>(
          `SELECT to_char(m, 'YYYY-MM') AS month, to_char(m, 'Mon') AS label,
                  (SELECT coalesce(sum(r.registrations), 0) FROM report.v_registrations_monthly r WHERE r.district_id = ANY($1::uuid[]) AND r.month = m::date)::int AS citizens,
                  (SELECT count(*) FROM identity.doctor_profile dp JOIN identity.app_user au ON au.id = dp.user_id JOIN org.hospital h ON h.id = dp.hospital_id
                    WHERE h.district_id = ANY($1::uuid[]) AND date_trunc('month', au.created_at) = m)::int AS doctors,
                  (SELECT count(*) FROM identity.staff_profile sp JOIN identity.app_user au ON au.id = sp.user_id JOIN org.hospital h ON h.id = sp.hospital_id
                    WHERE h.district_id = ANY($1::uuid[]) AND date_trunc('month', au.created_at) = m)::int AS staff
             FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m ORDER BY m`,
          [ids],
        ),
        this.db.query<any>(
          `SELECT r.channel, sum(r.registrations)::int AS n FROM report.v_registrations_monthly r
            WHERE r.district_id = ANY($1::uuid[]) AND r.month = date_trunc('month', now())::date GROUP BY r.channel ORDER BY 2 DESC`,
          [ids],
        ),
        this.db.query<any>(
          `SELECT t.name AS label, count(*)::int AS n FROM org.hospital h JOIN org.hospital_type t ON t.code = h.hospital_type
            WHERE h.status = 'active' AND h.district_id = ANY($1::uuid[]) GROUP BY t.name
           UNION ALL SELECT 'Pharmacy', count(*)::int FROM org.pharmacy WHERE status = 'active' AND district_id = ANY($1::uuid[]) ORDER BY 2 DESC`,
          [ids],
        ),
        this.db.query<any>(
          `SELECT e.id, e.type::text AS type, e.from_role::text AS from_role, e.title, e.text, e.created_at
             FROM engage.event e
            WHERE e.patient_person_id IS NULL AND $2::text = ANY(e.to_roles::text[])
              AND (e.district_id = ANY($1::uuid[]) OR e.state_id = ANY($3::smallint[]) OR e.zone_id = $4::smallint
                   OR (e.district_id IS NULL AND e.state_id IS NULL AND e.zone_id IS NULL))
            ORDER BY e.created_at DESC LIMIT 50`,
          [ids, scope.level === 'zonal' ? 'zonal' : scope.level, scope.stateIds, scope.zoneId],
        ),
        this.approvals.list(scope, 'waiting', 3),
        this.oversight.flaggedEvents(scope, 'open', 3),
        this.map(scope, 'disease'),
        this.surveillance.anomalies(scope),
        this.blood.blood(scope),
        this.directory.grievances(scope),
        this.approvals.inbox(scope),
        this.approvals.list(scope, 'all', 1),
      ])

    const k = kpiRows[0]!
    const live = numOr0(liveRow[0]?.n)
    const peak = Math.max(...hourRows.map((h) => numOr0(h.sessions)), 0)

    // --- 12 weeks of disease counts (small cells hidden)
    const weekRow = await this.db.query<{ w: string | null }>('SELECT max(week_start)::text AS w FROM surveillance.case_report WHERE district_id = ANY($1::uuid[])', [ids])
    const week = weekRow[0]?.w ?? null
    let diseaseWatch: GovOverview['diseaseWatch'] = unavailable('No case reports have been received from this area yet.')
    if (week) {
      const rows = await this.db.query<any>(
        `SELECT d.code::text AS code, d.name, w::date::text AS week_start,
                (SELECT coalesce(sum(cr.cases), 0) FROM surveillance.case_report cr
                  WHERE cr.disease_code = d.code AND cr.week_start = w::date AND cr.district_id = ANY($1::uuid[]))::int AS cases
           FROM surveillance.disease d
           CROSS JOIN generate_series($2::date - 77, $2::date, interval '7 days') w
          WHERE d.is_active AND EXISTS (SELECT 1 FROM surveillance.case_report c WHERE c.disease_code = d.code AND c.district_id = ANY($1::uuid[]))
          ORDER BY d.code, w`,
        [ids, week],
      )
      const byDisease = new Map<string, { code: string; name: string; weeks: { weekStart: string; cases: number | null }[] }>()
      for (const r of rows) {
        const e = byDisease.get(r.code) ?? { code: r.code, name: r.name, weeks: [] as { weekStart: string; cases: number | null }[] }
        e.weeks.push({ weekStart: r.week_start, cases: suppress(r.cases, scope.smallCellMin) })
        byDisease.set(r.code, e)
      }
      diseaseWatch = available({ week, diseases: [...byDisease.values()] })
    }

    const stock = bloodView.stock
    const ownAnomaly = anomalies.find((a) => a.level === scope.level && a.status !== 'dismissed') ?? null
    const monthNow = regMonths[regMonths.length - 1]
    const priorCitizens = Math.max(0, numOr0(k.citizens) - regMonths.reduce((a, x) => a + numOr0(x.citizens), 0))
    const cumulative: number[] = []
    regMonths.forEach((m, i) => cumulative.push((i === 0 ? priorCitizens : cumulative[i - 1]!) + numOr0(m.citizens)))
    const openFlags = await this.oversight.openFlagCount(scope)
    const facTotal = mix.reduce((a, m) => a + numOr0(m.n), 0)

    return {
      level: scope.level,
      title: `${scope.unitName} at a glance`,
      week,
      population,
      kpis: [
        { key: 'citizens', label: 'Citizens registered', value: k.citizens, unit: null, hint: `${k.abha} with an ABHA-linked account`, pctOfPopulation: population ? Math.round((k.abha / population) * 100000) / 1000 : null },
        { key: 'doctors', label: 'Doctors on the platform', value: k.doctors, unit: null, hint: 'Active accounts' },
        { key: 'facilities', label: 'Facilities', value: k.hospitals + k.pharmacies, unit: null, hint: `${k.hospitals} hospitals, ${k.pharmacies} pharmacies` },
        { key: 'live_sessions', label: 'Live doctor sessions', value: live, unit: 'now', hint: `Peak ${peak} in one hour` },
        { key: 'approvals', label: 'Waiting for you', value: approvalList.stats.waiting, unit: 'approvals', hint: approvalList.stats.oldestWaitingDays === null ? 'Nothing waiting' : `Oldest: ${approvalList.stats.oldestWaitingDays} days` },
        { key: 'flags', label: 'Flagged events open', value: openFlags, unit: null, hint: 'Audit and security' },
      ],
      liveSessions: { now: live, peak, asOfDate: hourRows[0]?.day ?? null, byHour: hourRows.map((h) => ({ hour: h.hour, sessions: h.sessions })) },
      waitingForYou: waiting.items,
      ranking: mapRank.ranking,
      rankingUnit: mapRank.unitKind,
      citizensRegistered: {
        total: k.citizens,
        monthly: regMonths.map((m, i) => ({ month: m.month, label: m.label, newCitizens: m.citizens, cumulative: cumulative[i]! })),
      },
      registrationsByMonth: {
        months: regMonths.map((m) => ({ month: m.month, label: m.label, citizens: m.citizens, doctors: m.doctors, staff: m.staff })),
        thisMonth: monthNow
          ? { citizens: monthNow.citizens, doctors: monthNow.doctors, staff: monthNow.staff, total: monthNow.citizens + monthNow.doctors + monthNow.staff }
          : null,
        byChannelThisMonth: channelRows.map((c) => ({ channel: c.channel, count: c.n })),
      },
      diseaseWatch,
      facilityMix: { total: facTotal, segments: mix.map((m) => ({ label: m.label, count: m.n })) },
      anomaly: ownAnomaly,
      blood: stock.available
        ? available({ totalUnits: stock.data.totalUnits, lowGroups: stock.data.lowGroups, byGroup: stock.data.byGroup, upcomingCamps: bloodView.camps.length })
        : unavailable(stock.reason),
      flaggedForReview: flags,
      connectedApps: { eventsToday: eventRows.filter((e) => new Date(e.created_at) >= startOfToday()).length, recent: eventRows.slice(0, 6).map((e) => ({ id: e.id, type: e.type, from: e.from_role, title: e.title, text: e.text, at: iso(e.created_at)! })) },
      preferredCard: meta.childKind === 'block' || scope.level === 'state' ? 'grievances' : 'approvalFunnel',
      grievances: available({ open: grievances.open, ageing: grievances.ageing, items: grievances.items.filter((g) => ['open', 'assigned'].includes(g.status)).slice(0, 3) }),
      approvalFunnel: available({ funnel: inbox.funnel90d, stats: approvalList.stats, daysToDecision: inbox.daysToDecision }),
      simulatedNotice: 'AI insight on this page is a simulated AI output and needs epidemiologist review.',
    }
  }
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
