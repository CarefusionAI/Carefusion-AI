import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  GovAudit,
  GovFlaggedEvent,
  GovLevel,
  GovLogPage,
  GovReports,
  GovReportExport,
  GovReportPeriod,
} from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'
import type { GovScope } from './gov-scope.service'
import { iso, numOr0, round1, toCsv } from './gov-util'

const NEXT_LEVEL: Record<GovLevel, GovLevel | null> = { district: 'state', state: 'zonal', zonal: 'central', central: null }

const PERIODS: Record<GovReportPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  quarter: 'This quarter',
  fy: 'This financial year',
}

/** Audit and security, audit log, reports and exports. Everything returned is de-identified. */
@Injectable()
export class OversightService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ flagged events

  async flaggedEvents(scope: GovScope, status: 'open' | 'all' = 'all', limit = 50): Promise<GovFlaggedEvent[]> {
    const rows = await this.db.query<any>(
      `SELECT f.id, f.rule, f.severity, f.event_text, f.actor_role, f.status, f.created_at, f.reviewed_at, f.outcome_note, f.escalated_to_level::text AS escalated_to_level,
              h.name AS facility, d.name AS district, rp.full_name AS reviewed_by
         FROM audit.flagged_event f
         LEFT JOIN org.hospital h ON h.id = f.hospital_id
         LEFT JOIN geo.district d ON d.id = coalesce(f.district_id, h.district_id)
         LEFT JOIN identity.app_user ru ON ru.id = f.reviewed_by_user_id
         LEFT JOIN identity.person rp ON rp.id = ru.person_id
        WHERE coalesce(f.district_id, h.district_id) = ANY($1::uuid[])
          AND ($2::text = 'all' OR f.status = 'open')
        ORDER BY (f.status = 'open') DESC, f.created_at DESC
        LIMIT ${Math.min(limit, 200)}`,
      [scope.districtIds, status],
    )
    return rows.map((r) => ({
      id: r.id,
      rule: r.rule,
      severity: r.severity,
      event: r.event_text,
      actorRole: r.actor_role,
      facility: r.facility,
      district: r.district,
      status: r.status,
      createdAt: iso(r.created_at)!,
      reviewedAt: iso(r.reviewed_at),
      reviewedBy: r.reviewed_by,
      outcomeNote: r.outcome_note,
      escalatedToLevel: r.escalated_to_level,
    }))
  }

  async openFlagCount(scope: GovScope): Promise<number> {
    const r = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.flagged_event f LEFT JOIN org.hospital h ON h.id = f.hospital_id
        WHERE f.status = 'open' AND coalesce(f.district_id, h.district_id) = ANY($1::uuid[])`,
      [scope.districtIds],
    )
    return r[0]?.n ?? 0
  }

  private async loadFlag(scope: GovScope, id: string) {
    const rows = await this.db.query<any>(
      `SELECT f.id, f.status, coalesce(f.district_id, h.district_id)::text AS district_id
         FROM audit.flagged_event f LEFT JOIN org.hospital h ON h.id = f.hospital_id WHERE f.id = $1::uuid`,
      [id],
    )
    const f = rows[0]
    if (!f) throw new NotFoundException({ success: false, errorMessage: 'Flagged event not found.' })
    if (!scope.districtIds.includes(f.district_id)) throw new ForbiddenException({ success: false, errorMessage: 'That event is outside your area.' })
    if (f.status !== 'open') throw new ConflictException({ success: false, errorMessage: 'This event has already been reviewed.' })
    return f
  }

  async justifyFlag(scope: GovScope, actor: AuthenticatedUser, id: string, note: string): Promise<GovFlaggedEvent> {
    await this.loadFlag(scope, id)
    await this.db.query(
      "UPDATE audit.flagged_event SET status = 'justified', reviewed_by_user_id = $2::uuid, reviewed_at = now(), outcome_note = $3 WHERE id = $1::uuid",
      [id, scope.userId, note],
    )
    await this.audit.logAction(actor, 'audit.flag_justified', { entityType: 'flagged_event', entityId: id, details: { note } })
    return (await this.flaggedEvents(scope, 'all', 200)).find((f) => f.id === id)!
  }

  async escalateFlag(scope: GovScope, actor: AuthenticatedUser, id: string, note: string): Promise<GovFlaggedEvent> {
    const next = NEXT_LEVEL[scope.level]
    if (!next) {
      throw new ConflictException({
        success: false,
        errorMessage: 'There is no higher admin level. Central admins pass flagged events to the National Health Authority security cell outside this system.',
      })
    }
    await this.loadFlag(scope, id)
    await this.db.query(
      `UPDATE audit.flagged_event SET status = 'escalated', reviewed_by_user_id = $2::uuid, reviewed_at = now(), outcome_note = $3,
              escalated_to_level = $4::admin.admin_level WHERE id = $1::uuid`,
      [id, scope.userId, note, next],
    )
    await this.audit.logAction(actor, 'audit.flag_escalated', { entityType: 'flagged_event', entityId: id, details: { note, toLevel: next } })
    return (await this.flaggedEvents(scope, 'all', 200)).find((f) => f.id === id)!
  }

  // ------------------------------------------------------------ audit & security page

  async auditOverview(scope: GovScope): Promise<GovAudit> {
    const ids = scope.districtIds
    const [flags, openFlags] = await Promise.all([this.flaggedEvents(scope, 'all', 50), this.openFlagCount(scope)])

    const bg = await this.db.query<any>(
      `SELECT w::date::text AS week_start,
              (SELECT count(*) FROM access.emergency_access e
                 JOIN access.access_session s ON s.id = e.session_id
                 JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
                 JOIN org.hospital h ON h.id = dp.hospital_id
                WHERE h.district_id = ANY($1::uuid[]) AND s.started_at >= w AND s.started_at < w + interval '7 days')::int AS uses
         FROM generate_series(date_trunc('week', now()) - interval '77 days', date_trunc('week', now()), interval '7 days') w ORDER BY w`,
      [ids],
    )
    const kpi = await this.db.query<any>(
      `SELECT
         (SELECT count(*) FROM access.emergency_access e JOIN access.access_session s ON s.id = e.session_id
            JOIN identity.doctor_profile dp ON dp.user_id = s.user_id JOIN org.hospital h ON h.id = dp.hospital_id
           WHERE h.district_id = ANY($1::uuid[]) AND s.started_at >= now() - interval '30 days')::int AS bg_30d,
         (SELECT count(*) FROM access.emergency_access e JOIN access.access_session s ON s.id = e.session_id
            JOIN identity.doctor_profile dp ON dp.user_id = s.user_id JOIN org.hospital h ON h.id = dp.hospital_id
           WHERE h.district_id = ANY($1::uuid[]) AND e.hospital_review_status::text = 'pending')::int AS bg_pending_review,
         (SELECT count(*) FROM audit.activity_log l WHERE l.action = 'auth.locked' AND l.district_id = ANY($1::uuid[]) AND l.occurred_at >= now() - interval '30 days')::int AS locks_30d,
         (SELECT count(*) FROM admin.report_export x WHERE (x.district_id = ANY($1::uuid[]) OR ($2::text = 'central' AND x.district_id IS NULL))
            AND x.created_at >= date_trunc('month', now()))::int AS exports_month`,
      [ids, scope.level],
    )
    const k = kpi[0]!
    const rules = await this.db.query<{ code: string; value: any; description: string }>(
      `SELECT code::text AS code, value, description FROM admin.access_rule
        WHERE code IN ('session_minutes','break_glass_review_hours','failed_signins_before_lock','audit_retention_years','break_glass_central_verify_hours')`,
    )
    const rule = (c: string) => rules.find((r) => r.code === c)?.value ?? null
    return {
      level: scope.level,
      kpis: [
        { key: 'open_flags', label: 'Flagged events open', value: openFlags, unit: null, hint: 'Need a decision from you' },
        { key: 'break_glass_30d', label: 'Break-glass uses', value: k.bg_30d, unit: 'last 30 days', hint: `${k.bg_pending_review} waiting for hospital review` },
        { key: 'lockouts_30d', label: 'Account lock-outs', value: k.locks_30d, unit: 'last 30 days', hint: 'After repeated failed sign-ins' },
        { key: 'exports_month', label: 'Report exports', value: k.exports_month, unit: 'this month', hint: 'All de-identified' },
      ],
      flaggedEvents: flags,
      breakGlassWeekly: bg.map((r) => ({ weekStart: r.week_start, uses: r.uses })),
      accessRules: {
        doctorSessionMinutes: rule('session_minutes'),
        breakGlassReviewHours: rule('break_glass_review_hours'),
        breakGlassCentralVerifyHours: rule('break_glass_central_verify_hours'),
        failedSigninsBeforeLock: rule('failed_signins_before_lock'),
        auditRetentionYears: rule('audit_retention_years'),
      },
      escalateTo: NEXT_LEVEL[scope.level],
    }
  }

  // ------------------------------------------------------------ audit log

  async logs(scope: GovScope, opts: { type?: string; q?: string; limit: number; offset: number }): Promise<GovLogPage> {
    const where = `(l.district_id = ANY($1::uuid[]) OR h.district_id = ANY($1::uuid[]) OR ($2::text = 'central'))`
    const typeCase = `CASE WHEN l.action LIKE 'breakglass.%' OR l.action LIKE 'break_glass.%' THEN 'breakglass'
                           WHEN l.action LIKE 'auth.%' THEN 'signin'
                           WHEN l.action LIKE 'report.%' THEN 'export'
                           WHEN l.action ~ '^(admin|staff|alert|approval|surveillance|platform|audit|ai|blood|system)\\.' THEN 'admin'
                           ELSE 'access' END`
    const qFilter = `AND ($4::text IS NULL OR l.action ILIKE '%' || $4::text || '%' OR coalesce(l.details->>'text','') ILIKE '%' || $4::text || '%')`
    const typeFilter = `AND ($3::text IS NULL OR ${typeCase} = $3::text)`
    const from = `FROM audit.activity_log l LEFT JOIN org.hospital h ON h.id = l.hospital_id`
    const params = [scope.districtIds, scope.level, opts.type && opts.type !== 'all' ? opts.type : null, opts.q ?? null]
    const rows = await this.db.query<any>(
      `SELECT l.seq, l.occurred_at, l.action, l.account_type::text AS account_type, ${typeCase} AS type,
              h.name AS hospital, d.name AS district, l.details->>'text' AS text, l.details->>'ref' AS ref, l.entity_type,
              CASE WHEN l.account_type::text IN ('district_admin','state_admin','zonal_admin','central_admin','hospital_admin','pharmacy_admin') THEN p.full_name END AS actor_name
         ${from}
         LEFT JOIN geo.district d ON d.id = coalesce(l.district_id, h.district_id)
         LEFT JOIN identity.app_user u ON u.id = l.user_id
         LEFT JOIN identity.person p ON p.id = u.person_id
        WHERE ${where} ${typeFilter} ${qFilter}
        ORDER BY l.occurred_at DESC, l.seq DESC LIMIT ${Math.min(opts.limit, 200)} OFFSET ${Math.max(opts.offset, 0)}`,
      params,
    )
    const counts = await this.db.query<any>(
      `SELECT ${typeCase} AS type, count(*)::int AS n ${from} WHERE ${where} AND $3::text IS NOT DISTINCT FROM $3::text ${qFilter} GROUP BY 1`,
      params,
    )
    const level = (a: string): 'info' | 'ok' | 'notice' | 'alert' =>
      /^(breakglass|break_glass)\./.test(a) || a === 'auth.locked' || a === 'access.denied'
        ? 'alert'
        : /^(report\.export|alert\.|system\.)/.test(a) || a.endsWith('_simulated')
          ? 'notice'
          : /^(admin\.approve|auth\.key_registered|approval\.approved)/.test(a)
            ? 'ok'
            : 'info'
    return {
      items: rows.map((r) => ({
        seq: String(r.seq),
        at: iso(r.occurred_at)!,
        type: r.type,
        level: level(r.action),
        action: r.action,
        event: r.text ?? humanise(r.action),
        actorRole: r.account_type,
        actorName: r.actor_name ?? null,
        where: r.hospital ?? r.district ?? null,
        ref: r.ref ?? `AUD-${r.seq}`,
      })),
      counts: Object.fromEntries(counts.map((c) => [c.type, c.n])),
      note: 'Audit entries never show patient identity, IP address, GPS position or device.',
    }
  }

  // ------------------------------------------------------------ reports

  periodRange(period: GovReportPeriod): { from: string; to: string } {
    const now = new Date()
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const to = day(now)
    if (period === '7d') return { from: day(new Date(now.getTime() - 7 * 86400000)), to }
    if (period === '30d') return { from: day(new Date(now.getTime() - 30 * 86400000)), to }
    if (period === 'quarter') {
      const qStartMonth = [3, 6, 9, 0][Math.floor(((now.getUTCMonth() + 9) % 12) / 3)]!
      const y = now.getUTCMonth() >= qStartMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1
      return { from: day(new Date(Date.UTC(y, qStartMonth, 1))), to }
    }
    const fyYear = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
    return { from: day(new Date(Date.UTC(fyYear, 3, 1))), to }
  }

  private exportSelect(): string {
    return `SELECT x.id, x.report_code::text AS report_code, x.period_label, x.period_from::text AS period_from, x.period_to::text AS period_to,
                   x.format, x.size_bytes, x.created_at, x.expires_at, x.deidentified, p.full_name AS by_name, r.title
              FROM admin.report_export x
              JOIN admin.report_definition r ON r.code = x.report_code
              JOIN identity.app_user u ON u.id = x.requested_by_user_id
              JOIN identity.person p ON p.id = u.person_id`
  }

  private exportScopeSql(): string {
    return `x.level = $1::admin.admin_level AND x.zone_id IS NOT DISTINCT FROM $2::smallint AND x.state_id IS NOT DISTINCT FROM $3::smallint AND x.district_id IS NOT DISTINCT FROM $4::uuid AND x.expires_at > now()`
  }

  private toExport(r: any): GovReportExport {
    return {
      id: r.id,
      report: r.report_code,
      title: r.title,
      period: r.period_label,
      periodFrom: r.period_from,
      periodTo: r.period_to,
      format: r.format,
      sizeBytes: r.size_bytes === null ? null : numOr0(r.size_bytes),
      by: r.by_name,
      createdAt: iso(r.created_at)!,
      expiresAt: iso(r.expires_at)!,
      deidentified: r.deidentified,
      filename: `${r.report_code}_${String(r.period_label).toLowerCase().replace(/\s+/g, '-')}.${r.format}`,
    }
  }

  async reports(scope: GovScope): Promise<GovReports> {
    const defs = await this.db.query<any>(
      `SELECT code::text AS code, title, description, frequency, small_cell_min FROM admin.report_definition WHERE is_active AND $1::admin.admin_level = ANY(scope_levels) ORDER BY code`,
      [scope.level],
    )
    const ex = await this.db.query<any>(`${this.exportSelect()} WHERE ${this.exportScopeSql()} ORDER BY x.created_at DESC LIMIT 20`, [
      scope.level, scope.zoneId, scope.stateId, scope.districtId,
    ])
    return {
      level: scope.level,
      reports: defs.map((d) => ({ code: d.code, title: d.title, description: d.description, frequency: d.frequency, smallCellMin: d.small_cell_min })),
      periods: (Object.keys(PERIODS) as GovReportPeriod[]).map((k) => ({ key: k, label: PERIODS[k], ...this.periodRange(k) })),
      formats: [
        { format: 'csv', available: true },
        { format: 'pdf', available: false, reason: 'PDF rendering is not built in the alpha; CSV is available.' },
      ],
      recentExports: ex.map((r) => this.toExport(r)),
      retentionNote: 'Exports are kept for 30 days. They contain only aggregates; counts under the small-cell limit are hidden.',
    }
  }

  async createExport(scope: GovScope, actor: AuthenticatedUser, input: { report: string; period: GovReportPeriod; format: 'csv' | 'pdf' }) {
    if (input.format !== 'csv') {
      throw new BadRequestException({ success: false, available: false, errorMessage: 'PDF export is not available in the alpha. Use CSV.' })
    }
    const def = await this.db.query<any>(
      'SELECT code::text AS code, title, small_cell_min FROM admin.report_definition WHERE code = $1::citext AND is_active AND $2::admin.admin_level = ANY(scope_levels)',
      [input.report, scope.level],
    )
    if (!def.length) throw new NotFoundException({ success: false, errorMessage: 'Unknown report for your level.' })
    const range = this.periodRange(input.period)
    const csv = await this.buildCsv(scope, input.report, range, Math.max(def[0].small_cell_min, scope.smallCellMin))
    const bytes = Buffer.byteLength(csv, 'utf8')
    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO admin.report_export (report_code, requested_by_user_id, level, zone_id, state_id, district_id, period_label, period_from, period_to, format, size_bytes, deidentified)
       VALUES ($1::citext, $2::uuid, $3::admin.admin_level, $4::smallint, $5::smallint, $6::uuid, $7, $8::date, $9::date, 'csv', $10, true) RETURNING id`,
      [input.report, scope.userId, scope.level, scope.zoneId, scope.stateId, scope.districtId, PERIODS[input.period], range.from, range.to, bytes],
    )
    await this.audit.logAction(actor, 'report.export', {
      entityType: 'report_export',
      entityId: ins[0]!.id,
      details: { report: input.report, period: input.period, deidentified: true, bytes },
    })
    const row = await this.db.query<any>(`${this.exportSelect()} WHERE x.id = $1::uuid`, [ins[0]!.id])
    return { export: this.toExport(row[0]), content: csv, contentType: 'text/csv' }
  }

  /** Re-creates the file of an earlier export from its stored scope and period (data is live, so numbers may have moved). */
  async downloadExport(scope: GovScope, actor: AuthenticatedUser, id: string) {
    const rows = await this.db.query<any>(
      `${this.exportSelect()} WHERE x.id = $5::uuid AND ${this.exportScopeSql()}`,
      [scope.level, scope.zoneId, scope.stateId, scope.districtId, id],
    )
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Export not found, expired, or outside your area.' })
    const csv = await this.buildCsv(scope, r.report_code, { from: r.period_from, to: r.period_to }, scope.smallCellMin)
    await this.audit.logAction(actor, 'report.download', { entityType: 'report_export', entityId: id, details: { report: r.report_code, deidentified: true } })
    return { filename: this.toExport(r).filename, content: csv }
  }

  private async buildCsv(scope: GovScope, report: string, range: { from: string; to: string }, min: number): Promise<string> {
    const ids = scope.districtIds
    const hide = (n: unknown) => (numOr0(n) < min ? `<${min}` : String(numOr0(n)))
    switch (report) {
      case 'idsp_weekly': {
        const r = await this.db.query<any>(
          `SELECT d.name AS district, v.disease_code::text AS disease, v.week_start::text AS week_start, v.cases, v.suppressed,
                  CASE WHEN v.suppressed THEN NULL ELSE v.per_lakh END AS per_lakh, CASE WHEN v.suppressed THEN NULL ELSE v.above_threshold END AS above
             FROM surveillance.v_district_week v JOIN geo.district d ON d.id = v.district_id
            WHERE v.district_id = ANY($1::uuid[]) AND v.week_start BETWEEN $2::date AND $3::date
            ORDER BY d.name, v.disease_code, v.week_start`,
          [ids, range.from, range.to],
        )
        return toCsv(['district', 'disease', 'week_start', 'cases', 'per_lakh', 'above_baseline'], r.map((x) => [x.district, x.disease, x.week_start, x.suppressed ? `<${min}` : x.cases, x.per_lakh, x.above]))
      }
      case 'blood_organ': {
        const r = await this.db.query<any>(
          `SELECT d.name AS district, c.blood_group::text AS blood_group, c.units, c.days_cover, c.level
             FROM report.v_blood_cover c JOIN geo.district d ON d.id = c.district_id WHERE c.district_id = ANY($1::uuid[]) ORDER BY d.name, c.blood_group`,
          [ids],
        )
        return toCsv(['district', 'blood_group', 'units', 'days_cover', 'level'], r.map((x) => [x.district, x.blood_group, x.units, x.days_cover, x.level]))
      }
      case 'coverage': {
        const r = await this.db.query<any>(
          `SELECT d.name AS district, s.population, s.registered, s.abha_linked, s.pct_of_population
             FROM report.v_registered_share s JOIN geo.district d ON d.id = s.district_id WHERE s.district_id = ANY($1::uuid[]) ORDER BY d.name`,
          [ids],
        )
        return toCsv(['district', 'population', 'registered', 'abha_linked', 'pct_of_population'], r.map((x) => [x.district, x.population, hide(x.registered), hide(x.abha_linked), x.pct_of_population]))
      }
      case 'audit_access': {
        const r = await this.db.query<any>(
          `SELECT split_part(l.action, '.', 1) AS action_group, l.action, count(*)::int AS n
             FROM audit.activity_log l LEFT JOIN org.hospital h ON h.id = l.hospital_id
            WHERE (l.district_id = ANY($1::uuid[]) OR h.district_id = ANY($1::uuid[]) OR $2::text = 'central')
              AND l.occurred_at::date BETWEEN $3::date AND $4::date
            GROUP BY 1, 2 ORDER BY 1, 2`,
          [ids, scope.level, range.from, range.to],
        )
        return toCsv(['action_group', 'action', 'count'], r.map((x) => [x.action_group, x.action, hide(x.n)]))
      }
      case 'facilities': {
        const r = await this.db.query<any>(
          `SELECT 'hospital' AS kind, h.name, h.hospital_type::text AS subtype, h.ownership::text AS ownership, d.name AS district, h.status::text AS status
             FROM org.hospital h JOIN geo.district d ON d.id = h.district_id WHERE h.district_id = ANY($1::uuid[])
           UNION ALL
           SELECT 'pharmacy', p.name, p.pharmacy_type::text, NULL, d.name, p.status::text
             FROM org.pharmacy p JOIN geo.district d ON d.id = p.district_id WHERE p.district_id = ANY($1::uuid[])
           ORDER BY 1, 5, 2`,
          [ids],
        )
        return toCsv(['kind', 'name', 'type', 'ownership', 'district', 'status'], r.map((x) => [x.kind, x.name, x.subtype, x.ownership, x.district, x.status]))
      }
      default: {
        // health_summary
        const r = await this.db.query<any>(
          `SELECT d.name AS district,
                  (SELECT coalesce(sum(m.registrations), 0) FROM report.v_registrations_monthly m WHERE m.district_id = d.id AND m.month >= date_trunc('month', $2::date) AND m.month <= $3::date)::int AS new_registrations,
                  (SELECT count(*) FROM org.hospital h WHERE h.district_id = d.id AND h.status = 'active')::int AS hospitals,
                  (SELECT coalesce(sum(b.total), 0) FROM report.v_beds_rollup b WHERE b.level = 'district' AND b.unit = d.id::text)::int AS beds_total,
                  (SELECT coalesce(sum(b.free), 0) FROM report.v_beds_rollup b WHERE b.level = 'district' AND b.unit = d.id::text)::int AS beds_free,
                  (SELECT count(*) FROM engage.complaint c WHERE c.district_id = d.id AND c.status IN ('open','assigned') AND c.created_at::date BETWEEN $2::date AND $3::date)::int AS open_complaints,
                  (SELECT count(*) FROM engage.health_alert a WHERE a.district_id = d.id AND a.status::text = 'sent' AND a.starts_at::date BETWEEN $2::date AND $3::date)::int AS alerts_sent
             FROM geo.district d WHERE d.id = ANY($1::uuid[]) ORDER BY d.name`,
          [ids, range.from, range.to],
        )
        return toCsv(
          ['district', 'new_registrations', 'hospitals', 'beds_total', 'beds_free', 'open_complaints', 'district_alerts_sent'],
          r.map((x) => [x.district, hide(x.new_registrations), x.hospitals, x.beds_total, x.beds_free, hide(x.open_complaints), x.alerts_sent]),
        )
      }
    }
  }
}

function humanise(action: string): string {
  const s = action.replace(/[._]/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
