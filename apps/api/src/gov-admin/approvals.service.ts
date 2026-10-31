import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PoolClient } from 'pg'
import type { GovApprovalDecision, GovApprovalItem, GovApprovals, GovApprovalInbox, GovLevel } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import { ApprovalService } from '../approval/approval.service'
import type { AuthenticatedUser } from '../auth/types'
import { GovScopeService } from './gov-scope.service'
import type { GovScope } from './gov-scope.service'
import { iso, numOr0, round1 } from './gov-util'

const NEXT_LEVEL: Record<GovLevel, GovLevel | null> = { district: 'state', state: 'zonal', zonal: 'central', central: null }

const DOCTOR_TYPES = ['doctor']
const FLAGGED_TYPES = ['flagged_citizen', 'flagged_doctor', 'special_category']

interface Row {
  id: string
  subject_type: string
  step: number
  status: string
  priority: string
  submitted_at: Date
  due_at: Date
  decided_at: Date | null
  reason: string | null
  reminders_sent: number
  more_info_note: string | null
  more_info_requested_at: Date | null
  check_results: Record<string, any> | null
  applicant_name: string | null
  applicant_account_type: string | null
  needs_two_persons: boolean | null
  escalate_to_level: string | null
  first_signer_id: string | null
  first_signer_name: string | null
  decided_by_name: string | null
  second_approver_user_id: string | null
  decided_by_user_id: string | null
}

/**
 * Approvals for the four government levels. The decisions themselves (approve, reject and what follows
 * a decision: next step, account activation) are done by the existing ApprovalService; this class adds
 * the area check, the two-person rule, "ask for more information" and manual escalation.
 */
@Injectable()
export class GovApprovalsService {
  private readonly logger = new Logger(GovApprovalsService.name)
  private readonly demoMode: boolean

  constructor(
    config: ConfigService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalService,
    private readonly scopes: GovScopeService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true'
  }

  /** WHERE fragment (alias ar) selecting requests assigned to this admin's level and area. */
  private areaSql(scope: GovScope, startAt = 1): { sql: string; params: unknown[] } {
    const lv = `ar.assigned_level = '${scope.level}'::admin.admin_level`
    if (scope.level === 'district') return { sql: `${lv} AND ar.assigned_district_id = $${startAt}::uuid`, params: [scope.districtId] }
    if (scope.level === 'state') return { sql: `${lv} AND ar.assigned_state_id = $${startAt}::smallint`, params: [scope.stateId] }
    if (scope.level === 'zonal') return { sql: `${lv} AND ar.assigned_zone_id = $${startAt}::smallint`, params: [scope.zoneId] }
    return { sql: lv, params: [] }
  }

  private baseSelect(): string {
    return `SELECT ar.id, ar.subject_type::text AS subject_type, ar.step, ar.status::text AS status, ar.priority,
                   ar.submitted_at, ar.due_at, ar.decided_at, ar.reason, ar.reminders_sent, ar.more_info_note, ar.more_info_requested_at,
                   ar.check_results, ar.second_approver_user_id, ar.decided_by_user_id,
                   p.full_name AS applicant_name, au.account_type::text AS applicant_account_type,
                   rule.needs_two_persons, rule.escalate_to_level::text AS escalate_to_level,
                   ar.second_approver_user_id AS first_signer_id, fp.full_name AS first_signer_name,
                   dp.full_name AS decided_by_name
              FROM admin.approval_request ar
              LEFT JOIN identity.app_user au ON au.id = ar.subject_user_id
              LEFT JOIN identity.person p ON p.id = au.person_id
              LEFT JOIN admin.approval_rule rule ON rule.subject_type = ar.subject_type AND rule.step = ar.step
              LEFT JOIN identity.app_user fu ON fu.id = ar.second_approver_user_id
              LEFT JOIN identity.person fp ON fp.id = fu.person_id
              LEFT JOIN identity.app_user du ON du.id = ar.decided_by_user_id
              LEFT JOIN identity.person dp ON dp.id = du.person_id`
  }

