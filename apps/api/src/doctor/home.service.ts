import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { AuthenticatedUser } from '../auth/types'
import { AccessService } from './access.service'
import { AiService } from './ai.service'
import { CareService } from './care.service'
import { DoctorDbService, DoctorTx, toIso } from './doctor-db.service'
import { OrdersService } from './orders.service'

const TZ = `'Asia/Kolkata'`

@Injectable()
export class HomeService {
  constructor(
    private readonly db: DoctorDbService,
    private readonly ai: AiService,
    private readonly orders: OrdersService,
    private readonly access: AccessService,
    private readonly care: CareService,
  ) {}

  /** The clinic day shown: today if the doctor has visits today, else the latest earlier day with visits (demo data is older). */
  private async clinicDate(tx: DoctorTx, requested?: string): Promise<{ date: string; isToday: boolean }> {
    if (requested) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) throw new BadRequestException('date must be YYYY-MM-DD')
      const t = await tx.one<{ today: boolean }>(`SELECT ($1::date = current_date) AS today`, [requested])
      return { date: requested, isToday: !!t?.today }
    }
    const r = await tx.one<{ d: string; today: boolean }>(
      `SELECT COALESCE(max(visit_date), current_date)::text AS d, COALESCE(max(visit_date), current_date) = current_date AS today
         FROM engage.op_visit WHERE doctor_user_id = util.ctx_user_id() AND visit_date <= current_date`,
    )
    return { date: r!.d, isToday: !!r?.today }
  }

  async queueRows(tx: DoctorTx, date: string, isToday: boolean) {
    const rows = await tx.query<any>(
      `SELECT v.id, v.token_no, v.status::text AS status, v.priority, v.is_walk_in, v.checked_in_at, v.patient_person_id, v.access_session_id,
              p.full_name, date_part('year', age(p.date_of_birth))::int AS age, p.sex::text AS sex,
              a.reason, a.visit_type, a.booking_ref,
              CASE WHEN $2 AND v.checked_in_at IS NOT NULL AND v.status IN ('checked_in','waiting') THEN round(extract(epoch FROM (now() - v.checked_in_at)) / 60)::int END AS waiting_min
         FROM engage.op_visit v
         JOIN identity.person p ON p.id = v.patient_person_id
         LEFT JOIN engage.appointment a ON a.id = v.appointment_id
        WHERE v.doctor_user_id = util.ctx_user_id() AND v.visit_date = $1::date
        ORDER BY CASE v.status WHEN 'in_consultation' THEN 0 WHEN 'checked_in' THEN 1 WHEN 'waiting' THEN 1 WHEN 'booked' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
                 CASE v.priority WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, v.token_no`,
      [date, isToday],
    )
    let nextMarked = false
    return rows.map((r) => {
      const waiting = r.status === 'checked_in' || r.status === 'waiting'
      let label: string
      let tone: string
      if (r.status === 'in_consultation') { label = 'In room'; tone = 'success' }
      else if (waiting && !nextMarked) { nextMarked = true; label = 'Next'; tone = r.priority !== 'normal' ? 'danger' : 'teal' }
      else if (r.status === 'waiting') { label = r.waiting_min != null ? `Waiting ${r.waiting_min} min` : 'Waiting'; tone = r.waiting_min != null && r.waiting_min >= 15 ? 'warning' : 'neutral' }
      else if (r.status === 'checked_in') { label = 'Checked in'; tone = 'info' }
      else if (r.status === 'booked') { label = 'Booked'; tone = 'teal' }
      else if (r.status === 'done') { label = 'Done'; tone = 'neutral' }
      else if (r.status === 'no_show') { label = 'No-show'; tone = 'danger' }
      else { label = r.status; tone = 'neutral' }
      const sex = r.sex === 'female' ? 'F' : r.sex === 'male' ? 'M' : 'O'
      const why = r.reason ?? (r.visit_type ? r.visit_type.replace('_', ' ') : null)
      return {
        visitId: r.id,
        token: String(r.token_no).padStart(2, '0'),
        patientPersonId: r.patient_person_id,
        patientName: r.full_name,
        meta: `${sex} ${r.age}${why ? ` · ${why}` : ''}${r.priority !== 'normal' ? ` · ${r.priority}` : ''}`,
        status: r.status,
        statusLabel: label,
        tone,
        priority: r.priority,
        isWalkIn: r.is_walk_in,
        checkedInAt: toIso(r.checked_in_at),
        waitingMinutes: r.waiting_min,
        sessionId: r.access_session_id,
        needsKey: r.status !== 'done' && r.status !== 'no_show',
      }
    })
  }

  async queue(user: AuthenticatedUser | undefined, date?: string) {
    return this.db.run(user, async (tx) => {
      const d = await this.clinicDate(tx, date)
      return { date: d.date, isToday: d.isToday, queue: await this.queueRows(tx, d.date, d.isToday) }
    })
  }

  /** Doctor's only allowed moves: call to waiting, mark no-show, mark done. */
  async updateQueue(user: AuthenticatedUser | undefined, visitId: string, status: 'waiting' | 'no_show' | 'done') {
    return this.db.run(user, async (tx) => {
      const v = await tx.one<any>(`SELECT status::text AS status FROM engage.op_visit WHERE id = $1 AND doctor_user_id = util.ctx_user_id()`, [visitId])
      if (!v) throw new NotFoundException('Visit not found')
      const allowed: Record<string, string[]> = { waiting: ['booked', 'checked_in'], no_show: ['booked', 'checked_in', 'waiting'], done: ['in_consultation', 'checked_in', 'waiting'] }
      if (!allowed[status]!.includes(v.status)) throw new ForbiddenException(`A visit that is ${v.status} cannot be set to ${status}`)
      await tx.query(
        `UPDATE engage.op_visit SET status = $2::engage.visit_status,
                called_at = CASE WHEN $2 = 'waiting' THEN COALESCE(called_at, greatest(now(), checked_in_at)) ELSE called_at END,
                ended_at = CASE WHEN $2 = 'done' THEN now() ELSE ended_at END WHERE id = $1`,
        [visitId, status],
      )
      return { visitId, status }
    })
  }

  async home(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const d = await this.clinicDate(tx)
      const doctor = await tx.one<any>(
        `SELECT p.full_name, dp.specialisation, dp.hpr_id, dp.years_experience, dp.duty_hours, h.name AS hospital, dep.name AS department
           FROM identity.doctor_profile dp JOIN identity.app_user u ON u.id = dp.user_id JOIN identity.person p ON p.id = u.person_id
           JOIN org.hospital h ON h.id = dp.hospital_id LEFT JOIN org.department dep ON dep.id = dp.department_id WHERE dp.user_id = util.ctx_user_id()`,
      )
      const queue = await this.queueRows(tx, d.date, d.isToday)
      const waiting = queue.filter((q) => q.status === 'checked_in' || q.status === 'waiting')
      const waits = waiting.map((q) => q.waitingMinutes).filter((n): n is number => n != null)
      const pendingAi = await this.ai.pendingForMe(tx)
      const results = await this.orders.resultsBack(tx)
      const unackedLabs = results.filter((r) => !r.acknowledged)
      const alerts = await this.alertRows(tx)
      const drafts = await tx.query<any>(
        `SELECT d.id, p.full_name, jsonb_array_length(d.lines) AS lines FROM pharmacy.prescription_draft d JOIN identity.person p ON p.id = d.patient_person_id
          WHERE d.doctor_user_id = util.ctx_user_id() AND d.promoted_prescription_id IS NULL ORDER BY d.updated_at DESC LIMIT 5`,
      )
      const week = await tx.one<any>(
        `SELECT count(*) FILTER (WHERE started_at::date = current_date)::int AS today, count(*) FILTER (WHERE started_at > now() - interval '7 days')::int AS week
           FROM access.access_session WHERE user_id = util.ctx_user_id() AND mode <> 'break_glass'`,
      )
      const handovers = await this.care.listHandovers(user).catch(() => [])
      const unread = await tx.one<{ n: number }>(`SELECT engage.unread_event_count() AS n`)
      const past = (await this.access.pastPatients(user)).slice(0, 5)
      const total = queue.length
      const seen = queue.filter((q) => q.status === 'done').length
      return {
        simulated: true,
        doctor: { name: doctor?.full_name, specialisation: doctor?.specialisation, hospital: doctor?.hospital, department: doctor?.department, hprId: doctor?.hpr_id, yearsExperience: doctor?.years_experience, dutyHours: doctor?.duty_hours },
        clinicDate: d.date,
        isToday: d.isToday,
        stats: {
          patientsToday: total,
          seen,
          waiting: waiting.length,
          avgWaitMinutes: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
          longestWaitMinutes: waits.length ? Math.max(...waits) : null,
          noShows: queue.filter((q) => q.status === 'no_show').length,
          aiReviewsPending: pendingAi.length,
          oldestAiReviewAt: pendingAi.length ? pendingAi[pendingAi.length - 1]!.createdAt : null,
          ordersBack: unackedLabs.length,
          sessionsToday: week?.today ?? 0,
          sessionsThisWeek: week?.week ?? 0,
          unreadNotifications: unread?.n ?? 0,
        },
        queue,
        nextUp: waiting[0] ?? null,
        waitingForReview: {
          ai: pendingAi.slice(0, 5).map((i) => ({ runId: i.runId, module: i.module, headline: i.headline, status: i.status, tool: i.tool, createdAt: i.createdAt })),
          results: unackedLabs.slice(0, 5),
        },
        alerts,
        pendingPrescriptions: drafts.map((x) => ({ draftId: x.id, patientName: x.full_name, lines: x.lines })),
        handover: handovers[0] ?? null,
        recentPatients: past,
      }
    })
  }

  // ------------------------------------------------------------------
  // Schedule
  // ------------------------------------------------------------------
  async schedule(user: AuthenticatedUser | undefined, date?: string) {
    return this.db.run(user, async (tx) => {
      const d = await this.clinicDate(tx, date)
      const day = await tx.query<any>(
        `SELECT v.id, v.token_no, v.status::text AS status, v.is_walk_in, v.priority, p.full_name, date_part('year', age(p.date_of_birth))::int AS age, p.sex::text AS sex,
                a.reason, a.visit_type, a.booking_ref, sl.slot_type::text AS slot_type,
                to_char(COALESCE(lower(sl.during), v.checked_in_at) AT TIME ZONE ${TZ}, 'HH24:MI') AS time
           FROM engage.op_visit v JOIN identity.person p ON p.id = v.patient_person_id
           LEFT JOIN engage.appointment a ON a.id = v.appointment_id LEFT JOIN engage.appointment_slot sl ON sl.id = a.slot_id
          WHERE v.doctor_user_id = util.ctx_user_id() AND v.visit_date = $1::date
          ORDER BY COALESCE(lower(sl.during), v.checked_in_at), v.token_no`,
        [d.date],
      )
      const weekStart = (await tx.one<{ s: string }>(`SELECT date_trunc('week', $1::date)::date::text AS s`, [d.date]))!.s
      const blocks = await tx.query<any>(
        `SELECT b.id, b.block_type, to_char(lower(b.during) AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, to_char(lower(b.during) AT TIME ZONE ${TZ}, 'HH24:MI') AS start,
                to_char(upper(b.during) AT TIME ZONE ${TZ}, 'HH24:MI') AS "end", b.location, b.note
           FROM org.doctor_schedule_block b
          WHERE b.doctor_user_id = util.ctx_user_id() AND b.during && tstzrange($1::date::timestamptz, ($1::date + 7)::timestamptz)
          ORDER BY lower(b.during)`,
        [weekStart],
      )
      const counts = await tx.query<any>(
        `SELECT visit_date::text AS day, count(*) FILTER (WHERE status IN ('done','in_consultation'))::int AS seen, count(*)::int AS total
           FROM engage.op_visit WHERE doctor_user_id = util.ctx_user_id() AND visit_date >= $1::date AND visit_date < $1::date + 7 GROUP BY visit_date`,
        [weekStart],
      )
      const avail = await tx.one<any>(`SELECT accepts_walkin, offers_teleconsult FROM identity.doctor_profile WHERE user_id = util.ctx_user_id()`)
      const leave = await tx.query<any>(
        `SELECT to_char(lower(during) AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, note FROM org.doctor_schedule_block
          WHERE doctor_user_id = util.ctx_user_id() AND block_type = 'leave' AND upper(during) > now() ORDER BY lower(during) LIMIT 5`,
      )
      const days: any[] = []
      for (let i = 0; i < 7; i++) {
        const dd = (await tx.one<{ x: string; wd: string }>(`SELECT ($1::date + $2::int)::text AS x, to_char($1::date + $2::int, 'Dy') AS wd`, [weekStart, i]))!
        const c = counts.find((x) => x.day === dd.x)
        days.push({ date: dd.x, weekday: dd.wd, patients: c?.seen ?? 0, booked: c?.total ?? 0, blocks: blocks.filter((b) => b.day === dd.x).map((b) => ({ id: b.id, type: b.block_type, from: b.start, to: b.end, location: b.location, note: b.note })) })
      }
      return {
        date: d.date,
        isToday: d.isToday,
        stats: {
          bookedToday: day.length,
          checkedIn: day.filter((r) => r.status === 'checked_in' || r.status === 'waiting').length,
          noShows: day.filter((r) => r.status === 'no_show').length,
          fromCitizenApp: day.filter((r) => r.booking_ref && !r.is_walk_in).length,
          teleconsults: day.filter((r) => r.slot_type === 'teleconsult' || r.visit_type === 'teleconsult').length,
        },
        appointments: day.map((r) => ({
          visitId: r.id,
          time: r.time,
          patientName: r.full_name,
          meta: `${r.sex === 'female' ? 'F' : r.sex === 'male' ? 'M' : 'O'} ${r.age}${r.reason ? ` · ${r.reason}` : ''}`,
          status: r.status,
          kind: r.slot_type === 'teleconsult' || r.visit_type === 'teleconsult' ? 'teleconsult' : r.is_walk_in ? 'walk_in' : 'op',
          bookingRef: r.booking_ref,
        })),
        week: days,
        availability: { acceptsWalkin: avail?.accepts_walkin ?? true, offersTeleconsult: avail?.offers_teleconsult ?? false, upcomingLeave: leave.map((l) => ({ date: l.day, note: l.note })) },
      }
    })
  }

  // ------------------------------------------------------------------
  // Alerts and notifications (bell)
  // ------------------------------------------------------------------
  async alertRows(tx: DoctorTx) {
    const rows = await tx.query<any>(
      `SELECT a.id, a.kind::text AS kind, a.severity, a.title, a.detail, a.raised_at, a.acknowledged_at, p.full_name AS patient
         FROM records.clinical_alert a LEFT JOIN identity.person p ON p.id = a.patient_person_id
        WHERE a.resolved_at IS NULL AND (a.target_user_id = util.ctx_user_id() OR (a.target_user_id IS NULL AND a.hospital_id = util.ctx_hospital_id()))
        ORDER BY a.acknowledged_at IS NOT NULL, CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.raised_at DESC LIMIT 15`,
    )
    return rows.map((a) => ({ id: a.id, kind: a.kind, severity: a.severity, title: a.title, detail: a.detail, patientName: a.patient, raisedAt: toIso(a.raised_at), acknowledged: !!a.acknowledged_at }))
  }

  async alerts(user: AuthenticatedUser | undefined) {
    return this.db.run(user, (tx) => this.alertRows(tx))
  }

  async ackAlert(user: AuthenticatedUser | undefined, id: string) {
    return this.db.run(user, async (tx) => {
      const r = await tx.one(`UPDATE records.clinical_alert SET acknowledged_by_user_id = util.ctx_user_id(), acknowledged_at = now() WHERE id = $1 AND acknowledged_at IS NULL RETURNING id`, [id])
      if (!r) throw new NotFoundException('Alert not found or already acknowledged')
      return { id, acknowledged: true }
    })
  }

  async notifications(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const rows = await tx.query<any>(
        `SELECT id, type::text AS type, type_label, chip, chip_tone, from_role::text AS from_role, title, text, href, created_at, is_read, sent_by_me
           FROM engage.v_my_events ORDER BY created_at DESC LIMIT 40`,
      )
      const n = await tx.one<{ n: number }>(`SELECT engage.unread_event_count() AS n`)
      return {
        unread: n?.n ?? 0,
        events: rows.map((e) => ({ id: e.id, type: e.type, typeLabel: e.type_label, chip: e.chip, tone: e.chip_tone, from: e.from_role, title: e.title, text: e.text, href: e.href, at: toIso(e.created_at), read: e.is_read, sentByMe: e.sent_by_me })),
      }
    })
  }

  async markRead(user: AuthenticatedUser | undefined, ids?: string[]) {
    return this.db.run(user, async (tx) => {
      const r = await tx.one<{ n: number }>(`SELECT engage.mark_events_read($1::uuid[]) AS n`, [ids?.length ? ids : null])
      return { marked: r?.n ?? 0 }
    })
  }
}
