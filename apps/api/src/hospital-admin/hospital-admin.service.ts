import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CreateAccountResponse } from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { ApprovalService } from '../approval/approval.service'
import { AdminOpsService } from '../admin-ops/admin-ops.service'
import type { AuthenticatedUser } from '../auth/types'
import {
  HospitalContext,
  ROLE_LABELS,
  auditScoped,
  demoNow,
  resolveHospitalContext,
  withHospitalTx,
} from './hospital-context'
import { HospitalOversightService } from './hospital-oversight.service'
import { REJECT_REASON_CODES, ROLE_KEYS } from './hospital-admin.schemas'

const REJECT_LABELS: Record<(typeof REJECT_REASON_CODES)[number], string> = {
  registration_unverified: 'Registration could not be verified',
  registration_expired: 'Registration expired',
  document_unreadable: 'Document unreadable or incomplete',
  not_employed_here: 'Not employed at this hospital',
  other: 'Other',
}

const PERMISSION_ORDER = [
  'open_record_key',
  'break_glass',
  'view_admission',
  'upload_results',
  'attach_images',
  'dispense_rx',
  'book_op',
  'record_vitals',
  'use_ai_assistant',
]

interface ApprovalDoc {
  title: string
  meta: string
  checked: boolean
  expired: boolean
}

interface ApprovalRow {
  id: string
  status: string
  priority: string
  submitted_at: Date
  due_at: Date
  decided_at: Date | null
  reason: string | null
  check_results: Record<string, any>
  subject_user_id: string | null
  applicant_name: string | null
}

/** "today" in India for a given instant, as a SQL expression on parameter `p`. */
const istDate = (p: string) => `(${p}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`