  private toItem(r: Row): GovApprovalItem {
    const cr = r.check_results ?? {}
    const checks = Array.isArray(cr.checks) ? cr.checks.map((c: any) => ({ ok: !!c.ok, text: String(c.text ?? '') })) : []
    const open = ['pending', 'escalated', 'more_info'].includes(r.status)
    const now = Date.now()
    const decision: GovApprovalDecision = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'waiting'
    return {
      id: r.id,
      subjectType: r.subject_type,
      step: r.step,
      status: r.status,
      decision,
      priority: r.priority === 'urgent' ? 'urgent' : 'normal',
      name: r.applicant_name ?? (r.subject_type === 'special_category' ? 'Special-category request (details hidden)' : cr.org ? String(cr.org) : 'Unnamed applicant'),
      role: cr.role ? String(cr.role) : r.applicant_account_type,
      org: cr.org ?? null,
      ref: cr.ref ?? null,
      summary: cr.summary ?? null,
      flagged: !!cr.flag,
      checks,
      submittedAt: iso(r.submitted_at)!,
      dueAt: iso(r.due_at)!,
      decidedAt: iso(r.decided_at),
      ageDays: Math.max(0, Math.floor((now - new Date(r.submitted_at).getTime()) / 86400000)),
      overdue: open && new Date(r.due_at).getTime() < now,
      reminders: r.reminders_sent,
      moreInfo: r.more_info_requested_at ? { requestedAt: iso(r.more_info_requested_at)!, note: r.more_info_note } : null,
      reason: r.reason,
      twoPerson: r.needs_two_persons
        ? {
            required: true,
            firstSigner: r.first_signer_name,
            state: r.status === 'approved' ? 'complete' : r.first_signer_id ? 'waiting_second_signature' : 'waiting_first_signature',
          }
        : { required: false, firstSigner: null, state: 'not_required' },
      canEscalate: open && !!r.escalate_to_level,
      decidedBy: r.decided_by_name,
    }
  }

  async list(scope: GovScope, filter: 'all' | 'waiting' | 'decided', limit = 100): Promise<GovApprovals> {
    const area = this.areaSql(scope)
    const rows = await this.db.query<Row>(
      `${this.baseSelect()}
        WHERE ${area.sql} AND ar.escalated_to_id IS NULL
          AND ($${area.params.length + 1}::text = 'all'
               OR ($${area.params.length + 1}::text = 'waiting' AND ar.status IN ('pending','escalated','more_info'))
               OR ($${area.params.length + 1}::text = 'decided' AND ar.status IN ('approved','rejected')))
        ORDER BY (ar.status IN ('pending','escalated','more_info')) DESC, (ar.priority = 'urgent') DESC, ar.due_at ASC
        LIMIT ${Math.min(limit, 500)}`,
      [...area.params, filter],
    )
    const items = rows.map((r) => this.toItem(r))

    const st = await this.db.query<any>(
      `SELECT count(*) FILTER (WHERE ar.status IN ('pending','escalated','more_info') AND ar.escalated_to_id IS NULL)::int AS waiting,
              min(ar.submitted_at) FILTER (WHERE ar.status IN ('pending','escalated','more_info') AND ar.escalated_to_id IS NULL) AS oldest,
              count(*) FILTER (WHERE ar.status = 'approved' AND ar.decided_at >= date_trunc('month', now()))::int AS approved_month,
              count(*) FILTER (WHERE ar.status = 'rejected' AND ar.decided_at >= date_trunc('month', now()))::int AS rejected_month,
              avg(extract(epoch FROM (ar.decided_at - ar.submitted_at)) / 86400)
                FILTER (WHERE ar.status IN ('approved','rejected') AND ar.decided_at >= now() - interval '90 days') AS avg_days,
              count(*) FILTER (WHERE ar.status IN ('approved','rejected') AND ar.decided_at >= now() - interval '90 days')::int AS decided_90,
              count(*) FILTER (WHERE ar.status IN ('approved','rejected') AND ar.decided_at >= now() - interval '90 days' AND ar.decided_at <= ar.due_at)::int AS in_sla,
              sum(ar.reminders_sent)::int AS reminders,
              count(*) FILTER (WHERE ar.status = 'escalated')::int AS escalated
         FROM admin.approval_request ar WHERE ${area.sql}`,
      area.params,
    )
    const s = st[0]!
    const topReason = await this.db.query<{ reason: string; n: string }>(
      `SELECT ar.reason, count(*)::text AS n FROM admin.approval_request ar
        WHERE ${area.sql} AND ar.status = 'rejected' AND ar.reason IS NOT NULL
        GROUP BY ar.reason ORDER BY count(*) DESC, ar.reason LIMIT 1`,
      area.params,
    )
    const prior = await this.db.query<{ avg_days: string | null }>(
      `SELECT avg(extract(epoch FROM (ar.decided_at - ar.submitted_at)) / 86400) AS avg_days FROM admin.approval_request ar
        WHERE ${area.sql} AND ar.status IN ('approved','rejected')
          AND ar.decided_at >= date_trunc('month', now()) - interval '1 month' AND ar.decided_at < date_trunc('month', now())`,
      area.params,
    )
    const avgDays = s.avg_days === null ? null : round1(numOr0(s.avg_days))
    const priorDays = prior[0]?.avg_days == null ? null : round1(numOr0(prior[0].avg_days))

    return {
      level: scope.level,
      filter,
      items,
      stats: {
        waiting: s.waiting,
        oldestWaitingDays: s.oldest ? Math.floor((Date.now() - new Date(s.oldest).getTime()) / 86400000) : null,
        approvedThisMonth: s.approved_month,
        rejectedThisMonth: s.rejected_month,
        mostCommonRejectionReason: topReason[0]?.reason ?? null,
        avgDecisionDays: avgDays,
        avgDecisionDaysVsLastMonth: avgDays !== null && priorDays !== null ? round1(priorDays - avgDays) : null,
        decidedWithinSlaPct: s.decided_90 > 0 ? Math.round((s.in_sla / s.decided_90) * 100) : null,
        escalatedUp: s.escalated,
        remindersSent: numOr0(s.reminders),
      },
      escalateTo: NEXT_LEVEL[scope.level],
    }
  }

