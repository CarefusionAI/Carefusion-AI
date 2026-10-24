import { Injectable } from '@nestjs/common'
import type { GovUnit, GovUnitDisease } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import type { GovScope } from './gov-scope.service'
import { median, num, numOr0, round1 } from './gov-util'

export interface UnitDef {
  id: string
  code: string
  name: string
  kind: 'block' | 'district' | 'state'
  districtIds: string[]
}

export interface DiseaseDef {
  code: string
  name: string
  thresholdPerLakh: number
  sdThreshold: number
}

export interface UnitMetricsResult {
  /** Monday of the newest week that has case reports in the area (null = no reports at all). */
  week: string | null
  units: GovUnit[]
  diseases: DiseaseDef[]
}

/**
 * Per-unit numbers for the console map, ranking and overview.
 * Units are blocks (district admin), districts (state admin) or states (zonal and central).
 * Everything is computed from tables; a metric the data model cannot give for a unit is null.
 */
@Injectable()
export class GovUnitsService {
  constructor(private readonly db: DatabaseService) {}

  async diseases(): Promise<DiseaseDef[]> {
    const rows = await this.db.query<{ code: string; name: string; threshold_per_lakh: string; sd_threshold: string }>(
      'SELECT code::text AS code, name, threshold_per_lakh, sd_threshold FROM surveillance.disease WHERE is_active ORDER BY code',
    )
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      thresholdPerLakh: numOr0(r.threshold_per_lakh),
      sdThreshold: numOr0(r.sd_threshold),
    }))
  }

  async unitDefs(scope: GovScope): Promise<UnitDef[]> {
    if (scope.level === 'district') {
      const rows = await this.db.query<{ id: string; name: string }>(
        'SELECT id::text, name FROM geo.block WHERE district_id = $1::uuid ORDER BY name',
        [scope.districtId],
      )
      return rows.map((r) => ({ id: r.id, code: r.name.slice(0, 3).toUpperCase(), name: r.name, kind: 'block', districtIds: [scope.districtId!] }))
    }
    if (scope.level === 'state') {
      const rows = await this.db.query<{ id: string; name: string; lgd_code: string | null }>(
        'SELECT id::text, name, lgd_code FROM geo.district WHERE state_id = $1::smallint ORDER BY name',
        [scope.stateId],
      )
      return rows.map((r) => ({ id: r.id, code: r.lgd_code ?? r.name.slice(0, 3).toUpperCase(), name: r.name, kind: 'district', districtIds: [r.id] }))
    }
    const states = await this.db.query<{ id: number; code: string; name: string }>(
      scope.level === 'zonal'
        ? 'SELECT id, code::text AS code, name FROM geo.state WHERE zone_id = $1::smallint ORDER BY name'
        : 'SELECT id, code::text AS code, name FROM geo.state WHERE $1::smallint IS NULL ORDER BY name',
      [scope.zoneId],
    )
    const dists = await this.db.query<{ id: string; state_id: number }>('SELECT id::text, state_id FROM geo.district WHERE id = ANY($1::uuid[])', [scope.districtIds])
    return states.map((s) => ({
      id: String(s.id),
      code: s.code,
      name: s.name,
      kind: 'state',
      districtIds: dists.filter((d) => d.state_id === s.id).map((d) => d.id),
    }))
  }

  async unitMetrics(scope: GovScope, anomalyDisease: string | null, anomalyHotCodes: string[]): Promise<UnitMetricsResult> {
    const [defs, diseases] = await Promise.all([this.unitDefs(scope), this.diseases()])
    const allDistricts = scope.districtIds
    const kind = defs[0]?.kind ?? (scope.level === 'district' ? 'block' : scope.level === 'state' ? 'district' : 'state')

    const weekRow = await this.db.query<{ w: string | null }>(
      'SELECT max(week_start)::text AS w FROM surveillance.case_report WHERE district_id = ANY($1::uuid[])',
      [allDistricts],
    )
    const week = weekRow[0]?.w ?? null

    // --- case counts for the newest week, by district/block and disease
    const caseRows = week
      ? await this.db.query<{ district_id: string; block_id: string | null; disease: string; cases: string }>(
          `SELECT district_id::text, block_id::text, disease_code::text AS disease, sum(cases)::text AS cases
             FROM surveillance.case_report
            WHERE week_start = $1::date AND district_id = ANY($2::uuid[])
            GROUP BY district_id, block_id, disease_code`,
          [week, allDistricts],
        )
      : []

    // --- population (latest year per unit)
    const popRows = await this.populationByUnit(kind, defs.map((d) => d.id))

    // --- registered citizens by district
    const regRows = await this.db.query<{ district_id: string; registered: string; abha: string }>(
      `SELECT cp.district_id::text, count(*)::text AS registered,
              count(*) FILTER (WHERE p.abha_number IS NOT NULL)::text AS abha
         FROM identity.citizen_profile cp
         JOIN identity.person p ON p.id = cp.person_id
         JOIN identity.app_user au ON au.person_id = p.id AND au.account_type = 'citizen' AND au.status = 'active'
        WHERE cp.district_id = ANY($1::uuid[])
        GROUP BY cp.district_id`,
      [allDistricts],
    )

    // --- blood stock by district (latest reading per bank and group)
    const bloodRows = await this.db.query<{ district_id: string; blood_group: string; units: string; daily: string }>(
      `SELECT b.district_id::text, l.blood_group::text, sum(l.units)::text AS units, sum(l.daily_use_units)::text AS daily
         FROM donation.v_blood_stock_latest l
         JOIN donation.blood_bank b ON b.id = l.bank_id AND b.is_active
        WHERE b.district_id = ANY($1::uuid[])
        GROUP BY b.district_id, l.blood_group`,
      [allDistricts],
    )

    // --- facilities, doctors, live doctor sessions by district
    const facRows = await this.db.query<{ district_id: string; n: string }>(
      `SELECT district_id::text, sum(n)::text AS n FROM (
         SELECT district_id, count(*) AS n FROM org.hospital WHERE status = 'active' AND district_id = ANY($1::uuid[]) GROUP BY district_id
         UNION ALL
         SELECT district_id, count(*) FROM org.pharmacy WHERE status = 'active' AND district_id = ANY($1::uuid[]) GROUP BY district_id
       ) t GROUP BY district_id`,
      [allDistricts],
    )
    const docRows = await this.db.query<{ district_id: string; n: string }>(
      `SELECT h.district_id::text, count(*)::text AS n
         FROM identity.doctor_profile dp
         JOIN identity.app_user au ON au.id = dp.user_id AND au.status = 'active'
         JOIN org.hospital h ON h.id = dp.hospital_id
        WHERE h.district_id = ANY($1::uuid[])
        GROUP BY h.district_id`,
      [allDistricts],
    )
    const liveRows = await this.db.query<{ district_id: string; n: string }>(
      `SELECT h.district_id::text, count(*)::text AS n
         FROM access.access_session s
         JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
         JOIN org.hospital h ON h.id = dp.hospital_id
        WHERE s.ended_at IS NULL AND s.expires_at > now() AND h.district_id = ANY($1::uuid[])
        GROUP BY h.district_id`,
      [allDistricts],
    )

    // --- admin of each unit (district or state level only)
    const adminRows = await this.db.query<{ district_id: string | null; state_id: number | null; name: string }>(
      `SELECT ap.district_id::text, ap.state_id, p.full_name AS name
         FROM admin.admin_post ap
         JOIN identity.app_user au ON au.id = ap.user_id AND au.status = 'active'
         JOIN identity.person p ON p.id = au.person_id
        WHERE ap.valid @> now() AND ap.level IN ('district','state')
        ORDER BY lower(ap.valid)`,
    )

    const by = <T extends { district_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>()
      for (const r of rows) m.set(r.district_id, [...(m.get(r.district_id) ?? []), r])
      return m
    }
    const regBy = by(regRows)
    const bloodBy = by(bloodRows)
    const facBy = by(facRows)
    const docBy = by(docRows)
    const liveBy = by(liveRows)

    const units: GovUnit[] = defs.map((def) => {
      const dIds = def.districtIds
      const sumFrom = (m: Map<string, { n: string }[]>) => dIds.reduce((a, d) => a + (m.get(d) ?? []).reduce((x, r) => x + numOr0(r.n), 0), 0)

      // disease cells
      const diseaseCells: Record<string, GovUnitDisease> = {}
      const pop = popRows.get(def.id) ?? null
      for (const dz of diseases) {
        const rows = caseRows.filter(
          (r) => r.disease === dz.code && (def.kind === 'block' ? r.block_id === def.id : dIds.includes(r.district_id)),
        )
        const reported = rows.length > 0
        const cases = rows.reduce((a, r) => a + numOr0(r.cases), 0)
        const suppressed = reported && cases < scope.smallCellMin
        const perLakh = reported && !suppressed && pop ? round1((cases * 100000) / pop) : null
        diseaseCells[dz.code] = {
          reported,
          cases: reported && !suppressed ? cases : null,
          suppressed,
          perLakh,
          aboveThreshold: perLakh === null ? null : perLakh >= dz.thresholdPerLakh,
        }
      }

      // registered share (needs a district on the citizen; blocks are not recorded)
      let registered: GovUnit['registered'] = null
      if (def.kind !== 'block') {
        const rows = dIds.flatMap((d) => regBy.get(d) ?? [])
        const count = rows.reduce((a, r) => a + numOr0(r.registered), 0)
        const abha = rows.reduce((a, r) => a + numOr0(r.abha), 0)
        registered = { count, abhaLinked: abha, pctOfPopulation: pop ? Math.round((abha / pop) * 100000) / 1000 : null }
      }

      // blood cover (blood banks belong to a district; blocks are not recorded)
      let blood: GovUnit['blood'] = null
      if (def.kind !== 'block') {
        const rows = dIds.flatMap((d) => bloodBy.get(d) ?? [])
        if (rows.length) {
          const groups = new Map<string, { units: number; daily: number }>()
          for (const r of rows) {
            const g = groups.get(r.blood_group) ?? { units: 0, daily: 0 }
            g.units += numOr0(r.units)
            g.daily += numOr0(r.daily)
            groups.set(r.blood_group, g)
          }
          const units = [...groups.values()].reduce((a, g) => a + g.units, 0)
          const daily = [...groups.values()].reduce((a, g) => a + g.daily, 0)
          const days = daily > 0 ? round1(units / daily) : null
          const lowGroups = [...groups.entries()].filter(([, g]) => g.daily > 0 && g.units / g.daily < 4).map(([k]) => k)
          blood = { units, daysCover: days, level: days === null ? null : days < 4 ? 'low' : days < 7 ? 'watch' : 'good', lowGroups }
        }
      }

      const admin =
        def.kind === 'district'
          ? (adminRows.find((a) => a.district_id === def.id)?.name ?? null)
          : def.kind === 'state'
            ? (adminRows.find((a) => a.state_id === Number(def.id))?.name ?? null)
            : null

      return {
        id: def.id,
        code: def.code,
        name: def.name,
        kind: def.kind,
        population: pop,
        registered,
        diseases: diseaseCells,
        blood,
        facilities: def.kind === 'block' ? null : sumFrom(facBy),
        doctors: def.kind === 'block' ? null : sumFrom(docBy),
        liveSessions: def.kind === 'block' ? null : sumFrom(liveBy),
        admin,
        hot: false,
        status: 'normal',
      }
    })

    // --- hot units for the area's anomaly disease: listed by the anomaly, or an outlier on the data
    if (anomalyDisease) {
      const dz = diseases.find((d) => d.code === anomalyDisease)
      const rates = units.map((u) => u.diseases[anomalyDisease]?.perLakh).filter((v): v is number => typeof v === 'number')
      const med = median(rates)
      for (const u of units) {
        const cell = u.diseases[anomalyDisease]
        const listed = anomalyHotCodes.some((c) => matchesHotCode(c, u))
        const outlier = !!cell && cell.perLakh !== null && med !== null && !!dz && cell.perLakh >= dz.thresholdPerLakh && cell.perLakh >= 2 * med
        u.hot = listed || outlier
      }
    }
    for (const u of units) {
      u.status = u.hot ? 'outbreak_watch' : u.blood?.level === 'low' || (u.blood?.daysCover !== null && u.blood?.daysCover !== undefined && u.blood.daysCover < 4) ? 'low_blood' : 'normal'
    }

    return { week, units, diseases }
  }

  /** Latest-year population per unit id. */
  private async populationByUnit(kind: 'block' | 'district' | 'state', ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map()
    const col = kind === 'block' ? 'block_id::text' : kind === 'district' ? 'district_id::text' : 'state_id::text'
    const rows = await this.db.query<{ id: string; population: string }>(
      `SELECT DISTINCT ON (${col}) ${col} AS id, population::text
         FROM geo.population
        WHERE unit_type = $1 AND ${col} = ANY($2::text[])
        ORDER BY ${col}, as_of_year DESC`,
      [kind, ids],
    )
    return new Map(rows.map((r) => [r.id, numOr0(r.population)]))
  }

  /** Population of the whole area (sum of its districts' latest figures, or the state figure). */
  async areaPopulation(scope: GovScope): Promise<number | null> {
    if (scope.level === 'district') {
      const r = await this.db.query<{ p: string | null }>(
        'SELECT population::text AS p FROM geo.population WHERE district_id = $1::uuid ORDER BY as_of_year DESC LIMIT 1',
        [scope.districtId],
      )
      return num(r[0]?.p)
    }
    const r = await this.db.query<{ p: string | null }>(
      `SELECT sum(population)::text AS p FROM (
         SELECT DISTINCT ON (state_id) state_id, population FROM geo.population
          WHERE unit_type = 'state' AND state_id = ANY($1::smallint[]) ORDER BY state_id, as_of_year DESC) t`,
      [scope.stateIds],
    )
    return num(r[0]?.p)
  }
}

/**
 * Anomaly rows list hot units by short codes (KL, TVM, RNI). States match by their code.
 * Districts and blocks have no code column, so a code matches when it starts with the unit's first letter
 * and its letters appear in order in the unit's name (RNI in Ranni, TVM in Thiruvananthapuram).
 */
function matchesHotCode(code: string, u: { code: string; name: string; kind: string }): boolean {
  const c = code.toUpperCase()
  if (u.code.toUpperCase() === c) return true
  if (u.kind === 'state' || c.length < 2) return false
  const name = u.name.toUpperCase()
  if (name[0] !== c[0]) return false
  let at = 0
  for (const ch of c) {
    const i = name.indexOf(ch, at)
    if (i < 0) return false
    at = i + 1
  }
  return true
}
