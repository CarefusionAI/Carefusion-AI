import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { DoctorPatientHeader, DoctorSessionInfo } from '@carefusion/shared/dist/doctor.js'
import { DoctorTx, toIso } from './doctor-db.service'

export type ShareCategory = 'lab' | 'rx' | 'vitals' | 'imaging' | 'genomic' | 'mental_health'
const DEFAULT_SHARE: Record<ShareCategory, boolean> = {
  lab: true,
  rx: true,
  vitals: true,
  imaging: false,
  genomic: false,
  mental_health: false,
}

export interface LiveSession {
  id: string
  patientPersonId: string
  mode: DoctorSessionInfo['mode']
  startedAt: Date
  expiresAt: Date
  isFamilyMember: boolean
  startInsideGeofence: boolean | null
}

/** The patient's "what a doctor can see" switches. No row = default (lab, rx, vitals on; the rest off). */
export async function shareFlags(tx: DoctorTx, personId: string): Promise<Record<ShareCategory, boolean>> {
  const rows = await tx.query<{ category: ShareCategory; enabled: boolean }>(
    `SELECT category::text AS category, enabled FROM identity.share_preference WHERE person_id = $1`,
    [personId],
  )
  const flags = { ...DEFAULT_SHARE }
  for (const r of rows) flags[r.category] = r.enabled
  return flags
}

export function hiddenCategories(flags: Record<ShareCategory, boolean>): ShareCategory[] {
  return (Object.keys(flags) as ShareCategory[]).filter((k) => !flags[k])
}

/**
 * The doctor's own, still-open session. `write` = the call adds to the record (not allowed in a break-glass session).
 * Row-level security would also refuse a read without a live session; this gives a clear message first.
 */
export async function requireLiveSession(tx: DoctorTx, sessionId: string, opts: { write?: boolean } = {}): Promise<LiveSession> {
  const row = await tx.one<any>(
    `SELECT id, patient_person_id, mode::text AS mode, started_at, expires_at, is_family_member, start_inside_geofence,
            ended_at, (expires_at > now()) AS live
       FROM access.access_session WHERE id = $1 AND user_id = util.ctx_user_id()`,
    [sessionId],
  )
  if (!row) throw new NotFoundException('Session not found')
  if (row.ended_at || !row.live) {
    throw new ForbiddenException('This record session has ended. Ask the patient for a new key.')
  }
  if (opts.write && row.mode === 'break_glass') {
    throw new ForbiddenException('Emergency (break-glass) access is read-only')
  }
  return {
    id: row.id,
    patientPersonId: row.patient_person_id,
    mode: row.mode,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    isFamilyMember: row.is_family_member,
    startInsideGeofence: row.start_inside_geofence,
  }
}

export async function loadHeader(tx: DoctorTx, personId: string): Promise<DoctorPatientHeader> {
  const r = await tx.one<any>(
    `SELECT p.id, p.full_name, date_part('year', age(p.date_of_birth))::int AS age, p.sex::text AS sex,
            COALESCE(cp.blood_group::text, 'unknown') AS blood_group, p.abha_number, d.name AS district,
            p.is_unidentified, p.temp_label
       FROM identity.person p
       LEFT JOIN identity.citizen_profile cp ON cp.person_id = p.id
       LEFT JOIN geo.district d ON d.id = cp.district_id
      WHERE p.id = $1`,
    [personId],
  )
  if (!r) throw new NotFoundException('Patient not found')
  return {
    personId: r.id,
    name: r.is_unidentified ? (r.temp_label ?? 'Unidentified patient') : r.full_name,
    age: r.age,
    sex: r.sex,
    bloodGroup: r.blood_group,
    abhaNumber: r.abha_number,
    district: r.district,
    isUnidentified: r.is_unidentified,
    tempLabel: r.temp_label,
  }
}

export async function sessionInfoById(tx: DoctorTx, sessionId: string): Promise<DoctorSessionInfo> {
  const s = await tx.one<any>(
    `SELECT s.id, s.patient_person_id, s.mode::text AS mode, s.started_at, s.expires_at, s.ended_at, s.ended_by::text AS ended_by,
            s.is_family_member, s.start_inside_geofence,
            (s.ended_at IS NULL AND s.expires_at > now()) AS live,
            greatest(0, floor(extract(epoch FROM (s.expires_at - now()))))::int AS seconds_left,
            (SELECT v.id FROM engage.op_visit v WHERE v.access_session_id = s.id LIMIT 1) AS visit_id
       FROM access.access_session s WHERE s.id = $1 AND s.user_id = util.ctx_user_id()`,
    [sessionId],
  )
  if (!s) throw new NotFoundException('Session not found')
  const [patient, flags] = await Promise.all([loadHeader(tx, s.patient_person_id), shareFlags(tx, s.patient_person_id)])
  return {
    sessionId: s.id,
    mode: s.mode,
    patient,
    startedAt: toIso(s.started_at)!,
    expiresAt: toIso(s.expires_at)!,
    secondsLeft: s.live ? s.seconds_left : 0,
    live: s.live,
    endedAt: toIso(s.ended_at),
    endedBy: s.ended_by,
    readOnly: s.mode === 'break_glass',
    isFamilyMember: s.is_family_member,
    insideGeofence: s.start_inside_geofence,
    visitId: s.visit_id,
    hiddenByPatient: hiddenCategories(flags),
  }
}

/** Record that the doctor looked at something in the record (access.item_view). Titles only, never the content. */
export async function recordItemView(
  tx: DoctorTx,
  s: LiveSession,
  item: { kind: string; id?: string | null; label?: string | null },
): Promise<void> {
  await tx.query(
    `INSERT INTO access.item_view (session_id, patient_person_id, user_id, item_kind, item_id, label)
     VALUES ($1, $2, util.ctx_user_id(), $3, $4, $5)`,
    [s.id, s.patientPersonId, item.kind, item.id ?? null, item.label ?? null],
  )
}

/** A patient's system folder (Doctor uploads, AI Chat, Image / Genomic / Temporal Analysis); created when missing. */
export async function systemFolderId(tx: DoctorTx, personId: string, kind: string): Promise<string> {
  let f = await tx.one<{ id: string }>(`SELECT id FROM records.folder WHERE patient_person_id = $1 AND kind = $2::records.folder_kind`, [personId, kind])
  if (!f) {
    await tx.query(`SELECT records.create_system_folders($1, util.ctx_user_id())`, [personId])
    f = await tx.one<{ id: string }>(`SELECT id FROM records.folder WHERE patient_person_id = $1 AND kind = $2::records.folder_kind`, [personId, kind])
  }
  if (!f) throw new NotFoundException('Patient folder not available')
  return f.id
}
