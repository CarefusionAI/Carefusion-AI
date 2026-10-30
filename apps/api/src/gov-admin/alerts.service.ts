import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { GovAlert, GovAlertList, GovAlertTarget, GovAlertTargetScope } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'
import { GovScopeService } from './gov-scope.service'
import type { GovScope } from './gov-scope.service'
import { iso, numOr0, unavailable } from './gov-util'

export interface AlertInput {
  type: 'advisory' | 'emergency'
  title: string
  body: string
  category: string
  target: { scope: GovAlertTargetScope; id?: string | number }
  /** ISO time; omitted = send as soon as it is allowed to go out */
  scheduledAt?: string
  sms: boolean
  translate: boolean
  saveAsDraft: boolean
}

const OWN_SCOPE: Record<string, GovAlertTargetScope> = { district: 'district', state: 'state', zonal: 'zone', central: 'national' }

@Injectable()
export class AlertsService {
  private readonly demoMode: boolean

  constructor(
    config: ConfigService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly scopes: GovScopeService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true'
  }

  // ------------------------------------------------------------------ reads

  /** Targets the admin may address: the whole area and the units directly below it. */
  async targets(scope: GovScope): Promise<GovAlertTarget[]> {
    const out: GovAlertTarget[] = []
    if (scope.level === 'central') out.push({ scope: 'national', id: null, name: 'Whole country' })
    if (scope.level === 'zonal') out.push({ scope: 'zone', id: String(scope.zoneId), name: `Whole ${scope.unitName}` })
    if (scope.level === 'state') out.push({ scope: 'state', id: String(scope.stateId), name: `Whole ${scope.unitName}` })
    if (scope.level === 'district') out.push({ scope: 'district', id: scope.districtId, name: `Whole ${scope.unitName}` })
    if (scope.level === 'central') {
      const z = await this.db.query<{ id: number; name: string }>('SELECT id, name FROM geo.zone ORDER BY id')
      out.push(...z.map((r) => ({ scope: 'zone' as const, id: String(r.id), name: `${r.name} zone` })))
    }
    if (scope.level === 'central' || scope.level === 'zonal') {
      const s = await this.db.query<{ id: number; name: string }>('SELECT id, name FROM geo.state WHERE id = ANY($1::smallint[]) ORDER BY name', [scope.stateIds])
      out.push(...s.map((r) => ({ scope: 'state' as const, id: String(r.id), name: r.name })))
    }
    if (scope.level === 'state') {
      const d = await this.db.query<{ id: string; name: string }>('SELECT id::text, name FROM geo.district WHERE id = ANY($1::uuid[]) ORDER BY name', [scope.districtIds])
      out.push(...d.map((r) => ({ scope: 'district' as const, id: r.id, name: r.name })))
    }
    return out
  }

  private selectSql(): string {
    return `SELECT a.id, a.scope::text AS scope, a.zone_id, a.state_id, a.district_id, a.severity::text AS severity, a.category, a.category_group,
                   a.title, a.body, a.starts_at, a.status::text AS status, a.scheduled_at, a.sent_at, a.sms, a.translate, a.reach_count,
                   a.issuer_name, a.second_approver_user_id, a.second_approved_at, a.issued_by_user_id,
                   z.name AS zone_name, s.name AS state_name, d.name AS district_name,
                   sp.full_name AS second_approver_name, ip.full_name AS issued_by_name
              FROM engage.health_alert a
              LEFT JOIN geo.zone z ON z.id = a.zone_id
              LEFT JOIN geo.state s ON s.id = a.state_id
              LEFT JOIN geo.district d ON d.id = a.district_id
              LEFT JOIN identity.app_user su ON su.id = a.second_approver_user_id
              LEFT JOIN identity.person sp ON sp.id = su.person_id
              LEFT JOIN identity.app_user iu ON iu.id = a.issued_by_user_id
              LEFT JOIN identity.person ip ON ip.id = iu.person_id`
  }

  /** Alerts addressed to places inside the admin's area. */
  private scopeWhere(scope: GovScope): { sql: string; params: unknown[] } {
    if (scope.level === 'central') return { sql: 'TRUE', params: [] }
    return {
      sql: `((a.scope::text = 'district' AND a.district_id = ANY($1::uuid[]))
          OR (a.scope::text = 'state' AND a.state_id = ANY($2::smallint[]) AND $3::text <> 'district')
          OR (a.scope::text = 'zone' AND a.zone_id = $4::smallint AND $3::text IN ('zonal')))`,
      params: [scope.districtIds, scope.stateIds, scope.level, scope.zoneId],
    }
  }