  async inbox(scope: GovScope): Promise<GovApprovalInbox> {
    const waiting = (await this.list(scope, 'waiting', 200)).items
    const doctor = waiting.filter((i) => DOCTOR_TYPES.includes(i.subjectType))
    const flagged = waiting.filter((i) => FLAGGED_TYPES.includes(i.subjectType))
    const admin = waiting.filter((i) => !DOCTOR_TYPES.includes(i.subjectType) && !FLAGGED_TYPES.includes(i.subjectType))

    const area = this.areaSql(scope)
    const f = await this.db.query<any>(
      `SELECT count(*)::int AS submitted,
              count(*) FILTER (WHERE jsonb_array_length(coalesce(ar.check_results->'checks','[]'::jsonb)) > 0
                                 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(ar.check_results->'checks','[]'::jsonb)) c WHERE (c->>'ok')::boolean = false))::int AS verified,
              count(*) FILTER (WHERE ar.status IN ('approved','rejected'))::int AS reviewed,
              count(*) FILTER (WHERE ar.status = 'approved')::int AS approved
         FROM admin.approval_request ar WHERE ${area.sql} AND ar.submitted_at >= now() - interval '90 days'`,
      area.params,
    )
    const months = await this.db.query<any>(
      `SELECT to_char(m, 'Mon') AS label, m::date::text AS month,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (ar.decided_at - ar.submitted_at)) / 86400)
                 FROM admin.approval_request ar
                WHERE ${area.sql} AND ar.status IN ('approved','rejected')
                  AND date_trunc('month', ar.decided_at) = m) AS median_days
         FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
        ORDER BY m`,
      area.params,
    )
    const fr = f[0]!
    return {
      level: scope.level,
      total: waiting.length,
      doctorApplications: doctor,
      adminApplications: admin,
      flaggedUsers: flagged,
      funnel90d: [
        { label: 'Submitted', count: fr.submitted },
        { label: 'Documents verified', count: fr.verified },
        { label: 'Reviewed', count: fr.reviewed },
        { label: 'Approved', count: fr.approved },
      ],
      daysToDecision: months.map((m) => ({ month: m.month, label: m.label, medianDays: m.median_days === null ? null : round1(numOr0(m.median_days)) })),
    }
  }

  // ---------------------------------------------------------------- decisions

  private async loadInScope(scope: GovScope, id: string): Promise<Row> {
    const area = this.areaSql(scope, 2)
    const rows = await this.db.query<Row>(`${this.baseSelect()} WHERE ar.id = $1::uuid AND ${area.sql}`, [id, ...area.params])
    const row = rows[0]
    if (!row) {
      const exists = await this.db.query('SELECT 1 FROM admin.approval_request WHERE id = $1::uuid', [id])
      if (!exists.length) throw new NotFoundException({ success: false, errorMessage: 'Approval request not found.' })
      throw new ForbiddenException({ success: false, errorMessage: 'This request is not assigned to your level and area.' })
    }
    return row
  }

  private assertOpen(row: Row, allow: string[] = ['pending', 'escalated', 'more_info']): void {
    if (!allow.includes(row.status)) {
      throw new ConflictException({ success: false, errorMessage: 'This request has already been decided or escalated.' })
    }
  }

