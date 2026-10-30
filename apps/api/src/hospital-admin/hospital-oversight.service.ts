import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'
import {
  HospitalContext,
  auditScoped,
  demoNow,
  resolveHospitalContext,
  shortName,
  withHospitalTx,
} from './hospital-context'

const ACCESS_ACTIONS = '^(access|session|breakglass|break_glass|lab|imaging|rx|nurse|admission|document|organ)\\.'
const ADMIN_ACTIONS = '^(admin|approval|staff|roster|complaint|review|hospital|bed|department)\\.'

export function auditGroupOf(action: string): 'access' | 'admin' | 'system' {
  if (new RegExp(ACCESS_ACTIONS).test(action)) return 'access'
  if (new RegExp(ADMIN_ACTIONS).test(action)) return 'admin'
  return 'system'
}

const CATEGORY_LABELS: Record<string, string> = {
  op_services: 'OP services',
  pharmacy: 'Pharmacy',
  staff_conduct: 'Staff conduct',
  lab: 'Lab',
  cleanliness: 'Cleanliness',
  billing: 'Billing',
  app: 'App',
  record_access: 'Record access',
  other: 'Other',
}

type ComplaintState = 'new' | 'under_review' | 'resolved' | 'escalated'
function complaintState(status: string): ComplaintState {
  if (status === 'assigned') return 'under_review'
  if (status === 'resolved' || status === 'closed') return 'resolved'
  if (status === 'escalated') return 'escalated'
  return 'new' // open, reopened
}

