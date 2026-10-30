import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'
import { demoNow } from '../hospital-admin/hospital-context'
import { PharmacyContext, auditPharmacy, resolvePharmacyContext, withPharmacyTx } from './pharmacy-context'

const istDate = (p: string) => `(${p}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null)

/** Orders above this amount need the pharmacy admin's approval (migration 124, constraint po_needs_approval). */
export const PO_APPROVAL_THRESHOLD = 100000

@Injectable()
export class PharmacyStockService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private ctxOf(user: AuthenticatedUser): Promise<PharmacyContext> {
    return resolvePharmacyContext(this.db, user)
  }

  // ------------------------------------------------------------------ inventory

  async inventory(
    user: AuthenticatedUser,
    q: { filter: 'all' | 'low' | 'hidden' | 'blocked'; category?: string; q?: string; limit: number; offset: number },
  ) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const where = `
      s.pharmacy_id = $1::uuid
      AND ($2::text IS NULL OR m.category = $2::text)
      AND ($3::text IS NULL OR m.generic_name ILIKE '%' || $3::text || '%' OR s.batch_no ILIKE '%' || $3::text || '%')
      AND ( $4::text = 'all'
         OR ($4 = 'low' AND s.quantity < s.low_threshold AND s.blocked_reason IS NULL)
         OR ($4 = 'hidden' AND (NOT s.is_published OR s.blocked_reason IS NOT NULL))
         OR ($4 = 'blocked' AND s.blocked_reason IS NOT NULL) )`
    const [rows, count, total, categories] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT s.id, m.generic_name, m.strength, m.form, m.category, m.schedule::text AS schedule, s.batch_no, s.quantity,
                s.low_threshold, s.expiry_date, s.is_published, s.blocked_reason, s.unit_price, s.mrp,
                (s.expiry_date < ${istDate('$5')}) AS expired
           FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
          WHERE ${where}
          ORDER BY (s.blocked_reason IS NOT NULL) DESC, m.generic_name, s.expiry_date
          LIMIT $6 OFFSET $7`,
        [ctx.pharmacyId, q.category ?? null, q.q ?? null, q.filter, now, q.limit, q.offset],
      ),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
          WHERE ${where}`,
        [ctx.pharmacyId, q.category ?? null, q.q ?? null, q.filter],
      ),
      this.db.query<{ batches: number; skus: number }>(
        `SELECT count(*)::int AS batches, count(DISTINCT medicine_id)::int AS skus FROM pharmacy.stock_item WHERE pharmacy_id = $1::uuid`,
        [ctx.pharmacyId],
      ),
      this.db.query<{ category: string }>(
        `SELECT DISTINCT m.category FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
          WHERE s.pharmacy_id = $1::uuid AND m.category IS NOT NULL ORDER BY 1`,
        [ctx.pharmacyId],
      ),
    ])
    return {
      showing: rows.length,
      matching: count[0]?.n ?? 0,
      totalBatches: total[0]?.batches ?? 0,
      totalSkus: total[0]?.skus ?? 0,
      categories: categories.map((c) => c.category),
      items: rows.map((r) => {
        const qty = num(r.quantity)
        const min = num(r.low_threshold)
        const level = r.blocked_reason ? 'blocked' : r.expired ? 'expired' : qty < min ? 'low' : 'ok'
        return {
          id: r.id,
          medicine: `${r.generic_name} ${r.strength}`,
          form: r.form,
          category: r.category,
          schedule: r.schedule,
          batchNo: r.batch_no,
          onHand: qty,
          min,
          expiry: day(r.expiry_date),
          unitPrice: num(r.unit_price),
          published: r.is_published && !r.blocked_reason,
          blockedReason: r.blocked_reason,
          level,
        }
      }),
    }
  }

  private async ownBatch(ctx: PharmacyContext, id: string) {
    const r = await this.db.query<{ blocked_reason: string | null; name: string; is_published: boolean }>(
      `SELECT s.blocked_reason, s.is_published, m.generic_name || ' ' || m.strength AS name
         FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
        WHERE s.id = $1::uuid AND s.pharmacy_id = $2::uuid`,
      [id, ctx.pharmacyId],
    )
    if (!r[0]) throw new NotFoundException({ success: false, errorMessage: 'Stock batch not found in your pharmacy.' })
    return r[0]
  }

  async setPublished(user: AuthenticatedUser, id: string, published: boolean) {
    const ctx = await this.ctxOf(user)
    const b = await this.ownBatch(ctx, id)
    if (b.blocked_reason && published) {
      throw new ConflictException({ success: false, errorMessage: `This batch is blocked (${b.blocked_reason}) and cannot be shown in the public finder.` })
    }
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query('UPDATE pharmacy.stock_item SET is_published = $2 WHERE id = $1::uuid AND pharmacy_id = $3::uuid', [id, published, ctx.pharmacyId])
      await auditPharmacy(c, ctx, 'stock.publish', `${b.name} ${published ? 'shown in' : 'hidden from'} public finder`, {
        entityType: 'stock_item',
        entityId: id,
      })
    })
    return { success: true, published }
  }

  async adjust(
    user: AuthenticatedUser,
    id: string,
    body: { type: 'adjustment' | 'write_off' | 'return_to_supplier' | 'quarantine'; quantity: number; direction: 'in' | 'out'; reason: string },
  ) {
    const ctx = await this.ctxOf(user)
    const b = await this.ownBatch(ctx, id)
    const delta = body.type === 'adjustment' && body.direction === 'in' ? body.quantity : -body.quantity
    const newQty = await withPharmacyTx(this.db, ctx, async (c) => {
      const cur = await c.query<{ quantity: string }>('SELECT quantity FROM pharmacy.stock_item WHERE id = $1::uuid AND pharmacy_id = $2::uuid FOR UPDATE', [
        id,
        ctx.pharmacyId,
      ])
      if (Number(cur.rows[0]!.quantity) + delta < 0) {
        throw new BadRequestException({ success: false, errorMessage: `Not enough stock. ${cur.rows[0]!.quantity} on hand.` })
      }
      await c.query(
        `INSERT INTO pharmacy.stock_movement (pharmacy_id, stock_item_id, movement_type, quantity_delta, reason, by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::pharmacy.movement_type, $4::numeric, $5, $6::uuid)`,
        [ctx.pharmacyId, id, body.type, delta, body.reason, ctx.userId],
      )
      await auditPharmacy(c, ctx, 'stock.adjust', `${b.name} · ${body.type.replace(/_/g, ' ')} ${delta > 0 ? '+' : ''}${delta} · ${body.reason}`, {
        entityType: 'stock_item',
        entityId: id,
      })
      const after = await c.query<{ quantity: string }>('SELECT quantity FROM pharmacy.stock_item WHERE id = $1::uuid', [id])
      return Number(after.rows[0]!.quantity)
    })
    return { success: true, onHand: newQty }
  }

  // ------------------------------------------------------------------ purchase orders

  async listPurchaseOrders(user: AuthenticatedUser, status?: string) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const [rows, kpi] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT po.id, po.po_number, po.status, po.total_amount, po.expected_on, po.created_at, po.is_indent, po.hold_reason,
                po.approved_at, po.received_at, s.name AS supplier, rp.full_name AS raised_by,
                (SELECT count(*) FROM pharmacy.po_line l WHERE l.po_id = po.id)::int AS lines
           FROM pharmacy.purchase_order po
           JOIN pharmacy.supplier s ON s.id = po.supplier_id
           JOIN identity.app_user ru ON ru.id = po.raised_by_user_id
           JOIN identity.person rp ON rp.id = ru.person_id
          WHERE po.pharmacy_id = $1::uuid AND ($2::text IS NULL OR po.status = $2::text)
          ORDER BY po.created_at DESC LIMIT 200`,
        [ctx.pharmacyId, status ?? null],
      ),
      this.db.query<Record<string, any>>(
        `SELECT count(*) FILTER (WHERE status = 'pending_approval')::int AS awaiting,
                count(*) FILTER (WHERE status IN ('sent','in_transit'))::int AS in_transit,
                coalesce(sum(total_amount) FILTER (WHERE status NOT IN ('draft','cancelled','held')
                          AND created_at >= date_trunc('month', $2::timestamptz) AND created_at <= $2::timestamptz), 0)::numeric(14,2) AS spend_month,
                count(*) FILTER (WHERE status = 'received' AND received_at IS NOT NULL AND expected_on IS NOT NULL)::int AS received_dated,
                count(*) FILTER (WHERE status = 'received' AND received_at IS NOT NULL AND expected_on IS NOT NULL
                                  AND (received_at AT TIME ZONE 'Asia/Kolkata')::date <= expected_on)::int AS on_time
           FROM pharmacy.purchase_order WHERE pharmacy_id = $1::uuid`,
        [ctx.pharmacyId, now],
      ),
    ])
    const k = kpi[0]!
    return {
      approvalThreshold: PO_APPROVAL_THRESHOLD,
      kpis: {
        awaitingApproval: k.awaiting,
        inTransit: k.in_transit,
        spendThisMonth: num(k.spend_month),
        onTimeDeliveryPct: k.received_dated > 0 ? Math.round((100 * k.on_time) / k.received_dated) : null,
      },
      items: rows.map((r) => this.toPo(r)),
    }
  }

  private toPo(r: Record<string, any>) {
    return {
      id: r.id,
      poNumber: r.po_number,
      supplier: r.supplier,
      lines: r.lines,
      amount: num(r.total_amount),
      raisedBy: r.raised_by,
      date: day(r.created_at),
      expectedOn: day(r.expected_on),
      isIndent: r.is_indent,
      status: r.status,
      holdReason: r.hold_reason,
      needsApproval: num(r.total_amount) > PO_APPROVAL_THRESHOLD,
      approvedAt: iso(r.approved_at),
      receivedAt: iso(r.received_at),
    }
  }

  private async loadPo(ctx: PharmacyContext, id: string) {
    const r = await this.db.query<Record<string, any>>(
      `SELECT po.id, po.po_number, po.status, po.total_amount, po.expected_on, po.created_at, po.is_indent, po.hold_reason,
              po.approved_at, po.received_at, po.raised_by_user_id, s.name AS supplier, rp.full_name AS raised_by,
              (SELECT count(*) FROM pharmacy.po_line l WHERE l.po_id = po.id)::int AS lines
         FROM pharmacy.purchase_order po
         JOIN pharmacy.supplier s ON s.id = po.supplier_id
         JOIN identity.app_user ru ON ru.id = po.raised_by_user_id
         JOIN identity.person rp ON rp.id = ru.person_id
        WHERE po.id = $1::uuid AND po.pharmacy_id = $2::uuid`,
      [id, ctx.pharmacyId],
    )
    if (!r[0]) throw new NotFoundException({ success: false, errorMessage: 'Purchase order not found in your pharmacy.' })
    return r[0]
  }

  async purchaseOrder(user: AuthenticatedUser, id: string) {
    const ctx = await this.ctxOf(user)
    const po = await this.loadPo(ctx, id)
    const lines = await this.db.query<Record<string, any>>(
      `SELECT l.id, m.generic_name || ' ' || m.strength AS medicine, l.quantity, l.unit_cost, l.line_total, l.received_qty
         FROM pharmacy.po_line l JOIN pharmacy.medicine m ON m.id = l.medicine_id WHERE l.po_id = $1::uuid ORDER BY l.line_total DESC`,
      [id],
    )
    return {
      ...this.toPo(po),
      canApprove: po.status === 'pending_approval' && po.raised_by_user_id !== ctx.userId,
      lineItems: lines.map((l) => ({
        id: l.id,
        medicine: l.medicine,
        quantity: num(l.quantity),
        unitCost: num(l.unit_cost),
        lineTotal: num(l.line_total),
        receivedQty: num(l.received_qty),
      })),
    }
  }

  async suppliers(user: AuthenticatedUser) {
    await this.ctxOf(user)
    const rows = await this.db.query<Record<string, any>>(`SELECT id, name, kind FROM pharmacy.supplier WHERE is_active ORDER BY name`)
    return rows
  }

  async createPurchaseOrder(
    user: AuthenticatedUser,
    body: { supplierId: string; expectedOn?: string; isIndent: boolean; lines: { medicineId: string; quantity: number; unitCost: number }[] },
  ) {
    const ctx = await this.ctxOf(user)
    const ids = body.lines.map((l) => l.medicineId)
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({ success: false, errorMessage: 'Each medicine can appear only once in an order.' })
    }
    const result = await withPharmacyTx(this.db, ctx, async (c) => {
      const sup = await c.query('SELECT 1 FROM pharmacy.supplier WHERE id = $1::uuid AND is_active', [body.supplierId])
      if (!sup.rowCount) throw new BadRequestException({ success: false, errorMessage: 'Supplier not found.' })
      const po = await c.query<{ id: string }>(
        `INSERT INTO pharmacy.purchase_order (pharmacy_id, supplier_id, is_indent, status, raised_by_user_id, expected_on)
         VALUES ($1::uuid, $2::uuid, $3, 'draft', $4::uuid, $5::date) RETURNING id`,
        [ctx.pharmacyId, body.supplierId, body.isIndent, ctx.userId, body.expectedOn ?? null],
      )
      const id = po.rows[0]!.id
      for (const l of body.lines) {
        await c.query(`INSERT INTO pharmacy.po_line (po_id, medicine_id, quantity, unit_cost) VALUES ($1::uuid, $2::uuid, $3, $4)`, [
          id,
          l.medicineId,
          l.quantity,
          l.unitCost,
        ])
      }
      const tot = await c.query<{ total_amount: string; po_number: string }>('SELECT total_amount, po_number FROM pharmacy.purchase_order WHERE id = $1::uuid', [id])
      const total = Number(tot.rows[0]!.total_amount)
      // Small orders go straight out; big ones wait for an approver who is not the person who raised them.
      const status = total > PO_APPROVAL_THRESHOLD ? 'pending_approval' : 'approved'
      await c.query('UPDATE pharmacy.purchase_order SET status = $2, approved_at = CASE WHEN $2 = \'approved\' THEN now() END WHERE id = $1::uuid', [id, status])
      await auditPharmacy(c, ctx, 'stock.po_raised', `${tot.rows[0]!.po_number} raised · ₹${total.toLocaleString('en-IN')}`, { entityType: 'purchase_order', entityId: id })
      return { id, poNumber: tot.rows[0]!.po_number, total, status }
    })
    return { success: true, ...result }
  }

  async approvePurchaseOrder(user: AuthenticatedUser, id: string) {
    const ctx = await this.ctxOf(user)
    const po = await this.loadPo(ctx, id)
    if (po.status !== 'pending_approval') {
      throw new ConflictException({ success: false, errorMessage: 'This order is not waiting for approval.' })
    }
    if (po.raised_by_user_id === ctx.userId) {
      throw new ConflictException({ success: false, errorMessage: 'The person who raised an order cannot approve it.' })
    }
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE pharmacy.purchase_order SET status = 'approved', approved_by_user_id = $2::uuid, approved_at = now(), hold_reason = NULL
          WHERE id = $1::uuid AND pharmacy_id = $3::uuid AND status = 'pending_approval'`,
        [id, ctx.userId, ctx.pharmacyId],
      )
      await auditPharmacy(c, ctx, 'stock.po_approved', `${po.po_number} approved · ${po.supplier}`, { entityType: 'purchase_order', entityId: id })
    })
    return { success: true, status: 'approved' }
  }

  async sendBackPurchaseOrder(user: AuthenticatedUser, id: string, reason: string) {
    const ctx = await this.ctxOf(user)
    const po = await this.loadPo(ctx, id)
    if (po.status !== 'pending_approval') {
      throw new ConflictException({ success: false, errorMessage: 'This order is not waiting for approval.' })
    }
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE pharmacy.purchase_order SET status = 'held', hold_reason = $2 WHERE id = $1::uuid AND pharmacy_id = $3::uuid AND status = 'pending_approval'`,
        [id, reason, ctx.pharmacyId],
      )
      await auditPharmacy(c, ctx, 'stock.po_held', `${po.po_number} sent back to ${po.raised_by} · ${reason}`, { entityType: 'purchase_order', entityId: id })
    })
    return { success: true, status: 'held' }
  }

  // ------------------------------------------------------------------ recalls

  async recalls(user: AuthenticatedUser) {
    const ctx = await this.ctxOf(user)
    const rows = await this.db.query<Record<string, any>>(
      `SELECT r.id, r.recall_ref, r.source, r.medicine_name, r.batch_no, r.recall_class, r.issued_on, r.title, r.reason,
              r.urgent, r.action_text, r.notice_key IS NOT NULL AS has_notice,
              a.status, a.qty_on_shelf, a.confirmed_at, a.note, cp.full_name AS confirmed_by
         FROM pharmacy.recall_ack a
         JOIN pharmacy.drug_recall r ON r.id = a.recall_id
         LEFT JOIN identity.app_user cu ON cu.id = a.confirmed_by_user_id
         LEFT JOIN identity.person cp ON cp.id = cu.person_id
        WHERE a.pharmacy_id = $1::uuid ORDER BY r.urgent DESC, r.issued_on DESC`,
      [ctx.pharmacyId],
    )
    return {
      actionNeeded: rows.filter((r) => r.status === 'action_needed' || r.status === 'review').length,
      items: rows.map((r) => ({
        id: r.id,
        ref: r.recall_ref,
        source: r.source,
        title: r.title,
        medicine: r.medicine_name,
        batchNo: r.batch_no,
        recallClass: r.recall_class,
        issuedOn: day(r.issued_on),
        reason: r.reason,
        urgent: r.urgent,
        actionText: r.action_text,
        hasNotice: r.has_notice,
        status: r.status,
        qtyOnShelf: num(r.qty_on_shelf),
        confirmedAt: iso(r.confirmed_at),
        confirmedBy: r.confirmed_by,
        note: r.note,
      })),
    }
  }

  private async ownAck(ctx: PharmacyContext, recallId: string) {
    const r = await this.db.query<Record<string, any>>(
      `SELECT r.id, r.recall_ref, r.recall_class, r.medicine_id, r.batch_no, r.medicine_name, a.status
         FROM pharmacy.recall_ack a JOIN pharmacy.drug_recall r ON r.id = a.recall_id
        WHERE a.recall_id = $1::uuid AND a.pharmacy_id = $2::uuid`,
      [recallId, ctx.pharmacyId],
    )
    if (!r[0]) throw new NotFoundException({ success: false, errorMessage: 'This recall does not apply to your pharmacy.' })
    return r[0]
  }

  /**
   * Confirms the batch is off the shelf. pharmacy.apply_recall() (block batches, open an acknowledgement per pharmacy)
   * is central-admin or system only (CF131), so the pharmacy side only acknowledges, and makes sure its own matching
   * batches are blocked and hidden from the public finder.
   */
  async confirmRecall(user: AuthenticatedUser, recallId: string, note?: string) {
    const ctx = await this.ctxOf(user)
    const rc = await this.ownAck(ctx, recallId)
    if (rc.status === 'confirmed_off_shelf') {
      throw new ConflictException({ success: false, errorMessage: 'Already confirmed off shelf.' })
    }
    await withPharmacyTx(this.db, ctx, async (c) => {
      await c.query(
        `UPDATE pharmacy.recall_ack SET status = 'confirmed_off_shelf', confirmed_by_user_id = $3::uuid, confirmed_at = now(), note = $4
          WHERE recall_id = $1::uuid AND pharmacy_id = $2::uuid`,
        [recallId, ctx.pharmacyId, ctx.userId, note ?? null],
      )
      if (rc.recall_class !== 'notice' && rc.medicine_id && rc.batch_no) {
        await c.query(
          `UPDATE pharmacy.stock_item SET blocked_reason = 'Recall ' || $4::text, blocked_at = now(), is_published = false
            WHERE pharmacy_id = $1::uuid AND medicine_id = $2::uuid AND batch_no = $3 AND blocked_reason IS NULL`,
          [ctx.pharmacyId, rc.medicine_id, rc.batch_no, rc.recall_ref],
        )
      }
      await auditPharmacy(c, ctx, 'stock.recall_confirmed', `${rc.medicine_name}${rc.batch_no ? ` batch ${rc.batch_no}` : ''} confirmed off shelf (${rc.recall_ref})`, {
        entityType: 'drug_recall',
        entityId: recallId,
      })
    })
    return { success: true, status: 'confirmed_off_shelf' }
  }

  async undoRecall(user: AuthenticatedUser, recallId: string) {
    const ctx = await this.ctxOf(user)
    const rc = await this.ownAck(ctx, recallId)
    if (rc.status !== 'confirmed_off_shelf') {
      throw new ConflictException({ success: false, errorMessage: 'Nothing to undo: this recall is not confirmed.' })
    }
    const back = rc.recall_class === 'notice' ? 'review' : 'action_needed'
    await withPharmacyTx(this.db, ctx, async (c) => {
      // Batches stay blocked: only a recall action by central admin lifts a block.
      await c.query(
        `UPDATE pharmacy.recall_ack SET status = $3, confirmed_by_user_id = NULL, confirmed_at = NULL, note = NULL
          WHERE recall_id = $1::uuid AND pharmacy_id = $2::uuid`,
        [recallId, ctx.pharmacyId, back],
      )
      await auditPharmacy(c, ctx, 'stock.recall_unconfirmed', `Confirmation undone for ${rc.recall_ref}`, { entityType: 'drug_recall', entityId: recallId })
    })
    return { success: true, status: back }
  }

  // ------------------------------------------------------------------ expiry watch

  async expiry(user: AuthenticatedUser) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const base = `FROM pharmacy.stock_item s JOIN pharmacy.medicine m ON m.id = s.medicine_id
                  WHERE s.pharmacy_id = $1::uuid AND s.quantity > 0`
    const [soon, months, summary, ret] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT m.generic_name || ' ' || m.strength AS medicine, s.batch_no, s.quantity, s.expiry_date,
                (s.quantity * coalesce(s.cost, s.unit_price))::numeric(14,2) AS value,
                (s.expiry_date - ${istDate('$2')}) AS days_left,
                CASE WHEN s.expiry_date < ${istDate('$2')} THEN 'expired'
                     WHEN s.expiry_date <= ${istDate('$2')} + 30 THEN 'within_30_days' ELSE 'within_90_days' END AS bucket
           ${base} AND s.expiry_date <= ${istDate('$2')} + 90 ORDER BY s.expiry_date, m.generic_name LIMIT 100`,
        [ctx.pharmacyId, now],
      ),
      this.db.query<Record<string, any>>(
        `SELECT to_char(date_trunc('month', s.expiry_date), 'YYYY-MM') AS month,
                coalesce(sum(s.quantity * coalesce(s.cost, s.unit_price)), 0)::numeric(14,2) AS value, count(*)::int AS batches
           ${base} AND s.expiry_date >= date_trunc('month', ${istDate('$2')}) AND s.expiry_date < date_trunc('month', ${istDate('$2')}) + interval '4 months'
          GROUP BY 1 ORDER BY 1`,
        [ctx.pharmacyId, now],
      ),
      this.db.query<Record<string, any>>(
        `SELECT count(*) FILTER (WHERE s.expiry_date < ${istDate('$2')})::int AS expired,
                count(*) FILTER (WHERE s.expiry_date BETWEEN ${istDate('$2')} AND ${istDate('$2')} + 30)::int AS within_30,
                count(*) FILTER (WHERE s.expiry_date BETWEEN ${istDate('$2')} + 31 AND ${istDate('$2')} + 90)::int AS within_90,
                coalesce(sum(s.quantity * coalesce(s.cost, s.unit_price)) FILTER (WHERE s.expiry_date BETWEEN ${istDate('$2')} AND ${istDate('$2')} + 30), 0)::numeric(14,2) AS value_30
           ${base}`,
        [ctx.pharmacyId, now],
      ),
      // Suppliers take returns up to 60 days before expiry: batches expiring in 60-90 days can still go back.
      this.db.query<{ n: number; value: string }>(
        `SELECT count(*)::int AS n, coalesce(sum(s.quantity * coalesce(s.cost, s.unit_price)), 0)::numeric(14,2) AS value
           ${base} AND s.blocked_reason IS NULL AND s.expiry_date BETWEEN ${istDate('$2')} + 60 AND ${istDate('$2')} + 90`,
        [ctx.pharmacyId, now],
      ),
    ])
    const s = summary[0]!
    return {
      summary: { expired: s.expired, within30Days: s.within_30, within90Days: s.within_90, valueWithin30Days: num(s.value_30) },
      byMonth: months.map((m) => ({ month: m.month, value: num(m.value), batches: m.batches })),
      returnable: { batches: ret[0]?.n ?? 0, value: num(ret[0]?.value), rule: 'Suppliers accept returns up to 60 days before expiry.' },
      batches: soon.map((r) => ({
        medicine: r.medicine,
        batchNo: r.batch_no,
        quantity: num(r.quantity),
        expiry: day(r.expiry_date),
        daysLeft: Number(r.days_left),
        value: num(r.value),
        bucket: r.bucket,
      })),
    }
  }
}