  async approve(
    scope: GovScope,
    actor: AuthenticatedUser,
    id: string,
    input: { reason?: string; asPeer?: boolean },
  ): Promise<{ success: true; nextStep: boolean; accountActivated: boolean; twoPerson: { state: string; firstSigner: string | null } | null; simulatedSecondSigner?: boolean }> {
    const row = await this.loadInScope(scope, id)
    this.assertOpen(row)

    let signerId = scope.userId
    let simulated = false

    if (row.needs_two_persons) {
      if (!row.first_signer_id) {
        // First signature: keep the request open and remember who signed.
        if (row.status === 'more_info') await this.resumeToPending(id)
        await this.db.query('UPDATE admin.approval_request SET second_approver_user_id = $2::uuid, reason = coalesce($3, reason) WHERE id = $1::uuid', [
          id,
          scope.userId,
          input.reason ?? null,
        ])
        await this.audit.logAction(actor, 'approval.first_signature', {
          entityType: 'approval_request',
          entityId: id,
          details: { subjectType: row.subject_type, actor: actor.username, mock: true },
        })
        return { success: true, nextStep: false, accountActivated: false, twoPerson: { state: 'waiting_second_signature', firstSigner: scope.personName } }
      }
      if (row.first_signer_id === scope.userId) {
        // Same person again. Only the demo may stand in a second admin of the same level and area.
        if (!(input.asPeer && this.demoMode && actor.isDemo)) {
          throw new ConflictException({
            success: false,
            errorMessage: 'A different admin must give the second signature. You gave the first one.',
          })
        }
        const peer = (await this.scopes.peers(scope))[0]
        if (!peer) throw new ConflictException({ success: false, errorMessage: 'No other admin of your level and area exists to act as second signer.' })
        signerId = peer.userId
        simulated = true
      }
    }

    if (row.status === 'more_info') await this.resumeToPending(id)
    const result = await this.approvals.approve(id, signerId, input.reason, actor)
    if (FLAGGED_TYPES.includes(row.subject_type)) {
      await this.db.query("UPDATE admin.account_flag SET status = 'closed' WHERE approval_request_id = $1::uuid AND status <> 'closed'", [id])
    }
    if (simulated) {
      await this.audit.logAction(actor, 'approval.second_signature_simulated', {
        entityType: 'approval_request',
        entityId: id,
        details: { signer: signerId, note: 'Demo mode: a peer admin of the same level and area stands in as second signer.', mock: true },
      })
    }
    return {
      success: true,
      nextStep: result.nextStep ?? false,
      accountActivated: result.accountActivated ?? false,
      twoPerson: row.needs_two_persons ? { state: 'complete', firstSigner: row.first_signer_name } : null,
      ...(simulated ? { simulatedSecondSigner: true } : {}),
    }
  }

  async reject(scope: GovScope, actor: AuthenticatedUser, id: string, reason: string): Promise<{ success: true }> {
    const row = await this.loadInScope(scope, id)
    this.assertOpen(row)
    if (row.status === 'more_info') await this.resumeToPending(id)
    // The database forbids the first and the deciding signer being the same person. Rejecting after giving the
    // first signature means changing your mind, so the first signature is withdrawn (and logged) before the decision.
    if (row.first_signer_id && row.first_signer_id === scope.userId) {
      await this.db.query('UPDATE admin.approval_request SET second_approver_user_id = NULL WHERE id = $1::uuid', [id])
      await this.audit.logAction(actor, 'approval.first_signature_withdrawn', {
        entityType: 'approval_request',
        entityId: id,
        details: { subjectType: row.subject_type, actor: actor.username, mock: true },
      })
    }
    await this.approvals.reject(id, scope.userId, reason, actor)
    return { success: true }
  }

  async moreInfo(scope: GovScope, actor: AuthenticatedUser, id: string, note: string): Promise<{ success: true; status: string }> {
    const row = await this.loadInScope(scope, id)
    this.assertOpen(row, ['pending', 'escalated'])
    await this.db.query(
      `UPDATE admin.approval_request
          SET status = 'more_info'::admin.approval_status, more_info_requested_at = now(), more_info_note = $2
        WHERE id = $1::uuid`,
      [id, note],
    )
    await this.audit.logAction(actor, 'approval.more_info', {
      entityType: 'approval_request',
      entityId: id,
      details: { subjectType: row.subject_type, note, actor: actor.username, mock: true },
    })
    return { success: true, status: 'more_info' }
  }

