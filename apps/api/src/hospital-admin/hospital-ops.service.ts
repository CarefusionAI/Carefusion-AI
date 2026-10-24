import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import type { AuthenticatedUser } from '../auth/types'
import { HospitalContext, auditScoped, demoNow, resolveHospitalContext, shortName, withHospitalTx } from './hospital-context'

const istDate = (p: string) => `(${p}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function isMonday(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 1
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

@Injectable()
export class HospitalOpsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private ctxOf(user: AuthenticatedUser): Promise<HospitalContext> {
    return resolveHospitalContext(this.db, user)
  }

  // ------------------------------------------------------------------ departments and beds

  async departments(user: AuthenticatedUser) {
    const ctx = await this.ctxOf(user)
    const [rows, unassigned] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT d.id, d.name, d.is_active, coalesce(vb.total, 0)::int AS total, coalesce(vb.occupied, 0)::int AS occupied,
                coalesce(vb.free, 0)::int AS free, vb.pct_full,
                ((SELECT count(*) FROM identity.doctor_profile dp WHERE dp.department_id = d.id)
               + (SELECT count(*) FROM identity.staff_profile sp WHERE sp.department_id = d.id))::int AS staff
           FROM org.department d
           LEFT JOIN org.v_department_beds vb ON vb.department_id = d.id AND vb.hospital_id = d.hospital_id
          WHERE d.hospital_id = $1::uuid
          ORDER BY d.name`,
        [ctx.hospitalId],
      ),
      this.db.query<{ total: number; occupied: number; free: number }>(
        `SELECT total, occupied, free FROM org.v_department_beds WHERE hospital_id = $1::uuid AND department_id IS NULL`,
        [ctx.hospitalId],
      ),
    ])
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      totalBeds: r.total,
      occupied: r.occupied,
      free: r.free,
      pctFull: r.pct_full ?? 0,
      tone: r.pct_full >= 100 ? 'danger' : r.pct_full >= 85 ? 'warning' : 'success',
      staff: r.staff,
      head: null as string | null, // not stored in the database yet
    }))
    const un = unassigned[0]
    const totals = items.reduce(
      (a, d) => ({ total: a.total + d.totalBeds, occupied: a.occupied + d.occupied, free: a.free + d.free }),
      { total: un?.total ?? 0, occupied: un?.occupied ?? 0, free: un?.free ?? 0 },
    )
    return {
      totals: { ...totals, pctFull: totals.total > 0 ? Math.round((100 * totals.occupied) / totals.total) : 0 },
      unassignedBeds: un ? { total: un.total, occupied: un.occupied, free: un.free } : null,
      items,
    }
  }

  async createDepartment(user: AuthenticatedUser, name: string) {
    const ctx = await this.ctxOf(user)
    const dup = await this.db.query('SELECT 1 FROM org.department WHERE hospital_id = $1::uuid AND lower(name) = lower($2)', [
      ctx.hospitalId,
      name,
    ])
    if (dup.length) throw new ConflictException({ success: false, errorMessage: 'A department with this name already exists.' })
    const id = await withHospitalTx(this.db, ctx, async (c) => {
      const r = await c.query<{ id: string }>('INSERT INTO org.department (hospital_id, name) VALUES ($1::uuid, $2) RETURNING id', [
        ctx.hospitalId,
        name,
      ])
      await auditScoped(c, ctx, 'department.created', `Department added · ${name}`, { entityType: 'department', entityId: r.rows[0]!.id })
      return r.rows[0]!.id
    })
    return { success: true, id }
  }

  async updateDepartment(user: AuthenticatedUser, id: string, patch: { name?: string; isActive?: boolean }) {
    const ctx = await this.ctxOf(user)
    await withHospitalTx(this.db, ctx, async (c) => {
      const cur = await c.query<{ name: string }>('SELECT name FROM org.department WHERE id = $1::uuid AND hospital_id = $2::uuid', [
        id,
        ctx.hospitalId,
      ])
      if (!cur.rowCount) throw new NotFoundException({ success: false, errorMessage: 'Department not found in your hospital.' })
      if (patch.name) {
        const dup = await c.query(
          'SELECT 1 FROM org.department WHERE hospital_id = $1::uuid AND lower(name) = lower($2) AND id <> $3::uuid',
          [ctx.hospitalId, patch.name, id],
        )
        if (dup.rowCount) throw new ConflictException({ success: false, errorMessage: 'A department with this name already exists.' })
      }
      await c.query(
        `UPDATE org.department SET name = COALESCE($3, name), is_active = COALESCE($4::boolean, is_active)
          WHERE id = $1::uuid AND hospital_id = $2::uuid`,
        [id, ctx.hospitalId, patch.name ?? null, patch.isActive ?? null],
      )
      await auditScoped(c, ctx, 'department.updated', `Department updated · ${patch.name ?? cur.rows[0]!.name}`, {
        entityType: 'department',
        entityId: id,
      })
    })
    return { success: true }
  }

  async beds(user: AuthenticatedUser, q: { wardId?: string; departmentId?: string }) {
    const ctx = await this.ctxOf(user)
    const [wards, beds] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT w.id, w.code, w.name, w.department_id, dep.name AS department, w.is_active,
                count(b.id) FILTER (WHERE b.status <> 'out_of_service')::int AS total,
                count(b.id) FILTER (WHERE b.status = 'occupied')::int AS occupied,
                count(b.id) FILTER (WHERE b.status = 'free')::int AS free
           FROM org.ward w LEFT JOIN org.department dep ON dep.id = w.department_id
           LEFT JOIN org.bed b ON b.ward_id = w.id
          WHERE w.hospital_id = $1::uuid
          GROUP BY w.id, dep.name ORDER BY w.code`,
        [ctx.hospitalId],
      ),
      this.db.query<Record<string, any>>(
        `SELECT b.id, b.bed_no, b.bed_type::text AS bed_type, b.status::text AS status, w.id AS ward_id, w.name AS ward,
                dep.name AS department, a.id AS admission_id, p.full_name AS patient
           FROM org.bed b
           JOIN org.ward w ON w.id = b.ward_id
           LEFT JOIN org.department dep ON dep.id = w.department_id
           LEFT JOIN access.admission a ON a.bed_id = b.id AND a.discharged_at IS NULL
           LEFT JOIN identity.person p ON p.id = a.patient_person_id
          WHERE b.hospital_id = $1::uuid
            AND ($2::uuid IS NULL OR b.ward_id = $2::uuid)
            AND ($3::uuid IS NULL OR w.department_id = $3::uuid)
          ORDER BY w.code, length(b.bed_no), b.bed_no`,
        [ctx.hospitalId, q.wardId ?? null, q.departmentId ?? null],
      ),
    ])
    return {
      wards: wards.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        department: w.department,
        isActive: w.is_active,
        totalBeds: w.total,
        occupied: w.occupied,
        free: w.free,
      })),
      beds: beds.map((b) => ({
        id: b.id,
        bedNo: b.bed_no,
        bedType: b.bed_type,
        status: b.status,
        wardId: b.ward_id,
        ward: b.ward,
        department: b.department,
        patient: b.patient ? shortName(b.patient) : null,
        admissionId: b.admission_id,
      })),
    }
  }

  async setBedStatus(user: AuthenticatedUser, bedId: string, status: 'free' | 'reserved' | 'cleaning' | 'out_of_service') {
    const ctx = await this.ctxOf(user)
    await withHospitalTx(this.db, ctx, async (c) => {
      const cur = await c.query<{ status: string; bed_no: string; open_admission: boolean }>(
        `SELECT b.status::text AS status, b.bed_no,
                EXISTS (SELECT 1 FROM access.admission a WHERE a.bed_id = b.id AND a.discharged_at IS NULL) AS open_admission
           FROM org.bed b WHERE b.id = $1::uuid AND b.hospital_id = $2::uuid FOR UPDATE`,
        [bedId, ctx.hospitalId],
      )
      const b = cur.rows[0]
      if (!b) throw new NotFoundException({ success: false, errorMessage: 'Bed not found in your hospital.' })
      if (b.status === 'occupied' || b.open_admission) {
        throw new ConflictException({ success: false, errorMessage: 'This bed has a patient. Discharge or move the patient first.' })
      }
      await c.query('UPDATE org.bed SET status = $2::org.bed_status WHERE id = $1::uuid AND hospital_id = $3::uuid', [
        bedId,
        status,
        ctx.hospitalId,
      ])
      // The district dashboard reads the bed counts per type; keep that cache in step.
      await c.query('SELECT org.refresh_bed_availability($1::uuid, $2::uuid)', [ctx.hospitalId, ctx.userId])
      await auditScoped(c, ctx, 'bed.status', `Bed ${b.bed_no} set to ${status.replace('_', ' ')}`, { entityType: 'bed', entityId: bedId })
    })
    return { success: true, status }
  }

  // ------------------------------------------------------------------ admissions

  async admissions(user: AuthenticatedUser, q: { department?: string; limit: number }) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const base = `
      FROM access.admission a
      JOIN identity.person p ON p.id = a.patient_person_id
      LEFT JOIN org.bed b ON b.id = a.bed_id
      LEFT JOIN org.ward w ON w.id = b.ward_id
      LEFT JOIN org.department dep ON dep.id = COALESCE(a.department_id, w.department_id)
      LEFT JOIN LATERAL (
        SELECT s.news_band::text AS band FROM inpatient.vital_set s
         WHERE s.admission_id = a.id AND NOT s.entered_in_error ORDER BY s.observed_at DESC LIMIT 1) vs ON true
      LEFT JOIN LATERAL (
        SELECT pp.full_name FROM access.admission_team t
          JOIN identity.app_user tu ON tu.id = t.user_id JOIN identity.person pp ON pp.id = tu.person_id
         WHERE t.admission_id = a.id AND t.team_role = 'doctor' AND t.removed_at IS NULL
         ORDER BY t.added_at LIMIT 1) doc ON true
      WHERE a.hospital_id = $1::uuid`
    const [rows, kpi, stay] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT a.id, p.full_name, a.ip_number, a.admitted_at, a.expected_discharge::text AS expected_discharge,
                b.bed_no, w.name AS ward, dep.name AS department, vs.band, doc.full_name AS doctor,
                (a.expected_discharge = ${istDate('$2')}) AS discharge_today
           ${base} AND a.discharged_at IS NULL
            AND ($3::text IS NULL OR lower(dep.name) = lower($3::text))
          ORDER BY a.admitted_at DESC LIMIT $4`,
        [ctx.hospitalId, now, q.department ?? null, q.limit],
      ),
      this.db.query<Record<string, any>>(
        `SELECT count(*)::int AS admitted,
                count(*) FILTER (WHERE (a.admitted_at AT TIME ZONE 'Asia/Kolkata')::date = ${istDate('$2')})::int AS since_midnight,
                count(*) FILTER (WHERE a.expected_discharge = ${istDate('$2')})::int AS discharges_planned,
                count(*) FILTER (WHERE vs.band = 'high')::int AS critical,
                count(*) FILTER (WHERE vs.band = 'high' AND lower(dep.name) = 'icu')::int AS critical_icu
           ${base} AND a.discharged_at IS NULL`,
        [ctx.hospitalId, now],
      ),
      this.db.query<{ avg_days: number | null }>(
        `SELECT round(avg(extract(epoch FROM discharged_at - admitted_at) / 86400), 1)::float8 AS avg_days
           FROM access.admission
          WHERE hospital_id = $1::uuid AND discharged_at IS NOT NULL AND discharged_at > $2::timestamptz - interval '90 days'
            AND discharged_at <= $2::timestamptz`,
        [ctx.hospitalId, now],
      ),
    ])
    const k = kpi[0]!
    return {
      kpis: {
        admitted: k.admitted,
        admittedSinceMidnight: k.since_midnight,
        dischargesPlanned: k.discharges_planned,
        critical: k.critical,
        criticalIcu: k.critical_icu,
        criticalOther: k.critical - k.critical_icu,
        avgStayDays: stay[0]?.avg_days ?? null,
      },
      items: rows.map((r) => ({
        id: r.id,
        patient: shortName(r.full_name),
        ipNumber: r.ip_number,
        bed: r.bed_no ? `${r.ward ? `${r.ward} · ` : ''}Bed ${r.bed_no}` : null,
        department: r.department,
        status: r.discharge_today ? 'discharge_today' : r.band === 'high' ? 'critical' : r.band === 'medium' || r.band === 'low_medium' ? 'watch' : 'stable',
        doctor: r.doctor,
        admittedAt: new Date(r.admitted_at).toISOString(),
        expectedDischarge: r.expected_discharge,
      })),
    }
  }

  // ------------------------------------------------------------------ doctor roster

  private async mondayOf(now: string): Promise<string> {
    const r = await this.db.query<{ d: string }>(`SELECT date_trunc('week', ${istDate('$1')})::date::text AS d`, [now])
    return r[0]!.d
  }

  async roster(user: AuthenticatedUser, weekStartParam?: string) {
    const ctx = await this.ctxOf(user)
    const now = demoNow(this.config).toISOString()
    const weekStart = weekStartParam ?? (await this.mondayOf(now))
    if (!isMonday(weekStart)) {
      throw new BadRequestException({ success: false, errorMessage: 'weekStart must be a Monday (YYYY-MM-DD).' })
    }
    return this.buildRoster(ctx, weekStart)
  }

  private async buildRoster(ctx: HospitalContext, weekStart: string) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const [doctors, cells, week] = await Promise.all([
      this.db.query<{ user_id: string; full_name: string; department: string | null }>(
        `SELECT au.id AS user_id, p.full_name, dep.name AS department
           FROM identity.doctor_profile dp
           JOIN identity.app_user au ON au.id = dp.user_id AND au.status = 'active'::identity.account_status
           JOIN identity.person p ON p.id = au.person_id
           LEFT JOIN org.department dep ON dep.id = dp.department_id
          WHERE dp.hospital_id = $1::uuid ORDER BY p.full_name`,
        [ctx.hospitalId],
      ),
      this.db.query<{ doctor_user_id: string; duty_date: string; shift: string }>(
        `SELECT doctor_user_id, duty_date::text AS duty_date, shift FROM org.doctor_roster
          WHERE hospital_id = $1::uuid AND duty_date BETWEEN $2::date AND $2::date + 6`,
        [ctx.hospitalId, weekStart],
      ),
      this.db.query<{ min_doctors_per_day: number; min_night_oncall: number; published_at: Date | null }>(
        `SELECT min_doctors_per_day, min_night_oncall, published_at FROM org.roster_week
          WHERE hospital_id = $1::uuid AND week_start = $2::date`,
        [ctx.hospitalId, weekStart],
      ),
    ])
    const minDoctors = week[0]?.min_doctors_per_day ?? 4
    const minNight = week[0]?.min_night_oncall ?? 1
    const grid = new Map<string, string>()
    for (const c of cells) grid.set(`${c.doctor_user_id}|${c.duty_date}`, c.shift)
    const coverage = days.map((date) => {
      let onDuty = 0
      let night = 0
      for (const d of doctors) {
        const s = grid.get(`${d.user_id}|${date}`)
        if (s && s !== 'off') onDuty++
        if (s === 'night') night++
      }
      return {
        date,
        weekday: WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()],
        doctorsOnDuty: onDuty,
        doctorsTotal: doctors.length,
        nightOnCall: night,
        thinCover: onDuty < minDoctors || night < minNight,
      }
    })
    const thin = coverage.filter((c) => c.thinCover)
    return {
      weekStart,
      days,
      rules: { minDoctorsPerDay: minDoctors, minNightOnCall: minNight },
      published: !!week[0]?.published_at,
      publishedAt: week[0]?.published_at ? new Date(week[0].published_at).toISOString() : null,
      doctors: doctors.map((d) => ({
        userId: d.user_id,
        name: d.full_name,
        department: d.department,
        shifts: Object.fromEntries(days.map((date) => [date, grid.get(`${d.user_id}|${date}`) ?? null])),
      })),
      coverage,
      warnings: thin.map((c) => `Thin cover on ${c.weekday}`),
    }
  }

  async updateRoster(
    user: AuthenticatedUser,
    weekStart: string,
    cells: { doctorUserId: string; date: string; shift: string }[],
  ) {
    const ctx = await this.ctxOf(user)
    if (!isMonday(weekStart)) {
      throw new BadRequestException({ success: false, errorMessage: 'weekStart must be a Monday (YYYY-MM-DD).' })
    }
    const days = new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)))
    if (cells.some((c) => !days.has(c.date))) {
      throw new BadRequestException({ success: false, errorMessage: 'Every date must be inside the chosen week.' })
    }
    const ids = [...new Set(cells.map((c) => c.doctorUserId))]
    const mine = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM identity.doctor_profile WHERE hospital_id = $1::uuid AND user_id = ANY($2::uuid[])',
      [ctx.hospitalId, ids],
    )
    if (mine.length !== ids.length) {
      throw new BadRequestException({ success: false, errorMessage: 'One or more doctors do not work at your hospital.' })
    }
    await withHospitalTx(this.db, ctx, async (c) => {
      // Editing a published week makes it a draft again until it is re-published.
      await c.query(
        `INSERT INTO org.roster_week (hospital_id, week_start) VALUES ($1::uuid, $2::date)
         ON CONFLICT (hospital_id, week_start) DO UPDATE SET published_at = NULL, published_by_user_id = NULL`,
        [ctx.hospitalId, weekStart],
      )
      for (const cell of cells) {
        await c.query(
          `INSERT INTO org.doctor_roster (hospital_id, doctor_user_id, duty_date, shift)
           VALUES ($1::uuid, $2::uuid, $3::date, $4)
           ON CONFLICT (hospital_id, doctor_user_id, duty_date) DO UPDATE SET shift = EXCLUDED.shift`,
          [ctx.hospitalId, cell.doctorUserId, cell.date, cell.shift],
        )
      }
      await auditScoped(c, ctx, 'roster.updated', `Doctor roster edited · week of ${weekStart}`, {
        details: { weekStart, cellsChanged: cells.length },
      })
    })
    return { success: true, ...(await this.buildRoster(ctx, weekStart)) }
  }

  async publishRoster(user: AuthenticatedUser, weekStart: string) {
    const ctx = await this.ctxOf(user)
    if (!isMonday(weekStart)) {
      throw new BadRequestException({ success: false, errorMessage: 'weekStart must be a Monday (YYYY-MM-DD).' })
    }
    await withHospitalTx(this.db, ctx, async (c) => {
      await c.query(
        `INSERT INTO org.roster_week (hospital_id, week_start, published_at, published_by_user_id)
         VALUES ($1::uuid, $2::date, now(), $3::uuid)
         ON CONFLICT (hospital_id, week_start) DO UPDATE SET published_at = now(), published_by_user_id = EXCLUDED.published_by_user_id`,
        [ctx.hospitalId, weekStart, ctx.userId],
      )
      await auditScoped(c, ctx, 'roster.published', `Doctor roster published · week of ${weekStart}`, { details: { weekStart } })
    })
    const roster = await this.buildRoster(ctx, weekStart)
    return { success: true, message: 'Published. Staff were notified (mock).', ...roster }
  }
}
