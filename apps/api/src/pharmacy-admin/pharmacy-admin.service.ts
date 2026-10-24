import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, createHmac, randomBytes } from 'crypto'
import type { CreateAccountResponse } from '@carefusion/shared'
import { DatabaseService } from '../database/database.service'
import { AdminOpsService } from '../admin-ops/admin-ops.service'
import type { AuthenticatedUser } from '../auth/types'
import { demoNow } from '../hospital-admin/hospital-context'
import { PharmacyContext, auditPharmacy, resolvePharmacyContext, withPharmacyTx } from './pharmacy-context'

const istDate = (p: string) => `(${p}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null)

const AUDIT_RX = '^rx\\.'
const AUDIT_STOCK = '^stock\\.'
const AUDIT_STAFF = '^(staff|auth)\\.'
export function pharmacyAuditGroup(action: string): 'rx' | 'stock' | 'staff' | 'other' {
  if (new RegExp(AUDIT_RX).test(action)) return 'rx'
  if (new RegExp(AUDIT_STOCK).test(action)) return 'stock'
  if (new RegExp(AUDIT_STAFF).test(action)) return 'staff'
  return 'other'
}

@Injectable()
export class PharmacyAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly adminOps: AdminOpsService,
  ) {}

  context(user: AuthenticatedUser): Promise<PharmacyContext> {
    return resolvePharmacyContext(this.db, user)
  }

  // ------------------------------------------------------------------ overview

  async overview(user: AuthenticatedUser) {
    const ctx = await this.context(user)
    const now = demoNow(this.config).toISOString()
    const p = ctx.pharmacyId

    const [ph, perDay, stock, expiring, categories, searches, recalls, pos, invites, docs, low, counters, fillsByUser] =
      await Promise.all([
        this.db.query<Record<string, any>>(
          `SELECT name, licence_no, licence_valid_until, compliance_score, counters FROM org.pharmacy WHERE id = $1::uuid`,
          [p],
        ),
        this.db.query<{ d: string; n: number }>(
          `SELECT (d.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date::text AS d, count(DISTINCT i.prescription_id)::int AS n
             FROM pharmacy.dispensing d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
            WHERE d.pharmacy_id = $1::uuid AND d.outcome::text IN ('dispensed','substitute')
              AND d.dispensed_at > $2::timestamptz - interval '75 days' AND d.dispensed_at <= $2::timestamptz
            GROUP BY 1`,
          [p, now],
        ),
        this.db.query<Record<string, any>>(`SELECT * FROM pharmacy.v_stock_overview WHERE pharmacy_id = $1::uuid`, [p]),
        this.db.query<{ batches: number; value: string }>(
          `SELECT count(*)::int AS batches, coalesce(sum(quantity * coalesce(cost, unit_price)), 0)::numeric(14,2) AS value
             FROM pharmacy.stock_item
            WHERE pharmacy_id = $1::uuid AND quantity > 0
              AND expiry_date >= ${istDate('$2')} AND expiry_date <= ${istDate('$2')} + 30`,
          [p, now],
        ),
        this.db.query<{ category: string; skus: number; value: string }>(
          `SELECT coalesce(m.category, 'Other') AS category, count(DISTINCT s.medicine_id)::int AS skus,
                  coalesce(sum(s.quantity * coalesce(s.cost, s.unit_price)), 0)::numeric(14,2) AS value
             FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
            WHERE s.pharmacy_id = $1::uuid GROUP BY 1 ORDER BY value DESC`,
          [p],
        ),
        this.db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pharmacy.stock_search_log
            WHERE pharmacy_id = $1::uuid AND searched_at > $2::timestamptz - interval '7 days' AND searched_at <= $2::timestamptz`,
          [p, now],
        ),
        this.db.query<Record<string, any>>(
          `SELECT r.id, r.title, r.recall_class, a.qty_on_shelf, r.batch_no, r.medicine_name, a.status
             FROM pharmacy.recall_ack a JOIN pharmacy.drug_recall r ON r.id = a.recall_id
            WHERE a.pharmacy_id = $1::uuid AND a.status IN ('action_needed','review') ORDER BY r.urgent DESC, r.issued_on DESC`,
          [p],
        ),
        this.db.query<Record<string, any>>(
          `SELECT po.id, po.po_number, po.total_amount, s.name AS supplier,
                  (SELECT count(*) FROM pharmacy.po_line l WHERE l.po_id = po.id)::int AS lines
             FROM pharmacy.purchase_order po JOIN pharmacy.supplier s ON s.id = po.supplier_id
            WHERE po.pharmacy_id = $1::uuid AND po.status = 'pending_approval' ORDER BY po.created_at`,
          [p],
        ),
        this.db.query<Record<string, any>>(
          `SELECT id, full_name, last_sent_at, expires_at FROM identity.staff_invite
            WHERE pharmacy_id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at`,
          [p],
        ),
        this.db.query<Record<string, any>>(
          `SELECT id, title, valid_until, status FROM org.facility_document
            WHERE pharmacy_id = $1::uuid AND valid_until IS NOT NULL
              AND valid_until <= ${istDate('$2')} + 60 AND status IN ('renew_soon','expired','verified','under_review')
            ORDER BY valid_until`,
          [p, now],
        ),
        this.db.query<Record<string, any>>(
          `SELECT m.generic_name || ' ' || m.strength AS name, sum(s.quantity) AS qty, max(s.low_threshold) AS min
             FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
            WHERE s.pharmacy_id = $1::uuid AND s.blocked_reason IS NULL AND s.expiry_date >= ${istDate('$2')}
            GROUP BY m.id, m.generic_name, m.strength
           HAVING sum(s.quantity) < max(s.low_threshold)
            ORDER BY sum(s.quantity) / NULLIF(max(s.low_threshold), 0) LIMIT 8`,
          [p, now],
        ),
        this.db.query<Record<string, any>>(
          `SELECT cs.user_id, pp.full_name, cs.counter, cs.state, cs.since
             FROM pharmacy.counter_state cs JOIN identity.app_user au ON au.id = cs.user_id
             JOIN identity.person pp ON pp.id = au.person_id
            WHERE cs.pharmacy_id = $1::uuid ORDER BY cs.state, pp.full_name`,
          [p],
        ),
        this.db.query<{ u: string; n: number }>(
          `SELECT d.pharmacist_user_id AS u, count(DISTINCT i.prescription_id)::int AS n
             FROM pharmacy.dispensing d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
            WHERE d.pharmacy_id = $1::uuid AND d.outcome::text IN ('dispensed','substitute')
              AND (d.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date = ${istDate('$2')} GROUP BY 1`,
          [p, now],
        ),
      ])

    // Dispensing series from the dispensing rows (distinct prescriptions per Indian calendar day).
    const todayStr = (await this.db.query<{ d: string }>(`SELECT ${istDate('$1')}::text AS d`, [now]))[0]!.d
    const addDays = (s: string, n: number) => {
      const d = new Date(`${s}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + n)
      return d.toISOString().slice(0, 10)
    }
    const byDay = new Map(perDay.map((r) => [r.d, r.n]))
    const series = (n: number, offset = 0) =>
      Array.from({ length: n }, (_, i) => {
        const date = addDays(todayStr, -(n - 1 - i) - offset)
        return { date, count: byDay.get(date) ?? 0 }
      })
    const last7 = series(7)
    const last30 = series(30)
    const prior30 = series(30, 30)
    const total30 = last30.reduce((a, b) => a + b.count, 0)
    const totalPrior = prior30.reduce((a, b) => a + b.count, 0)
    const peak = last30.reduce((a, b) => (b.count > a.count ? b : a), last30[0]!)
    const sameDayLastWeek = byDay.get(addDays(todayStr, -7)) ?? 0
    const filledToday = byDay.get(todayStr) ?? 0
    const so = stock[0]
    const skus = so?.skus ?? 0
    const published = so?.skus_published ?? 0
    const fills = new Map(fillsByUser.map((r) => [r.u, r.n]))

    const needsAction = [
      ...recalls.map((r) => ({
        kind: 'recall',
        id: r.id,
        title: `${r.recall_class === 'notice' ? 'Manufacturer notice' : 'CDSCO recall'} · ${r.medicine_name}`,
        detail: `${r.batch_no ? `Batch ${r.batch_no} · ` : ''}${num(r.qty_on_shelf)} on shelf`,
        severity: r.status === 'action_needed' ? 'danger' : 'warning',
      })),
      ...pos.map((o) => ({
        kind: 'purchase_order',
        id: o.id,
        title: `${o.po_number} awaiting approval`,
        detail: `${o.supplier} · ₹${num(o.total_amount).toLocaleString('en-IN')} · ${o.lines} lines`,
        severity: 'warning',
      })),
      ...invites.map((i) => ({
        kind: 'invite',
        id: i.id,
        title: `Invite pending · ${i.full_name}`,
        detail: `Sent ${day(i.last_sent_at)} · expires ${day(i.expires_at)}`,
        severity: 'info',
      })),
      ...docs.map((d) => ({
        kind: 'document',
        id: d.id,
        title: `${d.title} renewal`,
        detail: `Due ${day(d.valid_until)}`,
        severity: 'info',
      })),
    ]

    return {
      pharmacy: {
        id: p,
        name: ph[0]?.name ?? ctx.pharmacyName,
        licenceNo: ph[0]?.licence_no,
        licenceValidUntil: day(ph[0]?.licence_valid_until),
        counters: ph[0]?.counters,
      },
      admin: { userId: ctx.userId, name: ctx.adminName },
      asOf: now,
      kpis: {
        prescriptionsFilledToday: filledToday,
        filledSameDayLastWeek: sameDayLastWeek,
        filledTrendPct: sameDayLastWeek > 0 ? Math.round(((filledToday - sameDayLastWeek) / sameDayLastWeek) * 100) : null,
        itemsInStock: skus,
        itemsPublished: published,
        lowStockBatches: so?.low_batches ?? 0,
        blockedBatches: so?.blocked_batches ?? 0,
        stockValue: num(so?.stock_value),
        expiring30DaysBatches: expiring[0]?.batches ?? 0,
        expiring30DaysValue: num(expiring[0]?.value),
      },
      dispensingWeek: last7,
      dispensing30Days: {
        total: total30,
        average: Math.round((total30 / 30) * 10) / 10,
        peak,
        monthOnMonthPct: totalPrior > 0 ? Math.round(((total30 - totalPrior) / totalPrior) * 100) : null,
        series: last30,
      },
      finder: { publishedPct: skus > 0 ? Math.round((100 * published) / skus) : 0, searchesThisWeek: searches[0]?.n ?? 0 },
      stockByCategory: categories.map((c) => ({ category: c.category, skus: c.skus, value: num(c.value) })),
      lowStock: low.map((l) => ({ name: l.name, quantity: num(l.qty), min: num(l.min) })),
      needsAction,
      pharmacistsOnShift: counters.map((c) => ({
        userId: c.user_id,
        name: c.full_name,
        counter: c.counter,
        state: c.state,
        since: iso(c.since),
        fillsToday: fills.get(c.user_id) ?? 0,
      })),
    }
  }

  // ------------------------------------------------------------------ pharmacists

  async listPharmacists(user: AuthenticatedUser, q?: string) {
    const ctx = await this.context(user)
    const now = demoNow(this.config).toISOString()
    const [rows, invites] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT au.id AS user_id, pp.full_name, pr.registration_no, pr.role_label, pr.shift, au.status::text AS status,
                au.status_reason, au.deactivated_at, cs.state AS counter_state, cs.counter, cs.last_active_at,
                (SELECT count(DISTINCT i.prescription_id)::int
                   FROM pharmacy.dispensing d JOIN pharmacy.prescription_item i ON i.id = d.prescription_item_id
                  WHERE d.pharmacist_user_id = au.id AND d.outcome::text IN ('dispensed','substitute')
                    AND (d.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date = ${istDate('$2')}) AS fills_today
           FROM identity.pharmacist_profile pr
           JOIN identity.app_user au ON au.id = pr.user_id
           JOIN identity.person pp ON pp.id = au.person_id
           LEFT JOIN pharmacy.counter_state cs ON cs.user_id = au.id
          WHERE pr.pharmacy_id = $1::uuid AND ($3::text IS NULL OR pp.full_name ILIKE '%' || $3::text || '%')
          ORDER BY (au.status = 'active'::identity.account_status) DESC, pp.full_name`,
        [ctx.pharmacyId, now, q ?? null],
      ),
      this.db.query<Record<string, any>>(
        `SELECT id, full_name, registration_no, shift, created_at, last_sent_at, expires_at, resend_count
           FROM identity.staff_invite WHERE pharmacy_id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL
          ORDER BY created_at DESC`,
        [ctx.pharmacyId],
      ),
    ])
    return {
      kpis: {
        accounts: rows.length,
        active: rows.filter((r) => r.status === 'active').length,
        invitesPending: invites.length,
      },
      items: rows.map((r) => ({
        userId: r.user_id,
        name: r.full_name,
        registrationNo: r.registration_no,
        role: r.role_label,
        shift: r.shift,
        status: r.status,
        statusReason: r.status_reason,
        counter: r.counter,
        counterState: r.counter_state,
        lastActiveAt: iso(r.last_active_at),
        fillsToday: r.fills_today,
      })),
      pendingInvites: invites.map((i) => ({
        id: i.id,
        name: i.full_name,
        registrationNo: i.registration_no,
        shift: i.shift,
        sentAt: iso(i.last_sent_at),
        expiresAt: iso(i.expires_at),
        resendCount: i.resend_count,
      })),
    }
  }

  /** Creates the pharmacist account through the existing create-pharmacist logic. */
  createPharmacist(
    user: AuthenticatedUser,
    ctx: PharmacyContext,
    body: { personId: string; registrationNo: string },
  ): Promise<CreateAccountResponse> {
    return this.adminOps.createPharmacist(user, { ...body, pharmacyId: ctx.pharmacyId })
  }

  private async ownPharmacist(ctx: PharmacyContext, userId: string) {
    const r = await this.db.query<{ status: string; full_name: string }>(
      `SELECT au.status::text AS status, pp.full_name
         FROM identity.pharmacist_profile pr JOIN identity.app_user au ON au.id = pr.user_id
         JOIN identity.person pp ON pp.id = au.person_id
        WHERE pr.user_id = $1::uuid AND pr.pharmacy_id = $2::uuid`,
      [userId, ctx.pharmacyId],
    )
    if (!r[0]) throw new NotFoundException({ success: false, errorMessage: 'Pharmacist not found in your pharmacy.' })
    return r[0]
  }

  async deactivatePharmacist(user: AuthenticatedUser, userId: string, reason: string) {
    const ctx = await this.context(user)
    const cur = await this.ownPharmacist(ctx, userId)
    if (cur.status !== 'active') {
      throw new ConflictException({ success: false, errorMessage: 'Only an active account can be deactivated.' })
    }
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE identity.app_user SET status = 'deactivated'::identity.account_status, status_reason = $2, deactivated_at = now()
          WHERE id = $1::uuid`,
        [userId, reason],
      )
      await auditPharmacy(c, ctx, 'staff.deactivate', `${cur.full_name} deactivated · ${reason}`, { entityType: 'user', entityId: userId })
    })
    return { success: true, status: 'deactivated' }
  }

  async reactivatePharmacist(user: AuthenticatedUser, userId: string) {
    const ctx = await this.context(user)
    const cur = await this.ownPharmacist(ctx, userId)
    if (cur.status !== 'deactivated') {
      throw new ConflictException({ success: false, errorMessage: 'Only a deactivated account can be reactivated.' })
    }
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE identity.app_user SET status = 'active'::identity.account_status, status_reason = NULL, deactivated_at = NULL
          WHERE id = $1::uuid`,
        [userId],
      )
      await auditPharmacy(c, ctx, 'staff.reactivate', `${cur.full_name} reactivated`, { entityType: 'user', entityId: userId })
    })
    return { success: true, status: 'active' }
  }

  async invite(user: AuthenticatedUser, body: { fullName: string; email: string; registrationNo: string; shift: string }) {
    const ctx = await this.context(user)
    const key = this.config.get<string>('EMAIL_HASH_KEY', 'demo-email-hash-key')
    const emailHash = createHmac('sha256', key).update(body.email.toLowerCase()).digest()
    const token = randomBytes(24).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest()
    const id = await withPharmacyTx(this.db, ctx, async (c) => {
      const dup = await c.query(
        `SELECT 1 FROM identity.staff_invite WHERE pharmacy_id = $1::uuid AND email_hash = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [ctx.pharmacyId, emailHash],
      )
      if (dup.rowCount) throw new ConflictException({ success: false, errorMessage: 'This person already has an open invite.' })
      const r = await c.query<{ id: string }>(
        `INSERT INTO identity.staff_invite
           (pharmacy_id, role_kind, full_name, email_hash, registration_no, shift, token_hash, invited_by_user_id)
         VALUES ($1::uuid, 'pharmacist', $2, $3, $4, $5, $6, $7::uuid) RETURNING id`,
        [ctx.pharmacyId, body.fullName, emailHash, body.registrationNo, body.shift, tokenHash, ctx.userId],
      )
      await auditPharmacy(c, ctx, 'staff.invite', `${body.fullName} invited as pharmacist`, { entityType: 'staff_invite', entityId: r.rows[0]!.id })
      return r.rows[0]!.id
    })
    return {
      success: true,
      inviteId: id,
      // Mock: a real deployment e-mails this link; the token itself is never stored.
      mockActivationLink: `https://demo.carefusion.invalid/activate/${token}`,
    }
  }

  private async ownInvite(ctx: PharmacyContext, id: string) {
    const r = await this.db.query<{ accepted_at: Date | null; revoked_at: Date | null; full_name: string }>(
      `SELECT accepted_at, revoked_at, full_name FROM identity.staff_invite WHERE id = $1::uuid AND pharmacy_id = $2::uuid`,
      [id, ctx.pharmacyId],
    )
    if (!r[0]) throw new NotFoundException({ success: false, errorMessage: 'Invite not found in your pharmacy.' })
    if (r[0].accepted_at || r[0].revoked_at) {
      throw new ConflictException({ success: false, errorMessage: 'This invite is no longer open.' })
    }
    return r[0]
  }

  async resendInvite(user: AuthenticatedUser, id: string) {
    const ctx = await this.context(user)
    const inv = await this.ownInvite(ctx, id)
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE identity.staff_invite SET last_sent_at = now(), resend_count = resend_count + 1, expires_at = now() + interval '7 days'
          WHERE id = $1::uuid AND pharmacy_id = $2::uuid`,
        [id, ctx.pharmacyId],
      )
      await auditPharmacy(c, ctx, 'staff.invite_resent', `Invite resent to ${inv.full_name}`, { entityType: 'staff_invite', entityId: id })
    })
    return { success: true }
  }

  async revokeInvite(user: AuthenticatedUser, id: string) {
    const ctx = await this.context(user)
    const inv = await this.ownInvite(ctx, id)
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(`UPDATE identity.staff_invite SET revoked_at = now() WHERE id = $1::uuid AND pharmacy_id = $2::uuid`, [id, ctx.pharmacyId])
      await auditPharmacy(c, ctx, 'staff.invite_revoked', `Invite to ${inv.full_name} revoked`, { entityType: 'staff_invite', entityId: id })
    })
    return { success: true }
  }

  // ------------------------------------------------------------------ licence and compliance

  async compliance(user: AuthenticatedUser) {
    const ctx = await this.context(user)
    const now = demoNow(this.config).toISOString()
    const [ph, docs] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT licence_no, licence_valid_until, compliance_score, last_inspection_on, next_inspection_due
           FROM org.pharmacy WHERE id = $1::uuid`,
        [ctx.pharmacyId],
      ),
      this.db.query<Record<string, any>>(
        `SELECT id, doc_type, title, reference_no, valid_from, valid_until, status, uploaded_at, verified_at,
                (valid_until - ${istDate('$2')}) AS days_left
           FROM org.facility_document WHERE pharmacy_id = $1::uuid ORDER BY valid_until NULLS LAST, uploaded_at`,
        [ctx.pharmacyId, now],
      ),
    ])
    const r = ph[0]!
    return {
      licence: { number: r.licence_no, validUntil: day(r.licence_valid_until) },
      complianceScore: r.compliance_score,
      lastInspectionOn: day(r.last_inspection_on),
      nextInspectionDue: day(r.next_inspection_due),
      documents: docs.map((d) => ({
        id: d.id,
        docType: d.doc_type,
        title: d.title,
        referenceNo: d.reference_no,
        validFrom: day(d.valid_from),
        validUntil: day(d.valid_until),
        daysLeft: d.days_left === null ? null : Number(d.days_left),
        status: d.days_left !== null && Number(d.days_left) < 0 && ['verified', 'renew_soon', 'upcoming'].includes(d.status) ? 'expired' : d.status,
        uploadedAt: iso(d.uploaded_at),
        verifiedAt: iso(d.verified_at),
      })),
    }
  }

  async addDocument(
    user: AuthenticatedUser,
    body: { docType: string; title: string; referenceNo?: string; validFrom?: string; validUntil?: string },
  ) {
    const ctx = await this.context(user)
    const id = await withPharmacyTx(this.db, ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO org.facility_document
           (facility_type, pharmacy_id, doc_type, title, reference_no, valid_from, valid_until, status, uploaded_by_user_id)
         VALUES ('pharmacy', $1::uuid, $2, $3, $4, $5::date, $6::date, 'under_review', $7::uuid) RETURNING id`,
        [ctx.pharmacyId, body.docType, body.title, body.referenceNo ?? null, body.validFrom ?? null, body.validUntil ?? null, ctx.userId],
      )
      await auditPharmacy(c, ctx, 'stock.document_uploaded', `Compliance document uploaded · ${body.title}`, {
        entityType: 'facility_document',
        entityId: r.rows[0]!.id,
      })
      return r.rows[0]!.id
    })
    return { success: true, id, status: 'under_review' }
  }

  // ------------------------------------------------------------------ audit log

  async auditLog(user: AuthenticatedUser, q: { group?: 'rx' | 'stock' | 'staff'; limit: number; beforeSeq?: number }) {
    const ctx = await this.context(user)
    const r = await withPharmacyTx(this.db, ctx, (c) =>
      c.query(
        `SELECT seq, occurred_at, actor, account_type::text AS account_type, action, details ->> 'summary' AS summary
           FROM audit.v_scoped_log
          WHERE ($2::bigint IS NULL OR seq < $2::bigint)
            AND ( $3::text IS NULL
               OR ($3 = 'rx' AND action ~ $4) OR ($3 = 'stock' AND action ~ $5) OR ($3 = 'staff' AND action ~ $6))
          ORDER BY seq DESC LIMIT $1`,
        [q.limit, q.beforeSeq ?? null, q.group ?? null, AUDIT_RX, AUDIT_STOCK, AUDIT_STAFF],
      ),
    )
    const items = r.rows.map((x) => ({
      seq: Number(x.seq),
      at: iso(x.occurred_at),
      actor: x.actor ?? 'System',
      actorType: x.account_type,
      action: x.action,
      summary: x.summary ?? x.action,
      group: pharmacyAuditGroup(x.action),
    }))
    return { retentionYears: 7, items, nextBeforeSeq: items.length === q.limit ? items[items.length - 1]!.seq : null }
  }

  // ------------------------------------------------------------------ profile

  async profile(user: AuthenticatedUser) {
    const ctx = await this.context(user)
    const [ph, link, sync] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT p.id, p.name, p.licence_no, p.pharmacy_type::text AS pharmacy_type, p.address, p.opening_hours,
                p.stock_source::text AS stock_source, p.counters, p.is_jan_aushadhi, p.licence_valid_until, p.status::text AS status,
                h.name AS linked_hospital, d.name AS district
           FROM org.pharmacy p JOIN geo.district d ON d.id = p.district_id
           LEFT JOIN org.hospital h ON h.id = p.linked_hospital_id WHERE p.id = $1::uuid`,
        [ctx.pharmacyId],
      ),
      this.db.query<Record<string, any>>(`SELECT vendor, last_sync_at, last_sync_status FROM pharmacy.software_link WHERE pharmacy_id = $1::uuid`, [ctx.pharmacyId]),
      this.db.query<Record<string, any>>(
        `SELECT started_at, finished_at, status, rows_synced FROM pharmacy.stock_sync_run WHERE pharmacy_id = $1::uuid ORDER BY started_at DESC LIMIT 1`,
        [ctx.pharmacyId],
      ),
    ])
    const r = ph[0]!
    return {
      id: r.id,
      name: r.name,
      licenceNo: r.licence_no,
      licenceValidUntil: day(r.licence_valid_until),
      type: r.pharmacy_type,
      status: r.status,
      address: r.address,
      district: r.district,
      linkedHospital: r.linked_hospital,
      openingHours: r.opening_hours,
      stockSource: r.stock_source,
      counters: r.counters,
      isJanAushadhi: r.is_jan_aushadhi,
      billingLink: link[0] ? { vendor: link[0].vendor, lastSyncAt: iso(link[0].last_sync_at), lastSyncStatus: link[0].last_sync_status } : null,
      lastSyncRun: sync[0] ? { startedAt: iso(sync[0].started_at), finishedAt: iso(sync[0].finished_at), status: sync[0].status, rowsSynced: sync[0].rows_synced } : null,
      lockedFields: ['name', 'licenceNo', 'type', 'address'],
    }
  }

  async updateOpeningHours(user: AuthenticatedUser, openingHours: Record<string, unknown>) {
    const ctx = await this.context(user)
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(`UPDATE org.pharmacy SET opening_hours = $2::jsonb WHERE id = $1::uuid`, [ctx.pharmacyId, JSON.stringify(openingHours)])
      await auditPharmacy(c, ctx, 'staff.profile_hours', 'Opening hours updated', { entityType: 'pharmacy', entityId: ctx.pharmacyId })
    })
    return { success: true, openingHours }
  }
}