  /** Moves the request to the next level up (same step) with a fresh time limit. */
  async escalate(scope: GovScope, actor: AuthenticatedUser, id: string, reason?: string): Promise<{ success: true; escalatedToLevel: string; newRequestId: string }> {
    const row = await this.loadInScope(scope, id)
    this.assertOpen(row)
    if (!row.escalate_to_level) {
      throw new ConflictException({ success: false, errorMessage: 'This kind of request cannot be escalated any higher.' })
    }
    const client = await this.db.getClient()
    let newId: string
    try {
      await client.query('BEGIN')
      const locked = await client.query<any>(
        `SELECT ar.*, rule.time_limit::text AS time_limit
           FROM admin.approval_request ar
           JOIN admin.approval_rule rule ON rule.subject_type = ar.subject_type AND rule.step = ar.step
          WHERE ar.id = $1::uuid AND ar.status IN ('pending','more_info','escalated') AND ar.escalated_to_id IS NULL
          FOR UPDATE OF ar`,
        [id],
      )
      if (!locked.rowCount) throw new ConflictException({ success: false, errorMessage: 'This request has already been decided or escalated.' })
      const req = locked.rows[0]
      const area = await this.areaForLevel(client, row.escalate_to_level as GovLevel, req)
      const ins = await client.query<{ id: string }>(
        `INSERT INTO admin.approval_request
           (subject_type, subject_user_id, subject_person_id, subject_hospital_id, subject_pharmacy_id,
            step, assigned_level, assigned_zone_id, assigned_state_id, assigned_district_id,
            status, due_at, check_results, priority)
         VALUES ($1::admin.approval_subject, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::smallint, $7::admin.admin_level,
                 $8::smallint, $9::smallint, $10::uuid, 'pending'::admin.approval_status, now() + $11::interval, $12::jsonb, $13)
         RETURNING id`,
        [
          req.subject_type, req.subject_user_id, req.subject_person_id, req.subject_hospital_id, req.subject_pharmacy_id,
          req.step, row.escalate_to_level, area.zoneId, area.stateId, area.districtId, req.time_limit,
          JSON.stringify(req.check_results ?? {}), req.priority,
        ],
      )
      newId = ins.rows[0]!.id
      await client.query(
        `UPDATE admin.approval_request SET status = 'escalated'::admin.approval_status, escalated_at = now(), escalated_to_id = $2::uuid, reason = coalesce($3, reason)
          WHERE id = $1::uuid`,
        [id, newId, reason ?? null],
      )
      await client.query('COMMIT')
    } catch (err) {
      try {
        await client.query('ROLLBACK')
      } catch (e) {
        this.logger.warn(`Rollback failed: ${e}`)
      }
      throw err
    } finally {
      client.release()
    }
    await this.audit.logAction(actor, 'approval.escalated', {
      entityType: 'approval_request',
      entityId: id,
      details: { subjectType: row.subject_type, toLevel: row.escalate_to_level, newRequestId: newId, reason: reason ?? null, actor: actor.username, mock: true },
    })
    return { success: true, escalatedToLevel: row.escalate_to_level, newRequestId: newId }
  }

  private async resumeToPending(id: string): Promise<void> {
    await this.db.query("UPDATE admin.approval_request SET status = 'pending'::admin.approval_status WHERE id = $1::uuid AND status = 'more_info'", [id])
  }

  private async areaForLevel(client: PoolClient, level: GovLevel, from: any): Promise<{ zoneId: number | null; stateId: number | null; districtId: string | null }> {
    if (level === 'central') return { zoneId: null, stateId: null, districtId: null }
    if (level === 'district') return { zoneId: null, stateId: null, districtId: from.assigned_district_id }
    let stateId: number | null = from.assigned_state_id
    if (stateId === null && from.assigned_district_id) {
      stateId = (await client.query('SELECT state_id FROM geo.district WHERE id = $1::uuid', [from.assigned_district_id])).rows[0]?.state_id ?? null
    }
    if (level === 'state') return { zoneId: null, stateId, districtId: null }
    let zoneId: number | null = from.assigned_zone_id
    if (zoneId === null && stateId !== null) {
      zoneId = (await client.query('SELECT zone_id FROM geo.state WHERE id = $1::smallint', [stateId])).rows[0]?.zone_id ?? null
    }
    return { zoneId, stateId: null, districtId: null }
  }
}
