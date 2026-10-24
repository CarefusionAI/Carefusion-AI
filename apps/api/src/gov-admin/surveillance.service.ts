import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  GovAnomaly,
  GovFieldRequest,
  GovResponseAction,
  GovSurveillance,
  GovLevel,
} from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'
import type { GovScope } from './gov-scope.service'
import { GovUnitsService } from './gov-units.service'
import { available, iso, num, numOr0, round1, unavailable } from './gov-util'

const LEVEL_RANK: Record<GovLevel, number> = { district: 1, state: 2, zonal: 3, central: 4 }

@Injectable()
export class SurveillanceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly units: GovUnitsService,
    private readonly audit: AuditService,
  ) {}

  /** SQL condition for anomaly rows (alias a) that belong to this admin's level or below, inside the admin's area. */
  private anomalyScopeSql(scope: GovScope): { sql: string; params: unknown[] } {
    const rank = LEVEL_RANK[scope.level]
    // every placeholder is always referenced (Postgres cannot type an unused parameter); the rank gates the level
    const parts: string[] = [
      "(a.level = 'district' AND a.district_id = ANY($1::uuid[]))",
      `(a.level = 'state' AND ${rank >= 2} AND a.state_id = ANY($2::smallint[]))`,
      `(a.level = 'zonal' AND ${rank >= 3} AND ($3::smallint IS NULL OR a.zone_id = $3::smallint))`,
      `(a.level = 'central' AND ${rank >= 4})`,
    ]
    return { sql: `(${parts.join(' OR ')})`, params: [scope.districtIds, scope.stateIds, scope.zoneId] }
  }

  async anomalies(scope: GovScope, disease?: string | null): Promise<GovAnomaly[]> {
    const c = this.anomalyScopeSql(scope)
    const rows = await this.db.query<any>(
      `SELECT a.id, a.disease_code::text AS disease, d.name AS disease_name, a.level::text AS level, a.week_start::text AS week_start,
              a.hot_units, a.confidence, a.title, a.body, a.evidence, a.is_simulated, a.needs_epidemiologist_review,
              a.status, a.reviewed_at, a.created_at
         FROM surveillance.anomaly a JOIN surveillance.disease d ON d.code = a.disease_code
        WHERE ${c.sql} AND ($4::text IS NULL OR a.disease_code = $4::citext)
        ORDER BY (a.level::text = $5) DESC, a.created_at DESC`,
      [...c.params, disease ?? null, scope.level],
    )
    return rows.map((r) => ({
      id: r.id,
      disease: r.disease,
      diseaseName: r.disease_name,
      level: r.level,
      weekStart: r.week_start,
      hotUnits: r.hot_units ?? [],
      confidence: numOr0(r.confidence),
      title: r.title,
      body: r.body,
      evidence: Array.isArray(r.evidence) ? r.evidence.map(String) : [],
      simulated: r.is_simulated,
      needsEpidemiologistReview: r.needs_epidemiologist_review,
      status: r.status,
      reviewedAt: iso(r.reviewed_at),
      createdAt: iso(r.created_at)!,
    }))
  }

  async actions(scope: GovScope, disease?: string | null): Promise<GovResponseAction[]> {
    const rows = await this.db.query<any>(
      `SELECT ra.id, ra.disease_code::text AS disease, ra.title, ra.meta, ra.status, ra.tone, ra.created_at, ra.updated_at
         FROM surveillance.response_action ra
        WHERE ra.level = $1::admin.admin_level
          AND ra.zone_id IS NOT DISTINCT FROM $2::smallint
          AND ra.state_id IS NOT DISTINCT FROM $3::smallint
          AND ra.district_id IS NOT DISTINCT FROM $4::uuid
          AND ($5::text IS NULL OR ra.disease_code = $5::citext)
        ORDER BY ra.created_at, ra.title`,
      [scope.level, scope.zoneId, scope.stateId, scope.districtId, disease ?? null],
    )
    return rows.map((r) => ({
      id: r.id,
      disease: r.disease,
      title: r.title,
      meta: r.meta,
      status: r.status,
      tone: r.tone,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
    }))
  }

  async fieldRequests(scope: GovScope): Promise<GovFieldRequest[]> {
    const c = this.anomalyScopeSql(scope)
    const rows = await this.db.query<any>(
      `SELECT f.id, f.anomaly_id, f.team_name, f.status, f.created_at, a.title AS anomaly_title, a.disease_code::text AS disease,
              p.full_name AS requested_by
         FROM surveillance.field_request f
         JOIN surveillance.anomaly a ON a.id = f.anomaly_id
         JOIN identity.app_user u ON u.id = f.requested_by_user_id
         JOIN identity.person p ON p.id = u.person_id
        WHERE ${c.sql}
        ORDER BY f.created_at DESC`,
      c.params,
    )
    return rows.map((r) => ({
      id: r.id,
      anomalyId: r.anomaly_id,
      anomalyTitle: r.anomaly_title,
      disease: r.disease,
      teamName: r.team_name,
      status: r.status,
      requestedBy: r.requested_by,
      createdAt: iso(r.created_at)!,
    }))
  }

  /** The disease the console opens on: the area's own open anomaly, else the first disease with reports. */
  async defaultDisease(scope: GovScope): Promise<string | null> {
    const a = (await this.anomalies(scope)).find((x) => x.level === scope.level && x.status !== 'dismissed')
    if (a) return a.disease
    const r = await this.db.query<{ d: string }>(
      `SELECT disease_code::text AS d FROM surveillance.case_report WHERE district_id = ANY($1::uuid[]) GROUP BY 1 ORDER BY sum(cases) DESC LIMIT 1`,
      [scope.districtIds],
    )
    return r[0]?.d ?? null
  }

  async surveillance(scope: GovScope, requested?: string | null): Promise<GovSurveillance> {
    const diseases = await this.units.diseases()
    const diseaseCode = requested ?? (await this.defaultDisease(scope)) ?? diseases[0]?.code ?? null
    const dz = diseases.find((d) => d.code === diseaseCode)
    if (!diseaseCode || !dz) {
      return {
        diseases: diseases.map((d) => ({ code: d.code, name: d.name })),
        disease: null,
        week: null,
        series: unavailable('Unknown disease.'),
        stats: unavailable('Unknown disease.'),
        highestRates: unavailable('Unknown disease.'),
        districts: unavailable('Unknown disease.'),
        anomalies: [],
        insight: unavailable('Unknown disease.'),
        responseActions: [],
        fieldRequests: [],
        note: 'Cases reported by labs and doctors on the platform, grouped by week. Counts under the small-cell limit are hidden.',
      }
    }

    const week = (
      await this.db.query<{ w: string | null }>(
        'SELECT max(week_start)::text AS w FROM surveillance.case_report WHERE district_id = ANY($1::uuid[])',
        [scope.districtIds],
      )
    )[0]?.w

    const base = {
      diseases: diseases.map((d) => ({ code: d.code, name: d.name })),
      disease: { code: dz.code, name: dz.name, thresholdPerLakh: dz.thresholdPerLakh, sdThreshold: dz.sdThreshold },
      week: week ?? null,
      anomalies: await this.anomalies(scope, diseaseCode),
      responseActions: await this.actions(scope, diseaseCode),
      fieldRequests: await this.fieldRequests(scope),
      note: `Cases reported by labs and doctors on the platform, grouped by week. Counts under ${scope.smallCellMin} are hidden.`,
    }
    if (!week) {
      const why = 'No case reports have been received from this area yet.'
      return { ...base, series: unavailable(why), stats: unavailable(why), highestRates: unavailable(why), districts: unavailable(why), insight: unavailable(why) }
    }

    // --- 12-week series with the 5-year baseline of the same ISO week
    const weekly = await this.db.query<any>(
      `SELECT w::date::text AS week_start, extract(week FROM w)::int AS iso_week,
              (SELECT coalesce(sum(cr.cases), 0) FROM surveillance.case_report cr
                WHERE cr.week_start = w::date AND cr.disease_code = $1::citext AND cr.district_id = ANY($3::uuid[]))::int AS cases,
              (SELECT sum(b.baseline_cases) FROM surveillance.baseline b
                WHERE b.disease_code = $1::citext AND b.district_id = ANY($3::uuid[]) AND b.iso_week = extract(week FROM w)::int) AS baseline,
              (SELECT sqrt(sum(b.sd * b.sd)) FROM surveillance.baseline b
                WHERE b.disease_code = $1::citext AND b.district_id = ANY($3::uuid[]) AND b.iso_week = extract(week FROM w)::int) AS sd
         FROM generate_series($2::date - 77, $2::date, interval '7 days') w
        ORDER BY w`,
      [diseaseCode, week, scope.districtIds],
    )
    const series = weekly.map((r) => ({
      weekStart: r.week_start as string,
      isoWeek: r.iso_week as number,
      cases: this.smallCell(numOr0(r.cases), scope.smallCellMin),
      baseline: num(r.baseline) === null ? null : round1(numOr0(r.baseline)),
      sd: num(r.sd) === null ? null : round1(numOr0(r.sd)),
    }))
    const nowRow = weekly[weekly.length - 1]!
    const cases = numOr0(nowRow.cases)
    const baseline = num(nowRow.baseline)

    // --- units (blocks / districts / states): rates and the above-threshold count
    const um = await this.units.unitMetrics(scope, diseaseCode, (await this.anomalies(scope, diseaseCode)).filter((a) => a.level === scope.level).flatMap((a) => a.hotUnits))
    const reporting = um.units.filter((u) => u.diseases[diseaseCode]?.reported)
    const popReporting = await this.reportingPopulation(scope, diseaseCode, week)
    const ratePerLakh = popReporting && cases >= scope.smallCellMin ? round1((cases * 100000) / popReporting) : null
    const ratio = baseline && baseline > 0 ? cases / baseline : null

    const stats = {
      thisWeek: this.smallCell(cases, scope.smallCellMin),
      baseline5y: baseline === null ? null : round1(baseline),
      baselineNote: 'Same ISO week, average of 2021-2025',
      ratePerLakh,
      unitsAboveThreshold: um.units.filter((u) => u.diseases[diseaseCode]?.aboveThreshold).length,
      unitsReporting: reporting.length,
      thresholdNote: `Threshold = ${dz.thresholdPerLakh} cases per lakh in a week; baseline alert = ${dz.sdThreshold} SD over baseline`,
      trend:
        ratio === null
          ? null
          : ratio > 1.05
            ? { direction: 'up' as const, pctVsBaseline: Math.round((ratio - 1) * 100) }
            : { direction: 'down' as const, pctVsBaseline: Math.round((1 - ratio) * 100) },
    }

    const highest = [...um.units]
      .filter((u) => u.diseases[diseaseCode]?.reported)
      .sort((a, b) => (b.diseases[diseaseCode]!.perLakh ?? -1) - (a.diseases[diseaseCode]!.perLakh ?? -1))
      .slice(0, 6)
      .map((u) => ({
        unitId: u.id,
        code: u.code,
        name: u.name,
        kind: u.kind,
        cases: u.diseases[diseaseCode]!.cases,
        casesLabel: u.diseases[diseaseCode]!.suppressed ? `<${scope.smallCellMin}` : String(u.diseases[diseaseCode]!.cases),
        perLakh: u.diseases[diseaseCode]!.perLakh,
        status: u.diseases[diseaseCode]!.aboveThreshold ? ('above_threshold' as const) : ('normal' as const),
      }))

    // --- district rows from the small-cell-safe view (counts under the limit are never returned)
    const dw = await this.db.query<any>(
      `SELECT v.district_id::text, d.name, v.cases_shown, v.suppressed,
              CASE WHEN v.suppressed THEN NULL ELSE v.per_lakh END AS per_lakh,
              v.baseline_cases, v.sd, CASE WHEN v.suppressed THEN NULL ELSE v.above_threshold END AS above_baseline
         FROM surveillance.v_district_week v JOIN geo.district d ON d.id = v.district_id
        WHERE v.disease_code = $1::citext AND v.week_start = $2::date AND v.district_id = ANY($3::uuid[])
        ORDER BY v.per_lakh DESC NULLS LAST, d.name`,
      [diseaseCode, week, scope.districtIds],
    )
    const districts = dw.map((r) => ({
      districtId: r.district_id as string,
      name: r.name as string,
      cases: r.cases_shown === null ? null : numOr0(r.cases_shown),
      suppressed: !!r.suppressed,
      perLakh: num(r.per_lakh),
      baseline: num(r.baseline_cases),
      aboveBaseline: r.above_baseline as boolean | null,
    }))

    // --- insight: the area's anomaly for this disease, else a computed "within expected range" statement
    const own = base.anomalies.find((a) => a.level === scope.level && a.status !== 'dismissed') ?? base.anomalies[0]
    const aboveBaselineCount = districts.filter((d) => d.aboveBaseline).length
    const insight = own
      ? available({ kind: 'anomaly' as const, anomaly: own })
      : available({
          kind: 'none' as const,
          title: `No unusual pattern for ${dz.name.toLowerCase()}`,
          body: `Weekly counts are within the expected range in ${districts.length - aboveBaselineCount} of ${districts.length} districts reporting. The system flags a district that crosses ${dz.sdThreshold} SD above its baseline.`,
          simulated: true,
        })

    return {
      ...base,
      series: available(series),
      stats: available(stats),
      highestRates: available(highest),
      districts: available(districts),
      insight,
    }
  }

  private smallCell(count: number, min: number): number | null {
    return count < min ? null : count
  }

  private async reportingPopulation(scope: GovScope, disease: string, week: string): Promise<number | null> {
    const r = await this.db.query<{ p: string | null }>(
      `SELECT sum(p.population)::text AS p
         FROM (SELECT DISTINCT district_id FROM surveillance.case_report
                WHERE disease_code = $1::citext AND week_start = $2::date AND district_id = ANY($3::uuid[])) c
         JOIN LATERAL (SELECT population FROM geo.population gp WHERE gp.district_id = c.district_id ORDER BY as_of_year DESC LIMIT 1) p ON true`,
      [disease, week, scope.districtIds],
    )
    return num(r[0]?.p)
  }

  // ---------------------------------------------------------------- writes

  async reviewAnomaly(scope: GovScope, actor: AuthenticatedUser, id: string, status: 'reviewed' | 'dismissed'): Promise<GovAnomaly> {
    await this.assertAnomalyInScope(scope, id)
    await this.db.query(
      `UPDATE surveillance.anomaly SET status = $2, reviewed_by_user_id = $3::uuid, reviewed_at = now() WHERE id = $1::uuid`,
      [id, status, scope.userId],
    )
    await this.audit.logAction(actor, 'surveillance.anomaly_review', { entityType: 'anomaly', entityId: id, details: { status } })
    return (await this.anomalies(scope)).find((a) => a.id === id)!
  }

  async createAction(
    scope: GovScope,
    actor: AuthenticatedUser,
    input: { disease: string; title: string; meta?: string; status?: 'planned' | 'in_progress' | 'done' },
  ): Promise<GovResponseAction> {
    const dz = await this.db.query('SELECT 1 FROM surveillance.disease WHERE code = $1::citext', [input.disease])
    if (!dz.length) throw new NotFoundException({ success: false, errorMessage: 'Unknown disease.' })
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO surveillance.response_action (disease_code, level, zone_id, state_id, district_id, title, meta, status, created_by_user_id)
       VALUES ($1::citext, $2::admin.admin_level, $3::smallint, $4::smallint, $5::uuid, $6, $7, $8, $9::uuid) RETURNING id`,
      [input.disease, scope.level, scope.zoneId, scope.stateId, scope.districtId, input.title, input.meta ?? null, input.status ?? 'planned', scope.userId],
    )
    await this.audit.logAction(actor, 'surveillance.action_create', { entityType: 'response_action', entityId: rows[0]!.id, details: { disease: input.disease } })
    return (await this.actions(scope)).find((a) => a.id === rows[0]!.id)!
  }

  async updateAction(scope: GovScope, actor: AuthenticatedUser, id: string, status: 'planned' | 'in_progress' | 'done'): Promise<GovResponseAction> {
    const rows = await this.db.query<{ id: string }>(
      `UPDATE surveillance.response_action SET status = $2
        WHERE id = $1::uuid AND level = $3::admin.admin_level
          AND zone_id IS NOT DISTINCT FROM $4::smallint AND state_id IS NOT DISTINCT FROM $5::smallint AND district_id IS NOT DISTINCT FROM $6::uuid
        RETURNING id`,
      [id, status, scope.level, scope.zoneId, scope.stateId, scope.districtId],
    )
    if (!rows.length) throw new NotFoundException({ success: false, errorMessage: 'Response action not found in your area.' })
    await this.audit.logAction(actor, 'surveillance.action_update', { entityType: 'response_action', entityId: id, details: { status } })
    return (await this.actions(scope)).find((a) => a.id === id)!
  }

  async requestFieldInvestigation(
    scope: GovScope,
    actor: AuthenticatedUser,
    input: { anomalyId: string; teamName: string },
  ): Promise<GovFieldRequest> {
    await this.assertAnomalyInScope(scope, input.anomalyId)
    const open = await this.db.query(
      `SELECT 1 FROM surveillance.field_request WHERE anomaly_id = $1::uuid AND team_name = $2 AND status IN ('requested','assigned')`,
      [input.anomalyId, input.teamName],
    )
    if (open.length) throw new ConflictException({ success: false, errorMessage: 'A field investigation for this team is already open.' })
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO surveillance.field_request (anomaly_id, requested_by_user_id, team_name) VALUES ($1::uuid, $2::uuid, $3) RETURNING id`,
      [input.anomalyId, scope.userId, input.teamName],
    )
    await this.audit.logAction(actor, 'surveillance.field_request', { entityType: 'field_request', entityId: rows[0]!.id, details: { teamName: input.teamName } })
    return (await this.fieldRequests(scope)).find((f) => f.id === rows[0]!.id)!
  }

  private async assertAnomalyInScope(scope: GovScope, id: string): Promise<void> {
    const c = this.anomalyScopeSql(scope)
    const rows = await this.db.query(`SELECT 1 FROM surveillance.anomaly a WHERE a.id = $4::uuid AND ${c.sql}`, [
      ...c.params,
      id,
    ])
    if (!rows.length) throw new ForbiddenException({ success: false, errorMessage: 'That anomaly is outside your area.' })
  }
}