  private toAlert(r: any, scope: GovScope): GovAlert {
    const targetName =
      r.scope === 'national' ? 'Whole country' : r.scope === 'zone' ? `${r.zone_name} zone` : r.scope === 'state' ? r.state_name : r.district_name
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category,
      type: r.severity === 'emergency' ? 'emergency' : 'advisory',
      status: r.status,
      target: { scope: r.scope, id: r.scope === 'national' ? null : String(r.zone_id ?? r.state_id ?? r.district_id), name: targetName },
      scheduledAt: iso(r.scheduled_at),
      sentAt: iso(r.sent_at),
      startsAt: iso(r.starts_at)!,
      sms: r.sms,
      translate: r.translate,
      reach: r.reach_count === null ? null : numOr0(r.reach_count),
      issuer: r.issuer_name,
      issuedBy: r.issued_by_name,
      secondApprover: r.second_approver_name,
      secondApprovedAt: iso(r.second_approved_at),
      issuedAtMyLevel: r.scope === OWN_SCOPE[scope.level],
      needsSecondApproval: r.status === 'pending_second_approval',
    }
  }

  async list(scope: GovScope): Promise<GovAlertList> {
    const w = this.scopeWhere(scope)
    const rows = await this.db.query<any>(
      `${this.selectSql()} WHERE ${w.sql} ORDER BY coalesce(a.scheduled_at, a.sent_at, a.starts_at) DESC LIMIT 100`,
      w.params,
    )
    const items = rows.map((r) => this.toAlert(r, scope))
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    return {
      level: scope.level,
      items,
      stats: {
        thisMonth: items.filter((a) => ['sent', 'scheduled'].includes(a.status) && new Date(a.sentAt ?? a.scheduledAt ?? a.startsAt) >= monthStart).length,
        awaitingSecondApproval: items.filter((a) => a.status === 'pending_second_approval').length,
        scheduled: items.filter((a) => a.status === 'scheduled').length,
        drafts: items.filter((a) => a.status === 'draft').length,
      },
      targets: await this.targets(scope),
      sender: this.issuerName(scope),
      secondApprovalRule: 'An emergency alert goes out only after a second admin approves it.',
    }
  }

  /** Real recipients of the citizen app (active citizen accounts living in the target). Phone-only recipients cannot be counted: no phone registry. */
  async reachEstimate(scope: GovScope, target: { scope: GovAlertTargetScope; id?: string | number }, category: string, emergency: boolean) {
    this.assertTargetInScope(scope, target)
    const count = await this.recipientCount(target, category, emergency)
    return {
      appRecipients: count,
      phoneOnlyRecipients: unavailable<number>('No phone-number registry exists in the alpha; SMS-only reach cannot be counted.'),
      mutesApplied: !emergency,
    }
  }

  private async recipientCount(target: { scope: GovAlertTargetScope; id?: string | number }, category: string, emergency: boolean): Promise<number> {
    const smallId = target.scope === 'zone' || target.scope === 'state' ? Number(target.id) : null
    const districtId = target.scope === 'district' ? String(target.id) : null
    const rows = await this.db.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM identity.app_user u
         JOIN identity.citizen_profile c ON c.person_id = u.person_id
         LEFT JOIN geo.district d ON d.id = c.district_id
         LEFT JOIN geo.state s ON s.id = d.state_id
        WHERE u.status = 'active' AND u.account_type = 'citizen'
          AND ($1::text = 'national'
               OR ($1::text = 'zone' AND s.zone_id = $2::smallint)
               OR ($1::text = 'state' AND d.state_id = $2::smallint)
               OR ($1::text = 'district' AND c.district_id = $3::uuid))
          AND ($4::boolean OR NOT EXISTS (SELECT 1 FROM engage.alert_mute m WHERE m.user_id = u.id AND m.category = $5::text))`,
      [target.scope, smallId, districtId, emergency, category],
    )
    return numOr0(rows[0]?.n)
  }

  // ------------------------------------------------------------------ writes

  private issuerName(scope: GovScope): string {
    switch (scope.level) {
      case 'district':
        return `Demo District Medical Office, ${scope.unitName}`
      case 'state':
        return `Demo Directorate of Health Services, ${scope.unitName}`
      case 'zonal':
        return `Demo MoHFW Regional Office, ${scope.unitName}`
      default:
        return 'Demo Ministry of Health & Family Welfare'
    }
  }

  private assertTargetInScope(scope: GovScope, target: { scope: GovAlertTargetScope; id?: string | number }): void {
    const id = target.id
    const bad = () => new ForbiddenException({ success: false, errorMessage: 'That target is outside your area.' })
    if (target.scope === 'national') {
      if (scope.level !== 'central') throw bad()
      return
    }
    if (id === undefined || id === null || id === '') throw new BadRequestException({ success: false, errorMessage: 'A target id is required.' })
    if (target.scope === 'zone') {
      if (scope.level === 'central') return
      if (scope.level === 'zonal' && Number(id) === scope.zoneId) return
      throw bad()
    }
    if (target.scope === 'state') {
      if (scope.level === 'district') throw bad()
      if (scope.stateIds.includes(Number(id))) return
      throw bad()
    }
    if (!scope.districtIds.includes(String(id))) throw bad()
  }

  async create(scope: GovScope, actor: AuthenticatedUser, input: AlertInput): Promise<GovAlert> {
    this.assertTargetInScope(scope, input.target)
    const emergency = input.type === 'emergency'
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new BadRequestException({ success: false, errorMessage: 'Invalid scheduled time.' })
    const future = !!scheduledAt && scheduledAt.getTime() > Date.now() + 30_000

    let status: string
    if (input.saveAsDraft) status = 'draft'
    else if (emergency) status = 'pending_second_approval'
    else status = future ? 'scheduled' : 'sent'

    const reach = status === 'sent' ? await this.recipientCount(input.target, input.category, emergency) : null
    const t = input.target
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO engage.health_alert
         (issued_by_user_id, scope, state_id, district_id, zone_id, severity, category, category_group, title, body,
          starts_at, status, scheduled_at, sent_at, sms, translate, reach_count, issuer_name)
       VALUES ($1::uuid, $2::engage.alert_scope, $3::smallint, $4::uuid, $5::smallint, $6::engage.alert_severity, $7, $8, $9, $10,
               coalesce($11::timestamptz, now()), $12::engage.alert_status, $13::timestamptz, $14::timestamptz, $15, $16, $17, $18)
       RETURNING id`,
      [
        scope.userId,
        t.scope,
        t.scope === 'state' ? Number(t.id) : null,
        t.scope === 'district' ? String(t.id) : null,
        t.scope === 'zone' ? Number(t.id) : null,
        emergency ? 'emergency' : 'normal',
        input.category,
        emergency ? 'emergency' : 'health_dept',
        input.title,
        input.body,
        future ? scheduledAt!.toISOString() : null,
        status,
        scheduledAt ? scheduledAt.toISOString() : null,
        status === 'sent' ? new Date().toISOString() : null,
        input.sms,
        input.translate,
        reach,
        this.issuerName(scope),
      ],
    )
    await this.audit.logAction(actor, status === 'sent' ? 'alert.broadcast' : 'alert.create', {
      entityType: 'health_alert',
      entityId: rows[0]!.id,
      details: { status, scope: t.scope, severity: emergency ? 'emergency' : 'normal', reach, smsSimulated: input.sms, mock: true },
    })
    return this.get(scope, rows[0]!.id)
  }

  async get(scope: GovScope, id: string): Promise<GovAlert> {
    const rows = await this.db.query<any>(`${this.selectSql()} WHERE a.id = $1::uuid`, [id])
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Alert not found.' })
    this.assertAlertInScope(scope, r)
    return this.toAlert(r, scope)
  }

  private assertAlertInScope(scope: GovScope, r: any): void {
    if (scope.level === 'central') return
    const ok =
      (r.scope === 'district' && scope.districtIds.includes(r.district_id)) ||
      (r.scope === 'state' && scope.stateIds.includes(r.state_id) && scope.level !== 'district') ||
      (r.scope === 'zone' && r.zone_id === scope.zoneId && scope.level === 'zonal')
    if (!ok) throw new ForbiddenException({ success: false, errorMessage: 'That alert is outside your area.' })
  }

  /** Second admin approves an emergency alert; it then goes out (now) or is scheduled. */
  async secondApprove(scope: GovScope, actor: AuthenticatedUser, id: string, asPeer: boolean): Promise<GovAlert> {
    const rows = await this.db.query<any>(`${this.selectSql()} WHERE a.id = $1::uuid`, [id])
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Alert not found.' })
    this.assertAlertInScope(scope, r)
    if (r.status !== 'pending_second_approval') throw new ConflictException({ success: false, errorMessage: 'This alert is not waiting for a second approval.' })

    let approver = scope.userId
    let simulated = false
    if (approver === r.issued_by_user_id) {
      if (!(asPeer && this.demoMode && actor.isDemo)) {
        throw new ConflictException({ success: false, errorMessage: 'A different admin must approve an emergency alert. You issued this one.' })
      }
      const peer = (await this.scopes.peers(scope))[0]
      if (!peer) throw new ConflictException({ success: false, errorMessage: 'No other admin of your level and area exists to act as second approver.' })
      approver = peer.userId
      simulated = true
    }
    const future = r.scheduled_at && new Date(r.scheduled_at).getTime() > Date.now() + 30_000
    const target = { scope: r.scope as GovAlertTargetScope, id: r.scope === 'zone' ? r.zone_id : r.scope === 'state' ? r.state_id : r.district_id }
    const reach = future ? null : await this.recipientCount(target, r.category, true)
    await this.db.query(
      `UPDATE engage.health_alert
          SET second_approver_user_id = $2::uuid, second_approved_at = now(),
              status = $3::engage.alert_status, sent_at = $4::timestamptz, reach_count = $5
        WHERE id = $1::uuid`,
      [id, approver, future ? 'scheduled' : 'sent', future ? null : new Date().toISOString(), reach],
    )
    await this.audit.logAction(actor, 'alert.second_approval', {
      entityType: 'health_alert',
      entityId: id,
      details: { secondApprover: approver, simulatedSecondSigner: simulated, reach, mock: true },
    })
    return this.get(scope, id)
  }

  /** Sends or schedules a saved draft (an emergency draft goes to second approval instead). */
  async sendDraft(scope: GovScope, actor: AuthenticatedUser, id: string, scheduledAt?: string): Promise<GovAlert> {
    const rows = await this.db.query<any>(`${this.selectSql()} WHERE a.id = $1::uuid`, [id])
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Alert not found.' })
    this.assertAlertInScope(scope, r)
    if (r.status !== 'draft') throw new ConflictException({ success: false, errorMessage: 'Only a draft can be sent from here.' })
    const emergency = r.severity === 'emergency'
    const when = scheduledAt ? new Date(scheduledAt) : r.scheduled_at ? new Date(r.scheduled_at) : null
    const future = !!when && when.getTime() > Date.now() + 30_000
    const target = { scope: r.scope as GovAlertTargetScope, id: r.scope === 'zone' ? r.zone_id : r.scope === 'state' ? r.state_id : r.district_id }
    let status: string
    let reach: number | null = null
    if (emergency) status = 'pending_second_approval'
    else if (future) status = 'scheduled'
    else {
      status = 'sent'
      reach = await this.recipientCount(target, r.category, false)
    }
    await this.db.query(
      `UPDATE engage.health_alert
          SET status = $2::engage.alert_status, scheduled_at = $3::timestamptz, sent_at = $4::timestamptz, reach_count = $5,
              starts_at = coalesce($6::timestamptz, starts_at)
        WHERE id = $1::uuid`,
      [id, status, when ? when.toISOString() : null, status === 'sent' ? new Date().toISOString() : null, reach, future ? when!.toISOString() : null],
    )
    await this.audit.logAction(actor, status === 'sent' ? 'alert.broadcast' : 'alert.submit', {
      entityType: 'health_alert',
      entityId: id,
      details: { status, reach, mock: true },
    })
    return this.get(scope, id)
  }

  async cancel(scope: GovScope, actor: AuthenticatedUser, id: string): Promise<GovAlert> {
    const rows = await this.db.query<any>(`${this.selectSql()} WHERE a.id = $1::uuid`, [id])
    const r = rows[0]
    if (!r) throw new NotFoundException({ success: false, errorMessage: 'Alert not found.' })
    this.assertAlertInScope(scope, r)
    if (!['draft', 'pending_second_approval', 'scheduled'].includes(r.status)) {
      throw new ConflictException({ success: false, errorMessage: 'A sent alert cannot be cancelled.' })
    }
    await this.db.query("UPDATE engage.health_alert SET status = 'cancelled'::engage.alert_status WHERE id = $1::uuid", [id])
    await this.audit.logAction(actor, 'alert.cancel', { entityType: 'health_alert', entityId: id, details: { previous: r.status } })
    return this.get(scope, id)
  }
}
