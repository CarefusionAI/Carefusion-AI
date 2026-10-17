import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { ApproveRejectResponse } from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedUser } from '../auth/types'

export type AdminLevel = 'district' | 'state' | 'zonal' | 'central'

/** Raw inbox row (snake_case, as it comes from the database). */
export interface InboxRow {
  id: string
  subject_type: string
  step: number
  status: string
  submitted_at: Date
  due_at: Date
  check_results: Record<string, unknown>
  subject_user_id: string | null
  applicant_name: string | null
  applicant_account_type: string | null
}

interface RequestRow {
  id: string
  subject_type: string
  subject_user_id: string | null
  subject_person_id: string | null
  subject_hospital_id: string | null
  subject_pharmacy_id: string | null
  step: number
  assigned_level: AdminLevel
  assigned_zone_id: number | null
  assigned_state_id: number | null
  assigned_district_id: string | null
  status: string
  escalated_to_id: string | null
  check_results: Record<string, unknown>
}

interface Area {
  zoneId: number | null
  stateId: number | null
  districtId: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** System actor used for audit entries written by the overdue-escalation job. */
const SYSTEM_ESCALATION_USER: AuthenticatedUser = {
  id: 'system-escalation',
  username: 'system-escalation',
  role: 'CENTRAL_ADMIN',
  isDemo: true,
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pending approvals for this admin level.
   * Demo simplification: returns ALL open requests of the level (area matching via
   * admin.admin_post comes later), so `areaId` is accepted but not used yet.
   * Escalated originals that were already handed on (escalated_to_id set) are hidden,
   * because the live copy sits in the next level's inbox.
   */
  async getInbox(_user: AuthenticatedUser, adminLevel: AdminLevel, _areaId?: string): Promise<InboxRow[]> {
    return this.db.query<InboxRow>(
      `SELECT ar.id, ar.subject_type, ar.step, ar.status, ar.submitted_at, ar.due_at,
              ar.check_results, ar.subject_user_id,
              p.full_name AS applicant_name,
              au.account_type AS applicant_account_type
         FROM admin.approval_request ar
         LEFT JOIN identity.app_user au ON au.id = ar.subject_user_id
         LEFT JOIN identity.person p ON p.id = au.person_id
        WHERE ar.status IN ('pending'::admin.approval_status, 'escalated'::admin.approval_status)
          AND ar.escalated_to_id IS NULL
          AND ar.assigned_level = $1::admin.admin_level
        ORDER BY ar.due_at ASC`,
      [adminLevel],
    )
  }

  async approve(
    requestId: string,
    decidedByUserId: string,
    reason: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<ApproveRejectResponse> {
    const client = await this.db.getClient()
    let nextStep = false
    let accountActivated = false
    let subjectType = ''
    let subjectUserId: string | null = null
    try {
      await client.query('BEGIN')
      const req = await this.lockOpenRequest(client, requestId)
      subjectType = req.subject_type
      subjectUserId = req.subject_user_id
      const decider = await this.resolveDecider(client, decidedByUserId)

      await client.query(
        `UPDATE admin.approval_request
            SET status = 'approved'::admin.approval_status,
                decided_by_user_id = $2::uuid,
                decided_at = now(),
                reason = $3
          WHERE id = $1::uuid`,
        [requestId, decider, reason ?? null],
      )

      const rule = await client.query<{ approver_level: AdminLevel; time_limit: string }>(
        `SELECT approver_level, time_limit::text AS time_limit
           FROM admin.approval_rule
          WHERE subject_type = $1::admin.approval_subject AND step = $2::smallint`,
        [req.subject_type, req.step + 1],
      )

      if (rule.rowCount) {
        nextStep = true
        const next = rule.rows[0]!
        const area = await this.resolveArea(client, next.approver_level, req)
        await this.insertRequest(client, req, req.step + 1, next.approver_level, area, next.time_limit)
      } else if (req.subject_user_id) {
        accountActivated = true
        await client.query(
          `UPDATE identity.app_user
              SET status = 'active'::identity.account_status, activated_at = now()
            WHERE id = $1::uuid`,
          [req.subject_user_id],
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw err
    } finally {
      client.release()
    }

    await this.audit.logAction(actor, 'approval.approved', {
      entityType: 'approval_request',
      entityId: requestId,
      details: { subjectType, subjectUserId, nextStep, accountActivated, actor: actor.username, mock: true },
    })

    return { success: true, nextStep, accountActivated }
  }

  async reject(
    requestId: string,
    decidedByUserId: string,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<ApproveRejectResponse> {
    const client = await this.db.getClient()
    let subjectType = ''
    let subjectUserId: string | null = null
    try {
      await client.query('BEGIN')
      const req = await this.lockOpenRequest(client, requestId)
      subjectType = req.subject_type
      subjectUserId = req.subject_user_id
      const decider = await this.resolveDecider(client, decidedByUserId)

      await client.query(
        `UPDATE admin.approval_request
            SET status = 'rejected'::admin.approval_status,
                decided_by_user_id = $2::uuid,
                decided_at = now(),
                reason = $3
          WHERE id = $1::uuid`,
        [requestId, decider, reason],
      )

      if (req.subject_user_id) {
        await client.query(
          `UPDATE identity.app_user
              SET status = 'rejected'::identity.account_status, status_reason = $2
            WHERE id = $1::uuid`,
          [req.subject_user_id, reason],
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await this.safeRollback(client)
      throw err
    } finally {
      client.release()
    }

    await this.audit.logAction(actor, 'approval.rejected', {
      entityType: 'approval_request',
      entityId: requestId,
      details: { subjectType, subjectUserId, actor: actor.username, mock: true },
    })

    return { success: true }
  }

  /** Escalates every overdue pending request to the next level. Returns how many were escalated. */
  async escalateOverdue(): Promise<number> {
    const overdue = await this.db.query<{ id: string }>(
      `SELECT ar.id
         FROM admin.approval_request ar
         JOIN admin.approval_rule rule
           ON rule.subject_type = ar.subject_type AND rule.step = ar.step
        WHERE ar.status = 'pending'::admin.approval_status
          AND ar.due_at < now()
          AND rule.escalate_to_level IS NOT NULL
        ORDER BY ar.due_at ASC`,
    )

    let count = 0
    for (const { id } of overdue) {
      const client = await this.db.getClient()
      let escalatedLevel: AdminLevel | null = null
      let newId: string | null = null
      let subjectType = ''
      try {
        await client.query('BEGIN')
        // Re-check under lock: another worker or a decision may have got there first.
        const locked = await client.query<RequestRow & { escalate_to_level: AdminLevel; time_limit: string }>(
          `SELECT ar.*, rule.escalate_to_level, rule.time_limit::text AS time_limit
             FROM admin.approval_request ar
             JOIN admin.approval_rule rule
               ON rule.subject_type = ar.subject_type AND rule.step = ar.step
            WHERE ar.id = $1::uuid
              AND ar.status = 'pending'::admin.approval_status
              AND ar.due_at < now()
              AND rule.escalate_to_level IS NOT NULL
            FOR UPDATE OF ar SKIP LOCKED`,
          [id],
        )
        if (!locked.rowCount) {
          await client.query('ROLLBACK')
          continue
        }
        const req = locked.rows[0]!
        escalatedLevel = req.escalate_to_level
        subjectType = req.subject_type

        const area = await this.resolveArea(client, req.escalate_to_level, req)
        newId = await this.insertRequest(client, req, req.step, req.escalate_to_level, area, req.time_limit)

        await client.query(
          `UPDATE admin.approval_request
              SET status = 'escalated'::admin.approval_status,
                  escalated_at = now(),
                  escalated_to_id = $2::uuid
            WHERE id = $1::uuid`,
          [id, newId],
        )
        await client.query('COMMIT')
        count++
      } catch (err) {
        await this.safeRollback(client)
        this.logger.error(`Escalation failed for request ${id}: ${err instanceof Error ? err.message : String(err)}`)
        continue
      } finally {
        client.release()
      }

      await this.audit.logAction(SYSTEM_ESCALATION_USER, 'approval.escalated', {
        entityType: 'approval_request',
        entityId: id,
        details: { subjectType, escalatedToId: newId, escalatedToLevel: escalatedLevel },
      })
    }
    return count
  }

  // ---------- helpers ----------

  /** Locks the request row and checks it can still be decided. */
  private async lockOpenRequest(client: PoolClient, requestId: string): Promise<RequestRow> {
    const r = await client.query<RequestRow>(
      'SELECT * FROM admin.approval_request WHERE id = $1::uuid FOR UPDATE',
      [requestId],
    )
    if (!r.rowCount) {
      throw new NotFoundException({ success: false, errorMessage: 'Approval request not found.' })
    }
    const req = r.rows[0]!
    const open = req.status === 'pending' || req.status === 'escalated'
    // An escalated original has been handed on; only its live copy can be decided.
    if (!open || req.escalated_to_id) {
      throw new ConflictException({
        success: false,
        errorMessage: 'This request has already been decided or escalated.',
      })
    }
    return req
  }

  /**
   * decided_by_user_id has a foreign key to identity.app_user. Demo admins logged in with
   * the demo login (ids like "demo-district-admin") have no app_user row, so store NULL
   * for them. The acting username is kept in the audit log instead.
   */
  private async resolveDecider(client: PoolClient, userId: string): Promise<string | null> {
    if (!UUID_RE.test(userId)) return null
    const r = await client.query('SELECT 1 FROM identity.app_user WHERE id = $1::uuid', [userId])
    return r.rowCount ? userId : null
  }

  /** Works out the area columns for a request that moves to `level`. */
  private async resolveArea(client: PoolClient, level: AdminLevel, from: RequestRow): Promise<Area> {
    if (level === 'central') return { zoneId: null, stateId: null, districtId: null }
    if (level === 'district') {
      return { zoneId: null, stateId: null, districtId: from.assigned_district_id }
    }

    let stateId = from.assigned_state_id
    if (stateId === null && from.assigned_district_id) {
      const d = await client.query<{ state_id: number }>(
        'SELECT state_id FROM geo.district WHERE id = $1::uuid',
        [from.assigned_district_id],
      )
      stateId = d.rows[0]?.state_id ?? null
    }
    if (level === 'state') return { zoneId: null, stateId, districtId: null }

    // zonal
    let zoneId = from.assigned_zone_id
    if (zoneId === null && stateId !== null) {
      const s = await client.query<{ zone_id: number }>(
        'SELECT zone_id FROM geo.state WHERE id = $1::smallint',
        [stateId],
      )
      zoneId = s.rows[0]?.zone_id ?? null
    }
    return { zoneId, stateId: null, districtId: null }
  }

  /** Creates a new pending request copied from `from`; returns its id. */
  private async insertRequest(
    client: PoolClient,
    from: RequestRow,
    step: number,
    level: AdminLevel,
    area: Area,
    timeLimit: string,
  ): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO admin.approval_request
         (subject_type, subject_user_id, subject_person_id, subject_hospital_id, subject_pharmacy_id,
          step, assigned_level, assigned_zone_id, assigned_state_id, assigned_district_id,
          status, due_at, check_results)
       VALUES ($1::admin.approval_subject, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
               $6::smallint, $7::admin.admin_level, $8::smallint, $9::smallint, $10::uuid,
               'pending'::admin.approval_status, now() + $11::interval, $12::jsonb)
       RETURNING id`,
      [
        from.subject_type,
        from.subject_user_id,
        from.subject_person_id,
        from.subject_hospital_id,
        from.subject_pharmacy_id,
        step,
        level,
        area.zoneId,
        area.stateId,
        area.districtId,
        timeLimit,
        JSON.stringify(from.check_results ?? {}),
      ],
    )
    return r.rows[0]!.id
  }

  private async safeRollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK')
    } catch (e) {
      this.logger.warn(`Rollback failed: ${e}`)
    }
  }
}
