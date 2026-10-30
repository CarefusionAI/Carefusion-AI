import { Injectable } from '@nestjs/common'
import type { GovAdmins, GovDirectory, GovGrievances } from '@carefusion/shared/dist/gov-admin'
import { DatabaseService } from '../database/database.service'
import { GovScopeService, LEVEL_META } from './gov-scope.service'
import type { GovScope } from './gov-scope.service'
import { iso, numOr0, unavailable } from './gov-util'

export type DirectoryKind = 'doctors' | 'facilities' | 'staff'
export type DirectoryStatus = 'all' | 'active' | 'pending' | 'suspended'

/** Directory of doctors, facilities and staff (never citizens), admin accounts below this level, and grievances. */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly scopes: GovScopeService,
  ) {}

  async directory(scope: GovScope, kind: DirectoryKind, status: DirectoryStatus, q: string | null, limit: number, offset: number): Promise<GovDirectory> {
    const ids = scope.districtIds
    const like = q ? `%${q}%` : null

    // --- stat cards (always for the whole area, so the cards do not change with the filter)
    const stats = await this.db.query<any>(
      `SELECT
         (SELECT count(*) FROM identity.doctor_profile dp JOIN org.hospital h ON h.id = dp.hospital_id WHERE h.district_id = ANY($1::uuid[]))::int AS doctors,
         (SELECT count(*) FROM identity.doctor_profile dp JOIN identity.app_user au ON au.id = dp.user_id JOIN org.hospital h ON h.id = dp.hospital_id
           WHERE h.district_id = ANY($1::uuid[]) AND au.status = 'pending')::int AS doctors_pending,
         (SELECT count(*) FROM identity.doctor_profile dp JOIN identity.app_user au ON au.id = dp.user_id JOIN org.hospital h ON h.id = dp.hospital_id
           WHERE h.district_id = ANY($1::uuid[]) AND au.status IN ('suspended','deactivated'))::int AS doctors_suspended,
         (SELECT count(*) FROM org.hospital WHERE district_id = ANY($1::uuid[]))::int + (SELECT count(*) FROM org.pharmacy WHERE district_id = ANY($1::uuid[])) AS facilities,
         (SELECT count(*) FROM org.hospital WHERE district_id = ANY($1::uuid[]) AND status = 'pending')::int + (SELECT count(*) FROM org.pharmacy WHERE district_id = ANY($1::uuid[]) AND status = 'pending') AS facilities_pending,
         (SELECT count(*) FROM org.hospital WHERE district_id = ANY($1::uuid[]) AND status IN ('suspended','closed'))::int + (SELECT count(*) FROM org.pharmacy WHERE district_id = ANY($1::uuid[]) AND status IN ('suspended','closed')) AS facilities_suspended,
         (SELECT count(*) FROM identity.staff_profile sp JOIN org.hospital h ON h.id = sp.hospital_id WHERE h.district_id = ANY($1::uuid[]))::int AS staff,
         (SELECT count(*) FROM identity.staff_profile sp JOIN identity.app_user au ON au.id = sp.user_id JOIN org.hospital h ON h.id = sp.hospital_id
           WHERE h.district_id = ANY($1::uuid[]) AND au.status = 'pending')::int AS staff_pending,
         (SELECT count(*) FROM identity.staff_profile sp JOIN identity.app_user au ON au.id = sp.user_id JOIN org.hospital h ON h.id = sp.hospital_id
           WHERE h.district_id = ANY($1::uuid[]) AND au.status IN ('suspended','deactivated'))::int AS staff_suspended`,
      [ids],
    )
    const s = stats[0]!
    const pending = numOr0(s.doctors_pending) + numOr0(s.facilities_pending) + numOr0(s.staff_pending)
    const suspended = numOr0(s.doctors_suspended) + numOr0(s.facilities_suspended) + numOr0(s.staff_suspended)

    // --- listing
    let items: GovDirectory['items'] = []
    let total = 0
    if (kind === 'doctors') {
      const where = `h.district_id = ANY($1::uuid[]) AND ($2::text = 'all' OR ($2::text = 'suspended' AND au.status IN ('suspended','deactivated')) OR (au.status::text = $2::text AND $2::text <> 'suspended'))
                     AND ($3::text IS NULL OR p.full_name ILIKE $3::text OR h.name ILIKE $3::text OR dp.specialisation ILIKE $3::text)`
      const from = `FROM identity.doctor_profile dp JOIN identity.app_user au ON au.id = dp.user_id JOIN identity.person p ON p.id = au.person_id
                    JOIN org.hospital h ON h.id = dp.hospital_id JOIN geo.district d ON d.id = h.district_id`
      total = numOr0((await this.db.query<any>(`SELECT count(*)::int AS n ${from} WHERE ${where}`, [ids, status, like]))[0]?.n)
      const rows = await this.db.query<any>(
        `SELECT au.id, p.full_name AS name, dp.specialisation, dp.hpr_id, h.name AS org, d.name AS district, au.status::text AS status, dp.hpr_verified_at
           ${from} WHERE ${where} ORDER BY p.full_name LIMIT ${Math.min(limit, 200)} OFFSET ${Math.max(offset, 0)}`,
        [ids, status, like],
      )
      items = rows.map((r) => ({
        id: r.id, name: r.name, detail: r.specialisation, ref: r.hpr_id, organisation: r.org, district: r.district, status: r.status,
        verifiedAt: iso(r.hpr_verified_at),
      }))
    } else if (kind === 'staff') {
      const where = `h.district_id = ANY($1::uuid[]) AND ($2::text = 'all' OR ($2::text = 'suspended' AND au.status IN ('suspended','deactivated')) OR (au.status::text = $2::text AND $2::text <> 'suspended'))
                     AND ($3::text IS NULL OR p.full_name ILIKE $3::text OR h.name ILIKE $3::text)`
      const from = `FROM identity.staff_profile sp JOIN identity.app_user au ON au.id = sp.user_id JOIN identity.person p ON p.id = au.person_id
                    JOIN org.hospital h ON h.id = sp.hospital_id JOIN geo.district d ON d.id = h.district_id`
      total = numOr0((await this.db.query<any>(`SELECT count(*)::int AS n ${from} WHERE ${where}`, [ids, status, like]))[0]?.n)
      const rows = await this.db.query<any>(
        `SELECT au.id, p.full_name AS name, sp.staff_role::text AS role, sp.designation, sp.employee_code, h.name AS org, d.name AS district, au.status::text AS status
           ${from} WHERE ${where} ORDER BY p.full_name LIMIT ${Math.min(limit, 200)} OFFSET ${Math.max(offset, 0)}`,
        [ids, status, like],
      )
      items = rows.map((r) => ({
        id: r.id, name: r.name, detail: r.designation ?? r.role, ref: r.employee_code, organisation: r.org, district: r.district, status: r.status, verifiedAt: null,
      }))
    } else {
      const facStatus = `($2::text = 'all' OR ($2::text = 'suspended' AND f.status IN ('suspended','closed')) OR (f.status = $2::text AND $2::text <> 'suspended'))`
      const union = `(SELECT h.id, 'hospital' AS kind, h.name, h.hospital_type::text AS subtype, h.hfr_id AS ref, h.ownership::text AS ownership, h.district_id, h.status::text AS status, h.approved_at AS verified_at FROM org.hospital h
                      UNION ALL
                      SELECT p.id, 'pharmacy', p.name, p.pharmacy_type::text, p.licence_no, NULL, p.district_id, p.status::text, p.approved_at FROM org.pharmacy p) f`
      const where = `f.district_id = ANY($1::uuid[]) AND ${facStatus} AND ($3::text IS NULL OR f.name ILIKE $3::text)`
      total = numOr0((await this.db.query<any>(`SELECT count(*)::int AS n FROM ${union} WHERE ${where}`, [ids, status, like]))[0]?.n)
      const rows = await this.db.query<any>(
        `SELECT f.id, f.kind, f.name, f.subtype, f.ref, f.ownership, d.name AS district, f.status, f.verified_at
           FROM ${union} JOIN geo.district d ON d.id = f.district_id WHERE ${where}
          ORDER BY f.name LIMIT ${Math.min(limit, 200)} OFFSET ${Math.max(offset, 0)}`,
        [ids, status, like],
      )
      items = rows.map((r) => ({
        id: r.id, name: r.name, detail: `${r.kind === 'hospital' ? 'Hospital' : 'Pharmacy'} · ${r.subtype}${r.ownership ? ` · ${r.ownership}` : ''}`,
        ref: r.ref, organisation: null, district: r.district, status: r.status, verifiedAt: iso(r.verified_at),
      }))
    }

    const mix = await this.db.query<any>(
      `SELECT t.name AS type, count(*)::int AS n, count(*) FILTER (WHERE h.status = 'active')::int AS active
         FROM org.hospital h JOIN org.hospital_type t ON t.code = h.hospital_type
        WHERE h.district_id = ANY($1::uuid[]) GROUP BY t.name
       UNION ALL
       SELECT 'Pharmacy', count(*)::int, count(*) FILTER (WHERE status = 'active')::int FROM org.pharmacy WHERE district_id = ANY($1::uuid[])
       ORDER BY 2 DESC`,
      [ids],
    )

    return {
      level: scope.level,
      kind,
      status,
      stats: {
        doctors: s.doctors,
        facilities: numOr0(s.facilities),
        staff: s.staff,
        needsAttention: pending,
        suspended,
      },
      total,
      items,
      facilityMix: mix.filter((m) => m.n > 0).map((m) => ({ type: m.type, count: m.n, onPlatformPct: Math.round((m.active / m.n) * 100) })),
      note: 'Citizens are never listed here.',
    }
  }

  async admins(scope: GovScope): Promise<GovAdmins> {
    const meta = LEVEL_META[scope.level]
    const peers = await this.scopes.peers(scope)
    const base = {
      level: scope.level,
      createLevel: meta.createLevel,
      createEndpoint: meta.createLevel ? 'POST /api/v1/admin/create-admin' : null,
      secondSigners: peers.map((p) => p.name),
      rules: [
        'Neither signer can approve their own account.',
        'The new admin is verified by Aadhaar e-KYC (mock connector in the alpha) and a hardware security key.',
        'Requests expire after 72 hours without the second signature.',
      ],
    }
    if (!meta.createLevel) {
      return { ...base, managed: unavailable('A district admin manages no admin accounts: block health admins do not exist as an account type in the alpha.') }
    }
    const lvl = meta.createLevel
    const rows = await this.db.query<any>(
      `SELECT au.id, p.full_name AS name, au.status::text AS status, lower(ap.valid) AS since,
              coalesce(d.name, s.name, z.name || ' zone') AS covers
         FROM admin.admin_post ap
         JOIN identity.app_user au ON au.id = ap.user_id
         JOIN identity.person p ON p.id = au.person_id
         LEFT JOIN geo.district d ON d.id = ap.district_id
         LEFT JOIN geo.state s ON s.id = ap.state_id
         LEFT JOIN geo.zone z ON z.id = ap.zone_id
        WHERE ap.valid @> now() AND ap.level = $1::admin.admin_level
          AND ( ($1::text = 'district' AND ap.district_id = ANY($2::uuid[]))
             OR ($1::text = 'state' AND ap.state_id = ANY($3::smallint[]))
             OR ($1::text = 'zonal') )
        ORDER BY covers, p.full_name`,
      [lvl, scope.districtIds, scope.stateIds],
    )
    return {
      ...base,
      managed: {
        available: true,
        data: rows.map((r) => ({ userId: r.id, name: r.name, level: lvl, covers: r.covers, since: iso(r.since)!, status: r.status })),
      },
    }
  }

  async grievances(scope: GovScope): Promise<GovGrievances> {
    const rows = await this.db.query<any>(
      `SELECT c.id, c.ref_no, c.title, c.status, c.severity, c.escalation_level, c.created_at, c.due_at, c.resolved_at,
              h.name AS facility, d.name AS district
         FROM engage.complaint c
         LEFT JOIN org.hospital h ON h.id = c.hospital_id
         JOIN geo.district d ON d.id = c.district_id
        WHERE c.district_id = ANY($1::uuid[])
        ORDER BY (c.status IN ('open','assigned')) DESC, c.created_at DESC LIMIT 50`,
      [scope.districtIds],
    )
    const ageing = await this.db.query<any>(
      `SELECT coalesce(sum(age_0_2_days),0)::int AS a, coalesce(sum(age_3_7_days),0)::int AS b, coalesce(sum(age_over_7_days),0)::int AS c, coalesce(sum(complaints),0)::int AS n
         FROM report.v_grievance_ageing WHERE district_id = ANY($1::uuid[]) AND status IN ('open','assigned')`,
      [scope.districtIds],
    )
    const a = ageing[0]!
    return {
      level: scope.level,
      open: a.n,
      ageing: { upTo2Days: a.a, from3To7Days: a.b, over7Days: a.c },
      items: rows.map((r) => ({
        id: r.id,
        ref: r.ref_no,
        title: r.title,
        facility: r.facility,
        district: r.district,
        status: r.status,
        severity: r.severity,
        escalationLevel: r.escalation_level,
        createdAt: iso(r.created_at)!,
        dueAt: iso(r.due_at),
        resolvedAt: iso(r.resolved_at),
      })),
      note: 'Complaint text and the citizen who raised it are never shown in the console.',
    }
  }
}