@Injectable()
export class HospitalOversightService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private ctxOf(user: AuthenticatedUser): Promise<HospitalContext> {
    return resolveHospitalContext(this.db, user)
  }

  // ------------------------------------------------------------------ break-glass

  async breakGlassCounts(ctx: HospitalContext, now: string) {
    const rows = await withHospitalTx(this.db, ctx, (c) =>
      c.query<{ this_week: number; need_review: number }>(
        `SELECT count(*) FILTER (WHERE started_at > $1::timestamptz - interval '7 days' AND started_at <= $1::timestamptz)::int AS this_week,
                count(*) FILTER (WHERE hospital_review_status = 'pending'::access.review_status)::int AS need_review
           FROM access.v_break_glass_review`,
        [now],
      ),
    )
    return { thisWeek: rows.rows[0]?.this_week ?? 0, needReview: rows.rows[0]?.need_review ?? 0, reviewWindowHours: 72 }
  }

  async listBreakGlass(user: AuthenticatedUser) {
    const ctx = await this.ctxOf(user)
    const nowMs = demoNow(this.config).getTime()
    const res = await withHospitalTx(this.db, ctx, (c) =>
      c.query(
        `SELECT b.session_id, b.started_at, b.minutes_open, b.doctor_name, b.patient_label, pat.is_unidentified,
                b.reason_category, b.break_glass_reason, b.evidence_note, b.match_method,
                b.hospital_review_status::text AS review_status, b.hospital_due_at, b.hospital_reviewed_at,
                b.district_review_status::text AS district_status, b.viewed, dep.name AS department, ea.hospital_review_note
           FROM access.v_break_glass_review b
           JOIN access.emergency_access ea ON ea.session_id = b.session_id
           JOIN access.access_session s ON s.id = b.session_id
           JOIN identity.person pat ON pat.id = s.patient_person_id
           LEFT JOIN identity.doctor_profile dp ON dp.user_id = b.doctor_user_id
           LEFT JOIN org.department dep ON dep.id = dp.department_id
          ORDER BY (b.hospital_review_status = 'pending'::access.review_status) DESC, b.started_at DESC`,
      ),
    )
    const items = res.rows.map((r) => {
      const due = new Date(r.hospital_due_at).getTime()
      return {
        sessionId: r.session_id,
        doctor: r.doctor_name,
        patient: r.is_unidentified ? r.patient_label : shortName(r.patient_label),
        department: r.department,
        startedAt: new Date(r.started_at).toISOString(),
        minutesOpen: r.minutes_open,
        reasonCategory: r.reason_category,
        reason: r.break_glass_reason,
        evidence: r.evidence_note,
        matchMethod: r.match_method,
        viewed: r.viewed,
        status: r.review_status === 'pending' ? 'review_due' : r.review_status === 'ok' ? 'justified' : 'escalated',
        reviewDueAt: new Date(r.hospital_due_at).toISOString(),
        hoursLeft: r.review_status === 'pending' ? Math.max(0, Math.ceil((due - nowMs) / 3_600_000)) : null,
        reviewedAt: r.hospital_reviewed_at ? new Date(r.hospital_reviewed_at).toISOString() : null,
        reviewNote: r.hospital_review_note,
        districtStatus: r.district_status,
      }
    })
    return {
      needReview: items.filter((i) => i.status === 'review_due').length,
      items,
    }
  }

  async justifyBreakGlass(user: AuthenticatedUser, sessionId: string, note?: string) {
    const ctx = await this.ctxOf(user)
    await withHospitalTx(this.db, ctx, async (c) => {
      await c.query(`SELECT access.hospital_review($1::uuid, 'ok'::access.review_status, $2)`, [sessionId, note ?? null])
      await auditScoped(c, ctx, 'breakglass.justified', 'Break-glass access marked justified', {
        entityType: 'access_session',
        entityId: sessionId,
      })
    })
    return { success: true, status: 'justified' }
  }

  async escalateBreakGlass(user: AuthenticatedUser, sessionId: string, note: string) {
    const ctx = await this.ctxOf(user)
    await withHospitalTx(this.db, ctx, async (c) => {
      await c.query(`SELECT access.hospital_review($1::uuid, 'misuse'::access.review_status, $2)`, [sessionId, note])
      await c.query(
        `INSERT INTO audit.flagged_event
           (rule, severity, event_text, actor_role, hospital_id, district_id, status, reviewed_by_user_id, reviewed_at,
            outcome_note, escalated_to_level)
         VALUES ('break_glass_not_justified', 'high', $1, 'doctor', $2::uuid, $3::uuid, 'escalated', $4::uuid, now(), $5,
                 'district'::admin.admin_level)`,
        [
          `Break-glass access at ${ctx.hospitalName} was not justified by the hospital admin`,
          ctx.hospitalId,
          ctx.districtId,
          ctx.userId,
          note,
        ],
      )
      await auditScoped(c, ctx, 'breakglass.escalated', 'Break-glass access not justified, escalated to district', {
        entityType: 'access_session',
        entityId: sessionId,
      })
    })
    return { success: true, status: 'escalated' }
  }

  // ------------------------------------------------------------------ audit log

  async recentActivity(ctx: HospitalContext, limit: number) {
    const r = await withHospitalTx(this.db, ctx, (c) =>
      c.query(
        `SELECT seq, occurred_at, actor, action, details ->> 'summary' AS summary
           FROM audit.v_scoped_log ORDER BY occurred_at DESC, seq DESC LIMIT $1`,
        [limit],
      ),
    )
    return r.rows.map((x) => ({
      seq: Number(x.seq),
      at: new Date(x.occurred_at).toISOString(),
      actor: x.actor ?? 'System',
      action: x.action,
      summary: x.summary ?? x.action,
      group: auditGroupOf(x.action),
    }))
  }

  async auditLog(user: AuthenticatedUser, q: { group?: 'access' | 'admin' | 'system'; limit: number; beforeSeq?: number }) {
    const ctx = await this.ctxOf(user)
    const r = await withHospitalTx(this.db, ctx, (c) =>
      c.query(
        `SELECT seq, occurred_at, actor, account_type::text AS account_type, action, entity_type, details ->> 'summary' AS summary
           FROM audit.v_scoped_log
          WHERE ($2::bigint IS NULL OR seq < $2::bigint)
            AND ( $3::text IS NULL
               OR ($3 = 'access' AND action ~ $4)
               OR ($3 = 'admin' AND action ~ $5)
               OR ($3 = 'system' AND action !~ $4 AND action !~ $5) )
          ORDER BY seq DESC LIMIT $1`,
        [q.limit, q.beforeSeq ?? null, q.group ?? null, ACCESS_ACTIONS, ADMIN_ACTIONS],
      ),
    )
    const items = r.rows.map((x) => ({
      seq: Number(x.seq),
      at: new Date(x.occurred_at).toISOString(),
      actor: x.actor ?? 'System',
      actorType: x.account_type,
      action: x.action,
      summary: x.summary ?? x.action,
      group: auditGroupOf(x.action),
    }))
    return { items, nextBeforeSeq: items.length === q.limit ? items[items.length - 1]!.seq : null }
  }

  // ------------------------------------------------------------------ complaints

  async complaintsPeek(ctx: HospitalContext, n: number) {
    const [open, rows] = await Promise.all([
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM engage.complaint
          WHERE hospital_id = $1::uuid AND status IN ('open','assigned','reopened')`,
        [ctx.hospitalId],
      ),
      this.db.query<{ id: string; ref_no: string; title: string | null; body: string; created_at: Date; status: string; who: string }>(
        `SELECT c.id, c.ref_no, c.title, c.body, c.created_at, c.status, p.full_name AS who
           FROM engage.complaint c JOIN identity.person p ON p.id = c.raised_by_person_id
          WHERE c.hospital_id = $1::uuid AND c.status IN ('open','assigned','reopened')
          ORDER BY c.created_at DESC LIMIT $2`,
        [ctx.hospitalId, n],
      ),
    ])
    return {
      openCount: open[0]?.n ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        refNo: r.ref_no,
        title: r.title ?? r.body.slice(0, 80),
        who: shortName(r.who),
        createdAt: new Date(r.created_at).toISOString(),
        state: complaintState(r.status),
      })),
    }
  }

  async listComplaints(user: AuthenticatedUser, q: { status?: string; limit: number }) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const [rows, summary, byCat] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT c.id, c.ref_no, c.title, c.body, c.status, c.category, c.severity, c.created_at, c.due_at, c.resolved_at,
                c.resolution, c.escalation_level, p.full_name AS who, ap.full_name AS assignee
           FROM engage.complaint c
           JOIN identity.person p ON p.id = c.raised_by_person_id
           LEFT JOIN identity.app_user au ON au.id = c.assigned_to_user_id
           LEFT JOIN identity.person ap ON ap.id = au.person_id
          WHERE c.hospital_id = $1::uuid
          ORDER BY (c.status IN ('open','assigned','reopened')) DESC, c.created_at DESC
          LIMIT 500`,
        [ctx.hospitalId],
      ),
      this.db.query<{ resolved_n: number; avg_days: number | null }>(
        `SELECT count(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved_n,
                round(avg(extract(epoch FROM resolved_at - created_at) / 86400) FILTER (WHERE resolved_at IS NOT NULL), 1)::float8 AS avg_days
           FROM engage.complaint WHERE hospital_id = $1::uuid`,
        [ctx.hospitalId],
      ),
      this.db.query<{ category: string; n: number }>(
        `SELECT category, count(*)::int AS n FROM engage.complaint
          WHERE hospital_id = $1::uuid AND created_at > $2::timestamptz - interval '30 days' AND created_at <= $2::timestamptz
          GROUP BY category ORDER BY n DESC`,
        [ctx.hospitalId, now],
      ),
    ])
    const all = rows.map((r) => ({
      id: r.id,
      refNo: r.ref_no,
      title: r.title ?? String(r.body).slice(0, 80),
      text: r.body,
      who: shortName(r.who),
      createdAt: new Date(r.created_at).toISOString(),
      dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
      category: r.category,
      categoryLabel: CATEGORY_LABELS[r.category] ?? r.category,
      urgent: r.severity !== 'normal',
      severity: r.severity,
      state: complaintState(r.status),
      assignee: r.assignee ?? null,
      resolution: r.resolution,
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      escalationLevel: r.escalation_level,
    }))
    const items = (q.status ? all.filter((c) => (q.status === 'open' ? c.state === 'new' || c.state === 'under_review' : c.state === q.status)) : all).slice(0, q.limit)
    return {
      openCount: all.filter((c) => c.state === 'new' || c.state === 'under_review').length,
      resolvedCount: all.filter((c) => c.state === 'resolved').length,
      escalatedCount: all.filter((c) => c.state === 'escalated').length,
      avgResponseDays: summary[0]?.avg_days ?? null,
      targetDays: 7,
      byCategoryLast30Days: byCat.map((c) => ({ category: c.category, label: CATEGORY_LABELS[c.category] ?? c.category, count: c.n })),
      items,
    }
  }

  private async ownComplaint(ctx: HospitalContext, id: string) {
    const r = await this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM engage.complaint WHERE id = $1::uuid AND hospital_id = $2::uuid',
      [id, ctx.hospitalId],
    )
    if (!r[0]) throw new NotFoundException({ success: false, errorMessage: 'Complaint not found in your hospital.' })
    return r[0]
  }

  async complaintTimeline(user: AuthenticatedUser, id: string) {
    const ctx = await this.ctxOf(user)
    await this.ownComplaint(ctx, id)
    const ev = await this.db.query<Record<string, any>>(
      `SELECT e.kind, e.text, e.created_at, p.full_name AS actor
         FROM engage.complaint_event e
         LEFT JOIN identity.app_user au ON au.id = e.actor_user_id
         LEFT JOIN identity.person p ON p.id = au.person_id
        WHERE e.complaint_id = $1::uuid ORDER BY e.created_at, e.id`,
      [id],
    )
    return ev.map((e) => ({ kind: e.kind, text: e.text, at: new Date(e.created_at).toISOString(), actor: e.actor ?? 'System' }))
  }

  async assignComplaint(user: AuthenticatedUser, id: string, assigneeUserId?: string, note?: string) {
    const ctx = await this.ctxOf(user)
    const cur = await this.ownComplaint(ctx, id)
    if (!['open', 'reopened'].includes(cur.status)) {
      throw new ConflictException({ success: false, errorMessage: 'Only a new complaint can be assigned.' })
    }
    await withHospitalTx(this.db, ctx, async (c) => {
      let assignee = ctx.userId
      if (assigneeUserId) {
        const ok = await c.query(
          `SELECT 1 FROM identity.app_user au
            WHERE au.id = $1::uuid AND au.status = 'active'::identity.account_status
              AND ( EXISTS (SELECT 1 FROM identity.staff_profile sp WHERE sp.user_id = au.id AND sp.hospital_id = $2::uuid)
                 OR EXISTS (SELECT 1 FROM identity.hospital_admin_profile ha WHERE ha.user_id = au.id AND ha.hospital_id = $2::uuid) )`,
          [assigneeUserId, ctx.hospitalId],
        )
        if (!ok.rowCount) {
          throw new NotFoundException({ success: false, errorMessage: 'That person does not work at your hospital.' })
        }
        assignee = assigneeUserId
      }
      await c.query(
        `UPDATE engage.complaint SET status = 'assigned', assigned_to_user_id = $2::uuid WHERE id = $1::uuid AND hospital_id = $3::uuid`,
        [id, assignee, ctx.hospitalId],
      )
      if (note) {
        await c.query(
          `INSERT INTO engage.complaint_event (complaint_id, actor_user_id, kind, text) VALUES ($1::uuid, $2::uuid, 'note', $3)`,
          [id, ctx.userId, note],
        )
      }
      await auditScoped(c, ctx, 'complaint.assigned', 'Complaint assigned to the PRO desk', { entityType: 'complaint', entityId: id })
    })
    return { success: true, state: 'under_review' }
  }

  async resolveComplaint(user: AuthenticatedUser, id: string, resolution: string) {
    const ctx = await this.ctxOf(user)
    const cur = await this.ownComplaint(ctx, id)
    if (!['open', 'assigned', 'reopened'].includes(cur.status)) {
      throw new ConflictException({ success: false, errorMessage: 'This complaint cannot be resolved from the hospital any more.' })
    }
    await withHospitalTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE engage.complaint
            SET status = 'resolved', resolution = $2, resolved_at = now(),
                assigned_to_user_id = COALESCE(assigned_to_user_id, $3::uuid)
          WHERE id = $1::uuid AND hospital_id = $4::uuid`,
        [id, resolution, ctx.userId, ctx.hospitalId],
      )
      await c.query(
        `INSERT INTO engage.complaint_event (complaint_id, actor_user_id, kind, text)
         VALUES ($1::uuid, $2::uuid, 'citizen_notified', 'Citizen notified of the resolution (mock SMS and app message)')`,
        [id, ctx.userId],
      )
      await auditScoped(c, ctx, 'complaint.resolved', 'Complaint resolved, citizen notified', { entityType: 'complaint', entityId: id })
    })
    return { success: true, state: 'resolved' }
  }

  // ------------------------------------------------------------------ reviews

  async ratingSummary(hospitalId: string, now: string) {
    const [tot, dist, tags, byDept, month, reply] = await Promise.all([
      this.db.query<{ n: number; avg: number | null; verified: number; replied: number }>(
        `SELECT count(*)::int AS n, round(avg(stars), 1)::float8 AS avg,
                count(*) FILTER (WHERE visit_verified)::int AS verified,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM engage.rating_reply rr WHERE rr.rating_id = r.id))::int AS replied
           FROM engage.rating r
          WHERE target_type = 'hospital'::engage.rating_target AND target_id = $1::uuid AND moderation_status = 'published'::engage.moderation`,
        [hospitalId],
      ),
      this.db.query<{ stars: number; n: number }>(
        `SELECT stars::int AS stars, count(*)::int AS n FROM engage.rating
          WHERE target_type = 'hospital'::engage.rating_target AND target_id = $1::uuid AND moderation_status = 'published'::engage.moderation
          GROUP BY stars`,
        [hospitalId],
      ),
      this.db.query<{ tag: string; n: number }>(
        `SELECT t AS tag, count(*)::int AS n FROM engage.rating r, unnest(r.tags) AS t
          WHERE r.target_type = 'hospital'::engage.rating_target AND r.target_id = $1::uuid AND r.moderation_status = 'published'::engage.moderation
          GROUP BY t ORDER BY n DESC, t LIMIT 6`,
        [hospitalId],
      ),
      this.db.query<{ department: string; avg: number; n: number }>(
        `SELECT d.name AS department, round(avg(r.stars), 1)::float8 AS avg, count(*)::int AS n
           FROM engage.rating r JOIN org.department d ON d.id = r.department_id
          WHERE r.target_type = 'hospital'::engage.rating_target AND r.target_id = $1::uuid AND r.moderation_status = 'published'::engage.moderation
          GROUP BY d.name ORDER BY avg DESC, d.name`,
        [hospitalId],
      ),
      this.db.query<{ new_n: number; cur_avg: number | null; prev_avg: number | null }>(
        `SELECT count(*) FILTER (WHERE created_at >= date_trunc('month', $2::timestamptz))::int AS new_n,
                round(avg(stars) FILTER (WHERE created_at >= date_trunc('month', $2::timestamptz)), 1)::float8 AS cur_avg,
                round(avg(stars) FILTER (WHERE created_at >= date_trunc('month', $2::timestamptz) - interval '1 month'
                                          AND created_at < date_trunc('month', $2::timestamptz)), 1)::float8 AS prev_avg
           FROM engage.rating
          WHERE target_type = 'hospital'::engage.rating_target AND target_id = $1::uuid AND moderation_status = 'published'::engage.moderation`,
        [hospitalId, now],
      ),
      this.db.query<{ avg_days: number | null; within3: number }>(
        `SELECT round(avg(extract(epoch FROM fr.first_at - r.created_at) / 86400), 1)::float8 AS avg_days,
                count(*) FILTER (WHERE fr.first_at - r.created_at <= interval '3 days')::int AS within3
           FROM engage.rating r
           JOIN LATERAL (SELECT min(created_at) AS first_at FROM engage.rating_reply rr WHERE rr.rating_id = r.id) fr ON fr.first_at IS NOT NULL
          WHERE r.target_type = 'hospital'::engage.rating_target AND r.target_id = $1::uuid AND r.moderation_status = 'published'::engage.moderation`,
        [hospitalId],
      ),
    ])
    const n = tot[0]?.n ?? 0
    const pct = (x: number) => (n > 0 ? Math.round((100 * x) / n) : 0)
    const m = month[0]
    return {
      average: tot[0]?.avg ?? null,
      count: n,
      verifiedCount: tot[0]?.verified ?? 0,
      distribution: [5, 4, 3, 2, 1].map((s) => {
        const c = dist.find((d) => d.stars === s)?.n ?? 0
        return { stars: s, count: c, pct: pct(c) }
      }),
      topTags: tags.map((t) => ({ tag: t.tag, count: t.n })),
      byDepartment: byDept,
      repliedPct: pct(tot[0]?.replied ?? 0),
      repliedWithin3DaysPct: pct(reply[0]?.within3 ?? 0),
      avgReplyDays: reply[0]?.avg_days ?? null,
      newThisMonth: m?.new_n ?? 0,
      changeVsLastMonth: m?.cur_avg != null && m?.prev_avg != null ? Math.round((m.cur_avg - m.prev_avg) * 10) / 10 : null,
    }
  }

  async listReviews(user: AuthenticatedUser, q: { stars?: number; limit: number }) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const [summary, rows] = await Promise.all([
      this.ratingSummary(ctx.hospitalId, now),
      this.db.query<Record<string, any>>(
        `SELECT r.id, r.stars, r.comment, r.tags, r.visit_verified, r.created_at, p.full_name AS who, d.name AS department,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('id', rr.id, 'body', rr.body, 'at', rr.created_at, 'by', rp.full_name)
                                           ORDER BY rr.created_at)
                            FROM engage.rating_reply rr
                            JOIN identity.app_user ra ON ra.id = rr.author_user_id
                            JOIN identity.person rp ON rp.id = ra.person_id
                           WHERE rr.rating_id = r.id), '[]'::jsonb) AS replies
           FROM engage.rating r
           JOIN identity.person p ON p.id = r.rater_person_id
           LEFT JOIN org.department d ON d.id = r.department_id
          WHERE r.target_type = 'hospital'::engage.rating_target AND r.target_id = $1::uuid
            AND r.moderation_status = 'published'::engage.moderation
            AND ($2::int IS NULL OR r.stars = $2::int)
          ORDER BY r.created_at DESC LIMIT $3`,
        [ctx.hospitalId, q.stars ?? null, q.limit],
      ),
    ])
    return {
      summary,
      items: rows.map((r) => ({
        id: r.id,
        name: shortName(r.who),
        stars: r.stars,
        text: r.comment,
        tags: r.tags,
        department: r.department,
        visitVerified: r.visit_verified,
        createdAt: new Date(r.created_at).toISOString(),
        replies: r.replies,
      })),
    }
  }

  async replyToReview(user: AuthenticatedUser, ratingId: string, body: string) {
    const ctx = await this.ctxOf(user)
    const own = await this.db.query(
      `SELECT 1 FROM engage.rating
        WHERE id = $1::uuid AND target_type = 'hospital'::engage.rating_target AND target_id = $2::uuid
          AND moderation_status = 'published'::engage.moderation`,
      [ratingId, ctx.hospitalId],
    )
    if (!own.length) throw new NotFoundException({ success: false, errorMessage: 'Review not found for your hospital.' })
    const id = await withHospitalTx(this.db, ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO engage.rating_reply (rating_id, author_user_id, body) VALUES ($1::uuid, $2::uuid, $3) RETURNING id`,
        [ratingId, ctx.userId, body],
      )
      await auditScoped(c, ctx, 'review.reply', 'Replied to a citizen review', { entityType: 'rating', entityId: ratingId })
      return r.rows[0]!.id
    })
    return { success: true, replyId: id }
  }
}
