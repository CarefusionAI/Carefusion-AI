import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { CreateOrderRequest, OrderRow } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { DoctorDbService, DoctorTx, toIso } from './doctor-db.service'
import { loadHeader, requireLiveSession } from './session.helpers'

const IMAGING_CATALOGUE = [
  { name: 'Chest X-ray PA', modality: 'XR', bodyPart: 'Chest', view: 'PA' },
  { name: 'Chest X-ray PA + lateral', modality: 'XR', bodyPart: 'Chest', view: 'PA + lateral' },
  { name: 'X-ray wrist AP/LAT', modality: 'XR', bodyPart: 'Wrist', view: 'AP + lateral' },
  { name: 'USG abdomen', modality: 'USG', bodyPart: 'Abdomen', view: null },
  { name: 'USG thyroid', modality: 'USG', bodyPart: 'Thyroid', view: null },
  { name: 'CT head, plain', modality: 'CT', bodyPart: 'Head', view: 'plain' },
  { name: 'CT abdomen with contrast', modality: 'CT', bodyPart: 'Abdomen', view: 'with contrast' },
  { name: 'MRI brain', modality: 'MRI', bodyPart: 'Brain', view: null },
  { name: 'Echocardiogram', modality: 'ECHO', bodyPart: 'Heart', view: null },
]

