import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { DoctorSessionInfo, OpenSessionRequest } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { AccessKeyService } from './access-key.service'
import { DoctorDbService, DoctorTx, mustFind, toIso } from './doctor-db.service'
import { loadHeader, recordItemView, requireLiveSession, sessionInfoById } from './session.helpers'

/** Minutes a key session lasts: the admin access rule, never more than the database ceiling of 30. */
export async function ruleMinutes(tx: DoctorTx, code: string, fallback: number): Promise<number> {
  const r = await tx.one<{ value: string }>(`SELECT value FROM admin.access_rule WHERE code = $1`, [code])
  const n = Number(r?.value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Close sessions whose time ran out (the 'one key session per patient' index counts them as open until ended). */
export async function sweepExpiredSessions(tx: DoctorTx): Promise<void> {
  await tx.asOwner(() =>
    tx.query(
      `UPDATE access.access_session SET ended_at = expires_at, ended_by = 'timeout'
        WHERE ended_at IS NULL AND expires_at <= now()`,
    ),
  )
}

/** Tell the patient their record was opened (no health details in the payload). */
export async function notifyRecordOpened(tx: DoctorTx, patientPersonId: string, doctorName: string, hospitalName: string): Promise<void> {
  await tx.query(
    `INSERT INTO engage.notification (user_id, channel, template_code, payload, kind, priority)
     SELECT u.id, 'push', 'record_opened', $2::jsonb, 'record_opened', 'normal'
       FROM identity.app_user u WHERE u.person_id = $1 AND u.account_type = 'citizen'`,
    [patientPersonId, JSON.stringify({ who: doctorName, hospital: hospitalName })],
  )
}

@Injectable()
export class AccessService {
  constructor(
    private readonly db: DoctorDbService,
    private readonly keys: AccessKeyService,
  ) {}

  /**
   * Open a patient's record with the rotating key. Never opens without a valid key (or break-glass, see EmergencyService).
   * The unknown/expired/used cases give one message so a key cannot be probed.
   */
  async openWithKey(user: AuthenticatedUser | undefined, body: OpenSessionRequest): Promise<DoctorSessionInfo> {
    const actor = this.db.actorOf(user)
    const personId = await this.keys.consume(body.key)
    if (!personId) throw new NotFoundException('Key not recognised, already used or expired. Ask the patient for the new key.')
    return this.db.run(user, async (tx) => {
      await sweepExpiredSessions(tx)
      const patient = await loadHeader(tx, personId)
      if (patient.personId === actor.personId) {
        throw new ForbiddenException('A doctor account cannot open its own citizen record')
      }
      const hospitalId = await tx.hospitalId()

      // Geofence: the doctor's phone location is optional; outside the hospital a reason is required.
      let inside: boolean | null = null
      let distance: number | null = null
      if (body.latitude != null && body.longitude != null) {
        const g = await tx.one<{ inside: boolean | null; distance_m: number | null }>(
          `SELECT inside, distance_m FROM access.inside_geofence(util.ctx_user_id(), $1, $2)`,
          [body.longitude, body.latitude],
        )
        inside = g?.inside ?? null
        distance = g?.distance_m ?? null
        if (inside === false && !body.reason) {
          throw new BadRequestException('You are outside the hospital. A reason is needed to open this record.')
        }
      }

      const minutes = Math.min(await ruleMinutes(tx, 'session_minutes', 30), 30)
      const s = await tx.one<{ id: string }>(
        `INSERT INTO access.access_session
           (patient_person_id, user_id, mode, key_token_id, expires_at, start_inside_geofence, reason)
         VALUES ($1, util.ctx_user_id(), 'key', $2, now() + make_interval(mins => $3), $4, $5)
         RETURNING id`,
        [personId, `kt_${randomUUID()}`, minutes, inside, body.reason ?? null],
      )
      const sessionId = s!.id

      if (body.latitude != null && body.longitude != null) {
        await tx.query(
          `INSERT INTO access.location_check (session_id, point, inside_geofence, distance_m, reason)
           VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6)`,
          [sessionId, body.longitude, body.latitude, inside, distance, body.reason ?? null],
        )
      }

      await this.linkVisit(tx, sessionId, personId, body.visitId)
      await notifyRecordOpened(tx, personId, actor.name ?? 'A doctor', (await tx.one<{ name: string }>(`SELECT name FROM org.hospital WHERE id = $1`, [hospitalId]))?.name ?? '')
      await tx.audit('session.open', { entityType: 'access_session', entityId: sessionId, patient: personId, session: sessionId, details: { mode: 'key', how: 'Your key', insideGeofence: inside } })
      return sessionInfoById(tx, sessionId)
    })
  }

  /** Attach the session to the OP visit (given, or today's matching booked / waiting visit). */
  private async linkVisit(tx: DoctorTx, sessionId: string, patientId: string, visitId?: string): Promise<void> {
    await tx.query(
      `UPDATE engage.op_visit v
          SET status = 'in_consultation', access_session_id = $1,
              called_at = COALESCE(called_at, greatest(now(), checked_in_at)),
              started_at = COALESCE(started_at, now())
        WHERE v.id = COALESCE($3::uuid, (
                SELECT id FROM engage.op_visit
                 WHERE doctor_user_id = util.ctx_user_id() AND patient_person_id = $2 AND visit_date = current_date
                   AND status IN ('booked','checked_in','waiting')
                 ORDER BY token_no LIMIT 1))
          AND v.doctor_user_id = util.ctx_user_id() AND v.patient_person_id = $2 AND v.status IN ('booked','checked_in','waiting')`,
      [sessionId, patientId, visitId ?? null],
    )
  }

  /** My live sessions and the last few that ended. */
  async list(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      await sweepExpiredSessions(tx)
      const rows = await tx.query<{ id: string; live: boolean }>(
        `SELECT id, (ended_at IS NULL AND expires_at > now()) AS live
           FROM access.access_session WHERE user_id = util.ctx_user_id()
          ORDER BY started_at DESC LIMIT 12`,
      )
      const all = await Promise.all(rows.map((r) => sessionInfoById(tx, r.id)))
      return { live: all.filter((s) => s.live), recent: all.filter((s) => !s.live) }
    })
  }

  async get(user: AuthenticatedUser | undefined, sessionId: string): Promise<DoctorSessionInfo> {
    return this.db.run(user, async (tx) => sessionInfoById(tx, sessionId))
  }

  async end(user: AuthenticatedUser | undefined, sessionId: string): Promise<DoctorSessionInfo> {
    return this.db.run(user, async (tx) => {
      const s = await requireLiveSession(tx, sessionId)
      await tx.query(
        `UPDATE access.access_session SET ended_at = now(), ended_by = 'doctor' WHERE id = $1 AND user_id = util.ctx_user_id()`,
        [sessionId],
      )
      await tx.query(
        `UPDATE engage.op_visit SET status = 'done', ended_at = now()
          WHERE access_session_id = $1 AND doctor_user_id = util.ctx_user_id() AND status = 'in_consultation'`,
        [sessionId],
      )
      await tx.audit('session.end', { entityType: 'access_session', entityId: sessionId, patient: s.patientPersonId, session: sessionId, details: { by: 'doctor' } })
      return sessionInfoById(tx, sessionId)
    })
  }

  /**
   * Past patients: after a session the doctor sees only the patient's name and what the doctor added
   * (docs/15 section 11.1). Counts of own additions come from rows the doctor wrote.
   */
  async pastPatients(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      await sweepExpiredSessions(tx)
      const rows = await tx.query<any>(
        `SELECT s.patient_person_id, p.full_name, p.is_unidentified, p.temp_label,
                count(*)::int AS sessions, max(s.started_at) AS last_session,
                (array_agg(s.id ORDER BY s.started_at DESC))[1] AS last_session_id,
                (array_agg(s.mode::text ORDER BY s.started_at DESC))[1] AS last_mode,
                (array_agg(round(extract(epoch FROM (coalesce(s.ended_at, least(s.expires_at, now())) - s.started_at)) / 60)::int
                           ORDER BY s.started_at DESC))[1] AS last_minutes,
                (array_agg(s.ended_by::text ORDER BY s.started_at DESC))[1] AS last_ended_by,
                bool_or(s.ended_at IS NULL AND s.expires_at > now()) AS has_live
           FROM access.access_session s
           JOIN identity.person p ON p.id = s.patient_person_id
          WHERE s.user_id = util.ctx_user_id()
          GROUP BY s.patient_person_id, p.full_name, p.is_unidentified, p.temp_label
          ORDER BY max(s.started_at) DESC LIMIT 50`,
      )
      const ids = rows.map((r) => r.patient_person_id)
      const adds = ids.length
        ? await tx.asOwner(() =>
            tx.query<any>(
              `SELECT pid AS patient_person_id,
                      (SELECT count(*) FROM records.document d WHERE d.patient_person_id = pid AND d.created_by_user_id = util.ctx_user_id())::int AS documents,
                      (SELECT count(*) FROM pharmacy.prescription r WHERE r.patient_person_id = pid AND r.doctor_user_id = util.ctx_user_id())::int AS prescriptions,
                      (SELECT count(*) FROM records.clinical_order o WHERE o.patient_person_id = pid AND o.ordered_by_user_id = util.ctx_user_id())::int AS orders,
                      (SELECT count(*) FROM ai.ai_run a WHERE a.patient_person_id = pid AND a.run_by_user_id = util.ctx_user_id())::int AS ai_runs
                 FROM unnest($1::uuid[]) pid`,
              [ids],
            ),
          )
        : []
      const addMap = new Map(adds.map((a) => [a.patient_person_id, a]))
      return rows.map((r) => ({
        personId: r.patient_person_id,
        name: r.is_unidentified ? r.temp_label : r.full_name,
        sessions: r.sessions,
        lastSessionAt: toIso(r.last_session),
        lastSessionId: r.last_session_id,
        lastMode: r.last_mode,
        lastMinutes: r.last_minutes,
        lastEndedBy: r.last_ended_by,
        live: r.has_live,
        myAdditions: {
          documents: addMap.get(r.patient_person_id)?.documents ?? 0,
          prescriptions: addMap.get(r.patient_person_id)?.prescriptions ?? 0,
          orders: addMap.get(r.patient_person_id)?.orders ?? 0,
          aiRuns: addMap.get(r.patient_person_id)?.ai_runs ?? 0,
        },
      }))
    })
  }

  /** What the doctor added for one past patient (and nothing else of the record). */
  async myAdditions(user: AuthenticatedUser | undefined, patientPersonId: string) {
    return this.db.run(user, async (tx) => {
      const has = await tx.one(`SELECT 1 FROM access.access_session WHERE user_id = util.ctx_user_id() AND patient_person_id = $1 LIMIT 1`, [patientPersonId])
      if (!has) throw new ForbiddenException('You have not treated this patient')
      const patient = await loadHeader(tx, patientPersonId)
      const out = await tx.asOwner(async () => ({
        documents: await tx.query(
          `SELECT id, title, doc_type::text AS doc_type, created_at FROM records.document
            WHERE patient_person_id = $1 AND created_by_user_id = util.ctx_user_id() ORDER BY created_at DESC LIMIT 100`,
          [patientPersonId],
        ),
        prescriptions: await tx.query(
          `SELECT id, rx_number, issued_at, status::text AS status FROM pharmacy.prescription
            WHERE patient_person_id = $1 AND doctor_user_id = util.ctx_user_id() ORDER BY issued_at DESC LIMIT 100`,
          [patientPersonId],
        ),
        orders: await tx.query(
          `SELECT id, order_ref, order_type::text AS order_type, details, status::text AS status, created_at FROM records.clinical_order
            WHERE patient_person_id = $1 AND ordered_by_user_id = util.ctx_user_id() ORDER BY created_at DESC LIMIT 100`,
          [patientPersonId],
        ),
      }))
      return {
        patient: { personId: patient.personId, name: patient.name },
        note: 'After a session you see only the patient name and what you added yourself.',
        documents: out.documents.map((d: any) => ({ id: d.id, title: d.title, docType: d.doc_type, createdAt: toIso(d.created_at) })),
        prescriptions: out.prescriptions.map((r: any) => ({ id: r.id, rxNumber: r.rx_number, issuedAt: toIso(r.issued_at), status: r.status })),
        orders: out.orders.map((o: any) => ({ id: o.id, orderRef: o.order_ref, kind: o.order_type, details: o.details, status: o.status, createdAt: toIso(o.created_at) })),
      }
    })
  }

  /** Mark an item as looked at (used by file download). */
  async view(tx: DoctorTx, sessionId: string, item: { kind: string; id?: string; label?: string }) {
    const s = await requireLiveSession(tx, sessionId)
    await recordItemView(tx, s, item)
  }

  mustHave<T>(row: T | undefined, what: string): T {
    return mustFind(row, what)
  }
}