@Injectable()
export class HospitalAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly approvals: ApprovalService,
    private readonly adminOps: AdminOpsService,
    private readonly oversight: HospitalOversightService,
  ) {}

  context(user: AuthenticatedUser): Promise<HospitalContext> {
    return resolveHospitalContext(this.db, user)
  }

  // ------------------------------------------------------------------ overview

  async overview(user: AuthenticatedUser) {
    const ctx = await this.context(user)
    const now = demoNow(this.config).toISOString()
    const h = ctx.hospitalId

    const [hospital, op, depts, sessions, pending, peek, onDuty, breakGlass, activity, complaints, rating] =
      await Promise.all([
        this.db.query<{ name: string; hfr_id: string; ownership: string; hospital_type: string; status: string; approved_at: Date | null; district: string }>(
          `SELECT h.name, h.hfr_id, h.ownership::text AS ownership, h.hospital_type::text AS hospital_type,
                  h.status::text AS status, h.approved_at, d.name AS district
             FROM org.hospital h JOIN geo.district d ON d.id = h.district_id WHERE h.id = $1::uuid`,
          [h],
        ),
        this.db.query<{ today: number; last_week: number }>(
          `SELECT count(*) FILTER (WHERE visit_date = ${istDate('$2')})::int AS today,
                  count(*) FILTER (WHERE visit_date = ${istDate('$2')} - 7)::int AS last_week
             FROM engage.op_visit WHERE hospital_id = $1::uuid AND status::text <> 'cancelled'`,
          [h, now],
        ),
        this.db.query<{ department: string | null; total: number; occupied: number; free: number; pct_full: number | null }>(
          `SELECT department, total, occupied, free, pct_full
             FROM org.v_department_beds WHERE hospital_id = $1::uuid
            ORDER BY pct_full DESC NULLS LAST, department`,
          [h],
        ),
        this.db.query<{ n: number }>(
          `SELECT count(*)::int AS n
             FROM access.access_session s JOIN identity.doctor_profile dp ON dp.user_id = s.user_id
            WHERE dp.hospital_id = $1::uuid AND s.started_at <= $2::timestamptz
              AND (s.ended_at IS NULL OR s.ended_at > $2::timestamptz) AND s.expires_at > $2::timestamptz`,
          [h, now],
        ),
        this.db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM admin.approval_request
            WHERE assigned_hospital_id = $1::uuid AND subject_type = 'hospital_staff'::admin.approval_subject
              AND status = 'pending'::admin.approval_status AND escalated_to_id IS NULL`,
          [h],
        ),
        this.approvalRows(h, 'pending', 3),
        this.db.query<{ role: string; n: number }>(
          `WITH on_duty AS (
             SELECT user_id FROM org.staff_shift
              WHERE hospital_id = $1::uuid AND shift_start <= $2::timestamptz AND shift_end > $2::timestamptz
             UNION
             SELECT doctor_user_id FROM org.doctor_roster
              WHERE hospital_id = $1::uuid AND duty_date = ${istDate('$2')} AND shift <> 'off')
           SELECT CASE WHEN au.account_type::text = 'staff' THEN coalesce(sp.staff_role::text, 'staff')
                       WHEN au.account_type::text = 'hospital_admin' THEN 'admin'
                       ELSE au.account_type::text END AS role, count(*)::int AS n
             FROM on_duty o JOIN identity.app_user au ON au.id = o.user_id
             LEFT JOIN identity.staff_profile sp ON sp.user_id = au.id
            GROUP BY 1`,
          [h, now],
        ),
        this.oversight.breakGlassCounts(ctx, now),
        this.oversight.recentActivity(ctx, 5),
        this.oversight.complaintsPeek(ctx, 3),
        this.oversight.ratingSummary(h, now),
      ])

    const beds = depts.reduce((a, d) => ({ total: a.total + d.total, occupied: a.occupied + d.occupied }), {
      total: 0,
      occupied: 0,
    })
    const icu = depts.find((d) => (d.department ?? '').toLowerCase() === 'icu')
    const duty: Record<string, number> = {}
    for (const r of onDuty) duty[r.role] = r.n
    const opRow = op[0]!

    return {
      hospital: {
        id: h,
        name: hospital[0]?.name ?? ctx.hospitalName,
        hfrId: hospital[0]?.hfr_id,
        ownership: hospital[0]?.ownership,
        hospitalType: hospital[0]?.hospital_type,
        district: hospital[0]?.district,
        verifiedAt: hospital[0]?.approved_at?.toISOString() ?? null,
      },
      admin: { userId: ctx.userId, name: ctx.adminName },
      asOf: now,
      kpis: {
        opVisitsToday: opRow.today,
        opVisitsSameDayLastWeek: opRow.last_week,
        opTrendPct: opRow.last_week > 0 ? Math.round(((opRow.today - opRow.last_week) / opRow.last_week) * 100) : null,
        bedsTotal: beds.total,
        bedsOccupied: beds.occupied,
        bedOccupancyPct: beds.total > 0 ? Math.round((100 * beds.occupied) / beds.total) : null,
        icuBedsTotal: icu?.total ?? 0,
        icuBedsOccupied: icu?.occupied ?? 0,
        activeDoctorSessions: sessions[0]?.n ?? 0,
        pendingApprovals: pending[0]?.n ?? 0,
      },
      occupancyByDepartment: depts.map((d) => ({
        department: d.department ?? 'Unassigned wards',
        total: d.total,
        occupied: d.occupied,
        free: d.free,
        pctFull: d.pct_full ?? 0,
      })),
      breakGlass: breakGlass,
      approvalQueue: peek.map((r) => this.toApprovalItem(r)),
      staffOnDuty: {
        doctors: duty['doctor'] ?? 0,
        nurses: duty['nurse'] ?? 0,
        lab: duty['lab'] ?? 0,
        radiology: duty['radiology'] ?? 0,
        pharmacy: duty['pharmacist'] ?? 0,
        admin: duty['admin'] ?? 0,
        total: Object.values(duty).reduce((a, b) => a + b, 0),
      },
      recentActivity: activity,
      complaints: complaints,
      rating,
    }
  }

  // ------------------------------------------------------------------ approvals (applicants)

  private approvalRows(hospitalId: string, filter: 'pending' | 'doctors' | 'decided' | 'all', limit = 200, id?: string) {
    const statusSql =
      filter === 'pending' || filter === 'doctors'
        ? `ar.status = 'pending'::admin.approval_status`
        : filter === 'decided'
          ? `ar.status IN ('approved'::admin.approval_status, 'rejected'::admin.approval_status)`
          : 'true'
    const roleSql = filter === 'doctors' ? `AND lower(ar.check_results ->> 'role') = 'doctor'` : ''
    return this.db.query<ApprovalRow>(
      `SELECT ar.id, ar.status::text AS status, ar.priority, ar.submitted_at, ar.due_at, ar.decided_at, ar.reason,
              ar.check_results, ar.subject_user_id, p.full_name AS applicant_name
         FROM admin.approval_request ar
         LEFT JOIN identity.app_user au ON au.id = ar.subject_user_id
         LEFT JOIN identity.person p ON p.id = au.person_id
        WHERE ar.assigned_hospital_id = $1::uuid
          AND ar.subject_type = 'hospital_staff'::admin.approval_subject
          AND ar.escalated_to_id IS NULL
          AND ${statusSql} ${roleSql}
          AND ($3::uuid IS NULL OR ar.id = $3::uuid)
        ORDER BY (ar.status = 'pending'::admin.approval_status) DESC, ar.submitted_at DESC
        LIMIT $2`,
      [hospitalId, limit, id ?? null],
    )
  }

  private toApprovalItem(r: ApprovalRow) {
    const cr = r.check_results ?? {}
    const docs: ApprovalDoc[] = Array.isArray(cr.documents) ? cr.documents : []
    const expired = docs.find((d) => d.expired)
    const unchecked = docs.filter((d) => !d.checked).length
    let blockReason: string | null = null
    if (expired) {
      blockReason = `Registration expired. ${expired.title} (${expired.meta}). Approving is blocked until a renewed certificate is uploaded.`
    } else if (unchecked > 0) {
      blockReason = `Mark every document as checked before approving (${unchecked} left).`
    }
    return {
      id: r.id,
      userId: r.subject_user_id,
      name: r.applicant_name ?? 'Applicant',
      role: (cr.role as string) ?? null,
      department: (cr.department as string) ?? null,
      employment: (cr.employment as string) ?? null,
      registry: (cr.registry as string) ?? null,
      ekyc: (cr.ekyc as string) ?? null,
      appliedAt: new Date(r.submitted_at).toISOString(),
      dueAt: new Date(r.due_at).toISOString(),
      status: r.status,
      priority: r.priority,
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      decisionReason: r.reason,
      documents: docs.map((d, index) => ({ index, title: d.title, meta: d.meta, checked: !!d.checked, expired: !!d.expired })),
      canApprove: r.status === 'pending' && blockReason === null,
      blockReason: r.status === 'pending' ? blockReason : null,
    }
  }

  async listApprovals(user: AuthenticatedUser, filter: 'pending' | 'doctors' | 'decided' | 'all') {
    const ctx = await this.context(user)
    const rows = await this.approvalRows(ctx.hospitalId, filter)
    const counts = await this.db.query<{ pending: number; doctors: number; decided: number; total: number }>(
      `SELECT count(*) FILTER (WHERE status = 'pending'::admin.approval_status)::int AS pending,
              count(*) FILTER (WHERE status = 'pending'::admin.approval_status AND lower(check_results ->> 'role') = 'doctor')::int AS doctors,
              count(*) FILTER (WHERE status IN ('approved'::admin.approval_status, 'rejected'::admin.approval_status))::int AS decided,
              count(*)::int AS total
         FROM admin.approval_request
        WHERE assigned_hospital_id = $1::uuid AND subject_type = 'hospital_staff'::admin.approval_subject AND escalated_to_id IS NULL`,
      [ctx.hospitalId],
    )
    return {
      counts: counts[0],
      rejectReasons: REJECT_REASON_CODES.map((code) => ({ code, label: REJECT_LABELS[code] })),
      items: rows.map((r) => this.toApprovalItem(r)),
    }
  }

  private async loadOwnApproval(ctx: HospitalContext, id: string): Promise<ApprovalRow> {
    const rows = await this.approvalRows(ctx.hospitalId, 'all', 1, id)
    const row = rows[0]
    if (!row) throw new NotFoundException({ success: false, errorMessage: 'Applicant not found in your hospital.' })
    return row
  }

  async getApproval(user: AuthenticatedUser, id: string) {
    const ctx = await this.context(user)
    return this.toApprovalItem(await this.loadOwnApproval(ctx, id))
  }

  async setDocumentChecked(user: AuthenticatedUser, id: string, index: number, checked: boolean) {
    const ctx = await this.context(user)
    const row = await this.loadOwnApproval(ctx, id)
    if (row.status !== 'pending') {
      throw new ConflictException({ success: false, errorMessage: 'This applicant has already been decided.' })
    }
    const docs = Array.isArray(row.check_results.documents) ? row.check_results.documents : []
    if (!Number.isInteger(index) || index < 0 || index >= docs.length) {
      throw new NotFoundException({ success: false, errorMessage: 'Document not found.' })
    }
    await this.db.query(
      `UPDATE admin.approval_request
          SET check_results = jsonb_set(check_results, ARRAY['documents', $2::text, 'checked'], to_jsonb($3::boolean))
        WHERE id = $1::uuid AND assigned_hospital_id = $4::uuid AND status = 'pending'::admin.approval_status`,
      [id, String(index), checked, ctx.hospitalId],
    )
    return this.toApprovalItem(await this.loadOwnApproval(ctx, id))
  }

  async approve(user: AuthenticatedUser, id: string, reason?: string) {
    const ctx = await this.context(user)
    const row = await this.loadOwnApproval(ctx, id)
    const item = this.toApprovalItem(row)
    if (row.status !== 'pending') {
      throw new ConflictException({ success: false, errorMessage: 'This applicant has already been decided.' })
    }
    if (!item.canApprove) {
      throw new ConflictException({ success: false, errorMessage: item.blockReason ?? 'This applicant cannot be approved yet.' })
    }
    // The existing approval service moves the request on and activates the account (hospital_staff has one step).
    const result = await this.approvals.approve(id, ctx.userId, reason, user)
    await withHospitalTx(this.db, ctx, (c) =>
      auditScoped(c, ctx, 'admin.approve', `Approved staff account · ${item.role ?? 'Staff'} · ${item.department ?? ''}`.trim(), {
        entityType: 'approval_request',
        entityId: id,
        details: { applicant: item.name },
      }),
    )
    return {
      success: true,
      accountActivated: result.accountActivated ?? false,
      message: `${item.name} can now sign in to the Staff Portal. They were told by SMS and email (mock).`,
    }
  }

  async reject(user: AuthenticatedUser, id: string, reasonCode: (typeof REJECT_REASON_CODES)[number], note?: string) {
    const ctx = await this.context(user)
    const row = await this.loadOwnApproval(ctx, id)
    if (row.status !== 'pending') {
      throw new ConflictException({ success: false, errorMessage: 'This applicant has already been decided.' })
    }
    if (reasonCode === 'other' && !note) {
      throw new BadRequestException({ success: false, errorMessage: 'Please write the reason.' })
    }
    const reason = note ? `${REJECT_LABELS[reasonCode]}: ${note}` : REJECT_LABELS[reasonCode]
    await this.approvals.reject(id, ctx.userId, reason, user)
    const item = this.toApprovalItem(row)
    await withHospitalTx(this.db, ctx, (c) =>
      auditScoped(c, ctx, 'admin.reject', `Rejected staff application · ${item.role ?? 'Staff'} · ${REJECT_LABELS[reasonCode]}`, {
        entityType: 'approval_request',
        entityId: id,
        details: { applicant: item.name },
      }),
    )
    return { success: true }
  }

  // ------------------------------------------------------------------ staff

  private static readonly PEOPLE_CTE = `
    people AS (
      SELECT au.id AS user_id, p.full_name, 'doctor'::text AS role_key, dep.name AS department, dp.hpr_id AS registration,
             au.status::text AS account_status, au.id AS uid
        FROM identity.doctor_profile dp
        JOIN identity.app_user au ON au.id = dp.user_id
        JOIN identity.person p ON p.id = au.person_id
        LEFT JOIN org.department dep ON dep.id = dp.department_id
       WHERE dp.hospital_id = $1::uuid AND au.status NOT IN ('pending'::identity.account_status, 'rejected'::identity.account_status)
      UNION ALL
      SELECT au.id, p.full_name, sp.staff_role::text, coalesce(dep.name, w.name), sp.registration_no, au.status::text, au.id
        FROM identity.staff_profile sp
        JOIN identity.app_user au ON au.id = sp.user_id
        JOIN identity.person p ON p.id = au.person_id
        LEFT JOIN org.department dep ON dep.id = sp.department_id
        LEFT JOIN org.ward w ON w.id = sp.ward_id
       WHERE sp.hospital_id = $1::uuid AND au.status NOT IN ('pending'::identity.account_status, 'rejected'::identity.account_status)
      UNION ALL
      SELECT au.id, p.full_name, 'pharmacist'::text, 'Pharmacy', pr.registration_no, au.status::text, au.id
        FROM identity.pharmacist_profile pr
        JOIN org.pharmacy ph ON ph.id = pr.pharmacy_id AND ph.linked_hospital_id = $1::uuid
        JOIN identity.app_user au ON au.id = pr.user_id
        JOIN identity.person p ON p.id = au.person_id
       WHERE au.status NOT IN ('pending'::identity.account_status, 'rejected'::identity.account_status)
    )`

  async listStaff(
    user: AuthenticatedUser,
    q: { role?: string; q?: string; limit: number; offset: number },
  ) {
    const ctx = await this.context(user)
    const now = demoNow(this.config).toISOString()
    const onDutyCte = `
      on_duty AS (
        SELECT user_id FROM org.staff_shift
         WHERE hospital_id = $1::uuid AND shift_start <= $2::timestamptz AND shift_end > $2::timestamptz
        UNION
        SELECT doctor_user_id FROM org.doctor_roster
         WHERE hospital_id = $1::uuid AND duty_date = ${istDate('$2')} AND shift <> 'off')`
    const [items, total, kpis, deptCount, invites] = await Promise.all([
      this.db.query<{
        user_id: string
        full_name: string
        role_key: string
        department: string | null
        registration: string | null
        account_status: string
        on_duty: boolean
      }>(
        `WITH ${HospitalAdminService.PEOPLE_CTE}, ${onDutyCte}
         SELECT pe.user_id, pe.full_name, pe.role_key, pe.department, pe.registration, pe.account_status,
                (od.user_id IS NOT NULL) AS on_duty
           FROM people pe LEFT JOIN on_duty od ON od.user_id = pe.user_id
          WHERE ($3::text IS NULL OR pe.role_key = $3::text)
            AND ($4::text IS NULL OR pe.full_name ILIKE '%' || $4::text || '%')
          ORDER BY pe.full_name
          LIMIT $5 OFFSET $6`,
        [ctx.hospitalId, now, q.role ?? null, q.q ?? null, q.limit, q.offset],
      ),
      this.db.query<{ n: number }>(
        `WITH ${HospitalAdminService.PEOPLE_CTE}
         SELECT count(*)::int AS n FROM people pe
          WHERE ($2::text IS NULL OR pe.role_key = $2::text) AND ($3::text IS NULL OR pe.full_name ILIKE '%' || $3::text || '%')`,
        [ctx.hospitalId, q.role ?? null, q.q ?? null],
      ),
      this.db.query<{ role_key: string; active: number; on_duty: number }>(
        `WITH ${HospitalAdminService.PEOPLE_CTE}, ${onDutyCte}
         SELECT pe.role_key, count(*) FILTER (WHERE pe.account_status = 'active')::int AS active,
                count(*) FILTER (WHERE pe.account_status = 'active' AND od.user_id IS NOT NULL)::int AS on_duty
           FROM people pe LEFT JOIN on_duty od ON od.user_id = pe.user_id GROUP BY pe.role_key`,
        [ctx.hospitalId, now],
      ),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM org.department WHERE hospital_id = $1::uuid AND is_active`,
        [ctx.hospitalId],
      ),
      this.db.query<{ id: string; full_name: string; role_kind: string; created_at: Date; last_sent_at: Date; expires_at: Date }>(
        `SELECT id, full_name, role_kind, created_at, last_sent_at, expires_at
           FROM identity.staff_invite
          WHERE hospital_id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL
          ORDER BY created_at DESC`,
        [ctx.hospitalId],
      ),
    ])
    const by = (k: string) => kpis.find((r) => r.role_key === k)
    const activeAccounts = kpis.reduce((a, r) => a + r.active, 0)
    return {
      total: total[0]?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
      items: items.map((r) => ({
        userId: r.user_id,
        name: r.full_name,
        role: r.role_key,
        roleLabel: ROLE_LABELS[r.role_key] ?? r.role_key,
        department: r.department,
        registration: r.registration,
        status: r.account_status === 'active' ? (r.on_duty ? 'on_duty' : 'off') : r.account_status,
      })),
      kpis: {
        activeAccounts,
        departments: deptCount[0]?.n ?? 0,
        doctors: by('doctor')?.active ?? 0,
        doctorsOnDuty: by('doctor')?.on_duty ?? 0,
        nurses: by('nurse')?.active ?? 0,
        nursesOnDuty: by('nurse')?.on_duty ?? 0,
        technicians: (by('lab')?.active ?? 0) + (by('radiology')?.active ?? 0),
        labTechnicians: by('lab')?.active ?? 0,
        radiologyTechnicians: by('radiology')?.active ?? 0,
        pharmacists: by('pharmacist')?.active ?? 0,
      },
      pendingInvites: invites.map((i) => ({
        id: i.id,
        name: i.full_name,
        roleKind: i.role_kind,
        sentAt: new Date(i.last_sent_at).toISOString(),
        expiresAt: new Date(i.expires_at).toISOString(),
      })),
    }
  }

  /** Creates a nurse / lab / radiology account through the existing create-staff logic. */
  createStaff(
    user: AuthenticatedUser,
    ctx: HospitalContext,
    body: { personId: string; staffRole: 'nurse' | 'lab' | 'radiology'; departmentId?: string },
  ): Promise<CreateAccountResponse> {
    return this.adminOps.createStaff(user, { ...body, hospitalId: ctx.hospitalId })
  }

  // ------------------------------------------------------------------ permissions

  async permissionMatrix(user: AuthenticatedUser) {
    const ctx = await this.context(user)
    return this.buildMatrix(ctx.hospitalId)
  }

  private async buildMatrix(hospitalId: string) {
    const rows = await this.db.query<{
      role_key: string
      code: string
      label: string
      note: string | null
      locked: boolean
      allowed: boolean
      base_allowed: boolean
      overridden: boolean
    }>(
      `SELECT ep.role_key, ep.permission_code::text AS code, ep.label, p.note, ep.locked, ep.allowed,
              rp.allowed AS base_allowed, (o.allowed IS NOT NULL) AS overridden
         FROM admin.v_effective_permission ep
         JOIN admin.permission p ON p.code = ep.permission_code
         JOIN admin.role_permission rp ON rp.role_key = ep.role_key AND rp.permission_code = ep.permission_code
         LEFT JOIN admin.hospital_permission_override o
                ON o.hospital_id = ep.hospital_id AND o.role_key = ep.role_key AND o.permission_code = ep.permission_code
        WHERE ep.hospital_id = $1::uuid`,
      [hospitalId],
    )
    const byCode = new Map<string, { code: string; label: string; note: string | null; locked: boolean; roles: Record<string, any> }>()
    for (const r of rows) {
      let e = byCode.get(r.code)
      if (!e) {
        e = { code: r.code, label: r.label, note: r.note, locked: r.locked, roles: {} }
        byCode.set(r.code, e)
      }
      e.roles[r.role_key] = { allowed: r.allowed, base: r.base_allowed, overridden: r.overridden }
    }
    const rank = (c: string) => {
      const i = PERMISSION_ORDER.indexOf(c)
      return i === -1 ? 999 : i
    }
    return {
      roles: ROLE_KEYS.map((key) => ({ key, label: ROLE_LABELS[key] })),
      permissions: [...byCode.values()].sort((a, b) => rank(a.code) - rank(b.code)),
    }
  }

  async updatePermissions(
    user: AuthenticatedUser,
    changes: { roleKey: string; permissionCode: string; allowed: boolean }[],
  ) {
    const ctx = await this.context(user)
    await withHospitalTx(this.db, ctx, async (c) => {
      for (const ch of changes) {
        const p = await c.query<{ label: string; locked: boolean }>(
          'SELECT label, locked FROM admin.permission WHERE code = $1::citext',
          [ch.permissionCode],
        )
        if (!p.rowCount) {
          throw new BadRequestException({ success: false, errorMessage: `Unknown permission "${ch.permissionCode}".` })
        }
        const rp = await c.query('SELECT 1 FROM admin.role_permission WHERE role_key = $1 AND permission_code = $2::citext', [
          ch.roleKey,
          ch.permissionCode,
        ])
        if (!rp.rowCount) {
          throw new BadRequestException({ success: false, errorMessage: 'This role and permission pair does not exist.' })
        }
        // A locked (national) rule is refused by the database trigger (CF140) and mapped to 403.
        await c.query(
          `INSERT INTO admin.hospital_permission_override (hospital_id, role_key, permission_code, allowed, updated_by)
           VALUES ($1::uuid, $2, $3::citext, $4, $5::uuid)
           ON CONFLICT (hospital_id, role_key, permission_code)
           DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by`,
          [ctx.hospitalId, ch.roleKey, ch.permissionCode, ch.allowed, ctx.userId],
        )
        await auditScoped(
          c,
          ctx,
          'admin.permission',
          `Permission changed · ${ROLE_LABELS[ch.roleKey] ?? ch.roleKey} · ${p.rows[0]!.label}`,
          { details: { roleKey: ch.roleKey, permissionCode: ch.permissionCode, allowed: ch.allowed } },
        )
      }
    })
    return { success: true, ...(await this.buildMatrix(ctx.hospitalId)) }
  }

  // ------------------------------------------------------------------ hospital profile (edits need approval)

  async profile(user: AuthenticatedUser) {
    const ctx = await this.context(user)
    const [h, docs, requests] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT h.id, h.name, h.hfr_id, h.ownership::text AS ownership, h.hospital_type::text AS hospital_type, h.address,
                h.phone, h.email::text AS email, h.timings, h.services, h.about, h.show_in_find_care, h.accepts_bookings,
                h.status::text AS status, h.licence_no, h.approved_at, d.name AS district
           FROM org.hospital h JOIN geo.district d ON d.id = h.district_id WHERE h.id = $1::uuid`,
        [ctx.hospitalId],
      ),
      this.db.query<Record<string, any>>(
        `SELECT id, doc_type, title, reference_no, valid_until, status
           FROM org.facility_document WHERE hospital_id = $1::uuid ORDER BY uploaded_at`,
        [ctx.hospitalId],
      ),
      this.db.query<Record<string, any>>(
        `SELECT id, status::text AS status, submitted_at, decided_at, reason, check_results -> 'changes' AS changes
           FROM admin.approval_request
          WHERE subject_hospital_id = $1::uuid AND subject_type = 'hospital_profile_change'::admin.approval_subject
          ORDER BY submitted_at DESC LIMIT 10`,
        [ctx.hospitalId],
      ),
    ])
    const r = h[0]!
    return {
      id: r.id,
      name: r.name,
      hfrId: r.hfr_id,
      licenceNo: r.licence_no,
      ownership: r.ownership,
      hospitalType: r.hospital_type,
      district: r.district,
      status: r.status,
      verifiedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      // Name, HFR id, ownership and licence are legal details: they are not editable here.
      lockedFields: ['name', 'hfrId', 'ownership', 'licenceNo'],
      editable: {
        phone: r.phone,
        address: r.address,
        timings: r.timings,
        about: r.about,
        services: r.services,
        showInFindCare: r.show_in_find_care,
        acceptsBookings: r.accepts_bookings,
      },
      documents: docs.map((d) => ({
        id: d.id,
        docType: d.doc_type,
        title: d.title,
        referenceNo: d.reference_no,
        validUntil: d.valid_until ? new Date(d.valid_until).toISOString().slice(0, 10) : null,
        status: d.status,
      })),
      changeRequests: requests.map((q) => ({
        id: q.id,
        status: q.status,
        submittedAt: new Date(q.submitted_at).toISOString(),
        decidedAt: q.decided_at ? new Date(q.decided_at).toISOString() : null,
        decisionReason: q.reason,
        changes: q.changes,
      })),
    }
  }

  /** A profile edit is a request: it goes to the district admin and is not applied until approved. */
  async requestProfileChange(user: AuthenticatedUser, body: Record<string, any>) {
    const ctx = await this.context(user)
    const { note, ...changes } = body
    const open = await this.db.query(
      `SELECT 1 FROM admin.approval_request
        WHERE subject_hospital_id = $1::uuid AND subject_type = 'hospital_profile_change'::admin.approval_subject
          AND status = 'pending'::admin.approval_status LIMIT 1`,
      [ctx.hospitalId],
    )
    if (open.length) {
      throw new ConflictException({ success: false, errorMessage: 'A profile change is already waiting for district approval.' })
    }
    const current = await this.db.query<Record<string, any>>(
      `SELECT phone, address, timings, about, services, show_in_find_care, accepts_bookings FROM org.hospital WHERE id = $1::uuid`,
      [ctx.hospitalId],
    )
    const id = await withHospitalTx(this.db, ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO admin.approval_request
           (subject_type, subject_hospital_id, step, assigned_level, assigned_district_id, status, due_at, check_results)
         VALUES ('hospital_profile_change'::admin.approval_subject, $1::uuid, 1, 'district'::admin.admin_level, $2::uuid,
                 'pending'::admin.approval_status,
                 now() + COALESCE((SELECT time_limit FROM admin.approval_rule
                                    WHERE subject_type = 'hospital_profile_change'::admin.approval_subject AND step = 1),
                                  interval '7 days'),
                 $3::jsonb)
         RETURNING id`,
        [
          ctx.hospitalId,
          ctx.districtId,
          JSON.stringify({
            changes,
            current: current[0] ?? {},
            note: note ?? null,
            requested_by: ctx.adminName,
            summary: `Profile change requested by ${ctx.hospitalName}`,
          }),
        ],
      )
      const newId = r.rows[0]!.id
      await auditScoped(c, ctx, 'hospital.profile_change_requested', 'Hospital profile change sent for district approval', {
        entityType: 'approval_request',
        entityId: newId,
        details: { fields: Object.keys(changes) },
      })
      return newId
    })
    return { success: true, requestId: id, status: 'pending', message: 'Sent to the district admin for approval. Nothing changes until it is approved.' }
  }
}