function guessImaging(name: string) {
  const known = IMAGING_CATALOGUE.find((i) => i.name.toLowerCase() === name.toLowerCase())
  if (known) return known
  const n = name.toLowerCase()
  const modality = /\bct\b/.test(n) ? 'CT' : /mri/.test(n) ? 'MRI' : /usg|ultrasound/.test(n) ? 'USG' : /echo/.test(n) ? 'ECHO' : /x-?ray|cxr/.test(n) ? 'XR' : null
  if (!modality) throw new BadRequestException(`Unknown imaging study "${name}"`)
  const bodyPart = name.replace(/\b(ct|mri|usg|ultrasound|x-?ray|echo\w*|pa|ap|lat\w*|with contrast|plain)\b/gi, '').replace(/[,+/]/g, ' ').trim() || 'Not specified'
  return { name, modality, bodyPart: bodyPart.charAt(0).toUpperCase() + bodyPart.slice(1), view: null }
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Ordered',
  accepted: 'Accepted',
  in_progress: 'In progress',
  done: 'Result back',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

@Injectable()
export class OrdersService {
  constructor(private readonly db: DoctorDbService) {}

  async catalogue(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const tests = await tx.query<any>(`SELECT code::text AS code, name, category, specimen_type, fasting_required, unit FROM lab.test_catalogue WHERE is_active ORDER BY category, name`)
      const panels = await tx.query<any>(
        `SELECT p.code::text AS code, p.name, (SELECT array_agg(pt.test_code::text ORDER BY pt.sort_order) FROM lab.panel_test pt WHERE pt.panel_code = p.code) AS tests
           FROM lab.panel p WHERE p.is_active ORDER BY p.name`,
      )
      return {
        lab: { tests: tests.map((t) => ({ code: t.code, name: t.name, category: t.category, specimen: t.specimen_type, fastingRequired: t.fasting_required, unit: t.unit })), panels },
        imaging: IMAGING_CATALOGUE.map((i) => ({ name: i.name, modality: i.modality, bodyPart: i.bodyPart })),
        priorities: ['routine', 'urgent', 'stat'],
      }
    })
  }

  /** Create a lab order (one order, many tests) or imaging orders (one order per study). */
  async create(user: AuthenticatedUser | undefined, sessionId: string, body: CreateOrderRequest) {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId, { write: true })
      const hospitalId = await tx.hospitalId()
      const patient = await loadHeader(tx, s.patientPersonId)
      const doctor = await tx.one<{ full_name: string }>(`SELECT p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id WHERE u.id = util.ctx_user_id()`)
      const created: { id: string; orderRef: string; kind: string; details: string }[] = []

      if (body.kind === 'lab') {
        const resolved = await this.resolveLabTests(tx, body.tests)
        const dept = await this.deptId(tx, hospitalId, 'Laboratory')
        const details = body.tests.join(', ')
        const o = await this.insertOrder(tx, s.id, s.patientPersonId, hospitalId, dept, 'lab', details, body.priority, body.note)
        await tx.asOwner(async () => {
          for (const r of resolved) {
            await tx.query(`INSERT INTO lab.order_item (order_id, patient_person_id, test_code, panel_code) VALUES ($1, $2, $3, $4) ON CONFLICT (order_id, test_code) DO NOTHING`, [o.id, s.patientPersonId, r.test, r.panel])
          }
        })
        created.push({ id: o.id, orderRef: o.order_ref, kind: 'lab', details })
      } else {
        const dept = await this.deptId(tx, hospitalId, 'Radiology')
        for (const name of body.tests) {
          const g = guessImaging(name)
          const o = await this.insertOrder(tx, s.id, s.patientPersonId, hospitalId, dept, 'scan', g.name, body.priority, body.note)
          await tx.asOwner(() =>
            tx.query(
              `INSERT INTO imaging.study (order_id, patient_person_id, hospital_id, modality, body_part, view_text, priority, clinical_note, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7::records.order_priority, $8, 'waiting')`,
              [o.id, s.patientPersonId, hospitalId, g.modality, g.bodyPart, g.view, body.priority, body.note ?? null],
            ),
          )
          created.push({ id: o.id, orderRef: o.order_ref, kind: 'imaging', details: g.name })
        }
      }

      for (const c of created) {
        await tx.emit({
          type: c.kind === 'lab' ? 'lab-order' : 'imaging-order',
          toRoles: [c.kind === 'lab' ? 'labtech' : 'radiology', 'citizen'],
          title: `${c.kind === 'lab' ? 'Lab' : 'Imaging'} order · ${c.details}`,
          text: `${patient.name} · ${body.priority} · ${c.orderRef} · ${doctor?.full_name}`,
          entityType: 'records.clinical_order',
          entityId: c.id,
          patientPersonId: s.patientPersonId,
          hospitalId,
        })
        await tx.audit('order.create', { entityType: 'clinical_order', entityId: c.id, patient: s.patientPersonId, session: s.id, details: { orderRef: c.orderRef, kind: c.kind, priority: body.priority } })
      }
      return { orders: created, message: `${created.map((c) => c.orderRef).join(', ')} sent to ${body.kind === 'lab' ? 'the lab' : 'radiology'}.` }
    })
  }

  private async insertOrder(tx: DoctorTx, sessionId: string, pid: string, hospitalId: string, deptId: string | null, type: 'lab' | 'scan', details: string, priority: string, note?: string) {
    const o = await tx.one<{ id: string; order_ref: string }>(
      `INSERT INTO records.clinical_order (patient_person_id, ordered_by_user_id, session_id, hospital_id, department_id, order_type, details, status, priority, clinical_note)
       VALUES ($1, util.ctx_user_id(), $2, $3, $4, $5::records.order_type, $6, 'open', $7::records.order_priority, $8) RETURNING id, order_ref`,
      [pid, sessionId, hospitalId, deptId, type, details, priority, note ?? null],
    )
    return o!
  }

  private async deptId(tx: DoctorTx, hospitalId: string, name: string): Promise<string | null> {
    const d = await tx.one<{ id: string }>(`SELECT id FROM org.department WHERE hospital_id = $1 AND name = $2 AND is_active LIMIT 1`, [hospitalId, name])
    return d?.id ?? null
  }

  /** "Lipid profile" -> panel LIPID (all its tests); "HbA1c" -> test HBA1C. */
  private async resolveLabTests(tx: DoctorTx, names: string[]) {
    const out: { test: string; panel: string | null }[] = []
    const unknown: string[] = []
    for (const n of names) {
      const panel = await tx.one<{ code: string }>(`SELECT code::text AS code FROM lab.panel WHERE is_active AND (code::text ILIKE $1 OR name ILIKE $1) LIMIT 1`, [n])
      if (panel) {
        const tests = await tx.query<{ test_code: string }>(`SELECT test_code::text AS test_code FROM lab.panel_test WHERE panel_code = $1`, [panel.code])
        for (const t of tests) out.push({ test: t.test_code, panel: panel.code })
        continue
      }
      const test = await tx.one<{ code: string }>(`SELECT code::text AS code FROM lab.test_catalogue WHERE is_active AND (code::text ILIKE $1 OR name ILIKE $1) LIMIT 1`, [n])
      if (test) out.push({ test: test.code, panel: null })
      else unknown.push(n)
    }
    if (unknown.length) throw new BadRequestException(`Unknown lab test: ${unknown.join(', ')}`)
    return out
  }

  /** My orders (all patients): the Orders page. Reads my own rows, so it uses owner rights filtered by me. */
  async list(user: AuthenticatedUser | undefined): Promise<{ stats: any; orders: OrderRow[] }> {
    return this.db.run(user, async (tx) => {
      const rows = await tx.asOwner(() =>
        tx.query<any>(
          `SELECT o.id, o.order_ref, o.order_type::text AS kind, o.details, o.priority::text AS priority, o.status::text AS status, o.created_at, p.full_name,
                  COALESCE(ap.full_name, NULL) AS assigned_to,
                  s.status AS study_status,
                  EXISTS (SELECT 1 FROM lab.result r JOIN lab.result_value v ON v.result_id = r.id WHERE r.order_id = o.id AND v.is_critical) AS critical
             FROM records.clinical_order o
             JOIN identity.person p ON p.id = o.patient_person_id
             LEFT JOIN identity.app_user au ON au.id = COALESCE(o.assigned_to_user_id, o.accepted_by_user_id)
             LEFT JOIN identity.person ap ON ap.id = au.person_id
             LEFT JOIN imaging.study s ON s.order_id = o.id
            WHERE o.ordered_by_user_id = util.ctx_user_id() AND o.order_type::text IN ('lab','scan')
            ORDER BY o.created_at DESC LIMIT 100`,
        ),
      )
      const orders: OrderRow[] = rows.map((r) => ({
        id: r.id,
        orderRef: r.order_ref,
        kind: r.kind === 'lab' ? 'lab' : r.kind === 'scan' ? 'imaging' : 'other',
        patientName: r.full_name,
        tests: r.details,
        priority: r.priority,
        status: r.status,
        statusLabel: r.critical ? 'Critical' : r.kind === 'scan' && r.study_status === 'awaiting_report' ? 'AI review' : STATUS_LABEL[r.status] ?? r.status,
        assignedTo: r.assigned_to,
        orderedAt: toIso(r.created_at)!,
        critical: r.critical,
      }))
      return {
        stats: {
          open: orders.filter((o) => ['open', 'accepted'].includes(o.status)).length,
          inProgress: orders.filter((o) => o.status === 'in_progress').length,
          resultsBack: orders.filter((o) => o.status === 'done').length,
          critical: orders.filter((o) => o.critical).length,
        },
        orders,
      }
    })
  }

  /** Results back for my orders that I have not acknowledged yet (home "Waiting for review", Results page). */
  async resultsBack(tx: DoctorTx) {
    const labs = await tx.asOwner(() => tx.query<any>(
      `SELECT r.id AS result_id, o.order_ref, o.details, p.full_name AS patient_name, r.patient_person_id, r.released_at,
              (SELECT string_agg(v.test_code::text || ' ' || trim(trailing '.' FROM trim(trailing '0' FROM v.value_num::text)) || ' ' || coalesce(v.unit, '') ||
                                 CASE WHEN v.flag IS NOT NULL AND v.flag <> 'N' THEN ' (' || v.flag || ')' ELSE '' END, ' · ' ORDER BY v.test_code)
                 FROM lab.result_value v WHERE v.result_id = r.id AND v.value_num IS NOT NULL) AS values_text,
              EXISTS (SELECT 1 FROM lab.result_value v WHERE v.result_id = r.id AND v.is_critical) AS critical,
              rp.full_name AS released_by,
              EXISTS (SELECT 1 FROM lab.result_ack a WHERE a.result_id = r.id AND a.doctor_user_id = util.ctx_user_id()) AS acked
         FROM lab.result r
         JOIN records.clinical_order o ON o.id = r.order_id
         JOIN identity.person p ON p.id = r.patient_person_id
         LEFT JOIN identity.app_user ru ON ru.id = r.released_by_user_id LEFT JOIN identity.person rp ON rp.id = ru.person_id
        WHERE r.status IN ('released','amended') AND r.released_at > now() - interval '30 days' AND o.ordered_by_user_id = util.ctx_user_id()
        ORDER BY r.released_at DESC LIMIT 30`,
    ))
    return labs.map((l) => ({
      kind: 'lab' as const,
      resultId: l.result_id,
      orderRef: l.order_ref,
      title: l.details,
      patientName: l.patient_name,
      patientPersonId: l.patient_person_id,
      values: l.values_text,
      critical: l.critical,
      releasedBy: l.released_by,
      releasedAt: toIso(l.released_at),
      acknowledged: l.acked,
    }))
  }

  async results(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const lab = await this.resultsBack(tx)
      const imaging = await tx.asOwner(() => tx.query<any>(
        `SELECT s.id AS study_id, o.order_ref, o.details, p.full_name AS patient_name, s.status, s.completed_at, s.created_at
           FROM imaging.study s JOIN records.clinical_order o ON o.id = s.order_id JOIN identity.person p ON p.id = s.patient_person_id
          WHERE o.ordered_by_user_id = util.ctx_user_id() OR s.reporting_doctor_user_id = util.ctx_user_id()
          ORDER BY coalesce(s.completed_at, s.created_at) DESC LIMIT 30`,
      ))
      return {
        lab,
        imaging: imaging.map((i) => ({ kind: 'imaging' as const, studyId: i.study_id, orderRef: i.order_ref, title: i.details, patientName: i.patient_name, status: i.status, completedAt: toIso(i.completed_at) })),
      }
    })
  }

  async acknowledge(user: AuthenticatedUser | undefined, resultId: string, comment?: string) {
    return this.db.run(user, async (tx) => {
      const r = await tx.asOwner(() =>
        tx.one<any>(
          `SELECT r.id, r.patient_person_id, o.order_ref FROM lab.result r JOIN records.clinical_order o ON o.id = r.order_id
            WHERE r.id = $1 AND r.status IN ('released','amended') AND o.ordered_by_user_id = util.ctx_user_id()`,
          [resultId],
        ),
      )
      if (!r) throw new NotFoundException('Result not found')
      await tx.query(`INSERT INTO lab.result_ack (result_id, doctor_user_id, comment) VALUES ($1, util.ctx_user_id(), $2) ON CONFLICT DO NOTHING`, [resultId, comment ?? null])
      await tx.audit('lab.result_ack', { entityType: 'lab_result', entityId: resultId, patient: r.patient_person_id, details: { orderRef: r.order_ref } })
      return { acknowledged: true, resultId }
    })
  }
}
