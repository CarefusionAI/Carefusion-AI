import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { UpdateDoctorProfile, UpdateDoctorSettings } from '@carefusion/shared/dist/doctor.js'
import type { AuthenticatedUser } from '../auth/types'
import { DoctorDbService, toIso } from './doctor-db.service'

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!
}

@Injectable()
export class ProfileService {
  constructor(private readonly db: DoctorDbService) {}

  async profile(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const d = await tx.one<any>(
        `SELECT p.full_name, dp.hpr_id, dp.council_name, dp.council_reg_no, dp.specialisation, dp.degrees, dp.languages, dp.bio, dp.years_experience, dp.fee_amount::float8 AS fee,
                dp.accepts_walkin, dp.offers_teleconsult, dp.duty_hours, dp.hpr_verified_at, dp.signing_method::text AS signing_method, h.name AS hospital, dep.name AS department
           FROM identity.doctor_profile dp JOIN identity.app_user u ON u.id = dp.user_id JOIN identity.person p ON p.id = u.person_id
           JOIN org.hospital h ON h.id = dp.hospital_id LEFT JOIN org.department dep ON dep.id = dp.department_id WHERE dp.user_id = util.ctx_user_id()`,
      )
      if (!d) throw new NotFoundException('Doctor profile not found')
      const rating = await tx.one<any>(
        `SELECT count(*)::int AS n, round(avg(stars), 1)::float8 AS avg,
                count(*) FILTER (WHERE stars = 5)::int AS s5, count(*) FILTER (WHERE stars = 4)::int AS s4, count(*) FILTER (WHERE stars = 3)::int AS s3,
                count(*) FILTER (WHERE stars = 2)::int AS s2, count(*) FILTER (WHERE stars = 1)::int AS s1
           FROM engage.rating WHERE target_type = 'doctor' AND target_id = util.ctx_user_id() AND moderation_status = 'published'`,
      )
      const tags = await tx.query<any>(
        `SELECT t AS tag, count(*)::int AS n FROM engage.rating r, unnest(r.tags) t
          WHERE r.target_type = 'doctor' AND r.target_id = util.ctx_user_id() AND r.moderation_status = 'published' GROUP BY t ORDER BY n DESC LIMIT 6`,
      )
      const reviews = await tx.query<any>(
        `SELECT r.id, p.full_name, r.stars, r.comment, r.tags, r.created_at, r.visit_verified,
                (SELECT rr.body FROM engage.rating_reply rr WHERE rr.rating_id = r.id ORDER BY rr.created_at DESC LIMIT 1) AS my_reply
           FROM engage.rating r JOIN identity.person p ON p.id = r.rater_person_id
          WHERE r.target_type = 'doctor' AND r.target_id = util.ctx_user_id() AND r.moderation_status = 'published' AND r.comment IS NOT NULL
          ORDER BY r.created_at DESC LIMIT 20`,
      )
      const kv = await tx.one<any>(
        `SELECT (SELECT count(*)::int FROM engage.op_visit WHERE doctor_user_id = util.ctx_user_id() AND status = 'done' AND visit_date >= date_trunc('year', current_date)) AS consults,
                (SELECT count(*)::int FROM engage.op_visit v JOIN engage.appointment a ON a.id = v.appointment_id WHERE v.doctor_user_id = util.ctx_user_id() AND a.visit_type = 'teleconsult') AS teleconsults,
                (SELECT round(avg(extract(epoch FROM (ended_at - started_at)) / 60))::int FROM engage.op_visit WHERE doctor_user_id = util.ctx_user_id() AND ended_at IS NOT NULL AND started_at IS NOT NULL) AS avg_minutes`,
      )
      const refs = await tx.asOwner(() => tx.one<{ n: number }>(`SELECT count(*)::int AS n FROM records.referral WHERE from_user_id = util.ctx_user_id()`))
      const n = rating?.n ?? 0
      const pct = (c: number) => (n ? Math.round((100 * c) / n) : 0)
      return {
        name: d.full_name,
        specialisation: d.specialisation,
        department: d.department,
        hospital: d.hospital,
        hprId: d.hpr_id,
        hprVerified: !!d.hpr_verified_at,
        council: `${d.council_name} ${d.council_reg_no}`,
        degrees: d.degrees,
        languages: d.languages,
        bio: d.bio,
        yearsExperience: d.years_experience,
        acceptsWalkin: d.accepts_walkin,
        offersTeleconsult: d.offers_teleconsult,
        dutyHours: d.duty_hours,
        signingMethod: d.signing_method,
        stats: { consultsThisYear: kv?.consults ?? 0, teleconsults: kv?.teleconsults ?? 0, avgConsultMinutes: kv?.avg_minutes ?? null, referrals: refs?.n ?? 0 },
        rating: { average: rating?.avg ?? null, count: n, breakdown: { 5: pct(rating?.s5 ?? 0), 4: pct(rating?.s4 ?? 0), 3: pct(rating?.s3 ?? 0), 2: pct(rating?.s2 ?? 0), 1: pct(rating?.s1 ?? 0) } },
        mostMentioned: tags.map((t) => ({ tag: t.tag, count: t.n })),
        reviews: reviews.map((r) => ({ id: r.id, who: shortName(r.full_name), date: toIso(r.created_at), stars: r.stars, text: r.comment, tags: r.tags, verifiedVisit: r.visit_verified, myReply: r.my_reply })),
      }
    })
  }

  async updateProfile(user: AuthenticatedUser | undefined, body: UpdateDoctorProfile) {
    return this.db.run(user, async (tx) => {
      const sets: string[] = []
      const params: unknown[] = []
      const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`) }
      if (body.bio !== undefined) add('bio', body.bio)
      if (body.languages !== undefined) add('languages', body.languages)
      if (body.acceptsWalkin !== undefined) add('accepts_walkin', body.acceptsWalkin)
      if (body.offersTeleconsult !== undefined) add('offers_teleconsult', body.offersTeleconsult)
      if (!sets.length) throw new BadRequestException('Nothing to update')
      await tx.query(`UPDATE identity.doctor_profile SET ${sets.join(', ')} WHERE user_id = util.ctx_user_id()`, params)
      await tx.audit('profile.update', { entityType: 'doctor_profile', details: { fields: Object.keys(body) } })
      return { updated: true }
    })
  }

  async replyReview(user: AuthenticatedUser | undefined, ratingId: string, body: string) {
    return this.db.run(user, async (tx) => {
      const r = await tx.one(`SELECT 1 FROM engage.rating WHERE id = $1 AND target_type = 'doctor' AND target_id = util.ctx_user_id() AND moderation_status = 'published'`, [ratingId])
      if (!r) throw new ForbiddenException('You can reply only to published reviews about you')
      const row = await tx.one<{ id: string; created_at: Date }>(`INSERT INTO engage.rating_reply (rating_id, author_user_id, body) VALUES ($1, util.ctx_user_id(), $2) RETURNING id, created_at`, [ratingId, body])
      return { id: row!.id, createdAt: toIso(row!.created_at) }
    })
  }

  async settings(user: AuthenticatedUser | undefined) {
    return this.db.run(user, async (tx) => {
      const pref = await tx.one<any>(`SELECT text_size, high_contrast, reduce_motion, quiet_hours FROM identity.user_preference WHERE user_id = util.ctx_user_id()`)
      const notif = await tx.query<any>(`SELECT category::text AS category, channel, enabled FROM engage.notification_pref WHERE user_id = util.ctx_user_id() ORDER BY category, channel`)
      const devices = await tx.query<any>(`SELECT id, platform, device_name, last_seen_at, last_city FROM identity.device WHERE user_id = util.ctx_user_id() AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST`)
      const d = await tx.one<any>(`SELECT hpr_id, council_name, council_reg_no, signing_method::text AS signing_method FROM identity.doctor_profile WHERE user_id = util.ctx_user_id()`)
      return {
        preferences: { textSize: pref?.text_size ?? 'default', highContrast: pref?.high_contrast ?? false, reduceMotion: pref?.reduce_motion ?? false, quietHours: pref?.quiet_hours ?? { enabled: true, from: '22:00', to: '07:00' } },
        notifications: notif.map((n) => ({ category: n.category, channel: n.channel, enabled: n.enabled })),
        devices: devices.map((x) => ({ id: x.id, platform: x.platform, name: x.device_name, lastSeenAt: toIso(x.last_seen_at), city: x.last_city })),
        account: { hprId: d?.hpr_id, council: d ? `${d.council_name} ${d.council_reg_no}` : null, eSign: d?.signing_method === 'mock' ? 'Demo e-Sign (simulated)' : d?.signing_method, twoFactor: 'Managed by the identity provider (Keycloak); not simulated here' },
        sessionRules: { idleLogoutMinutes: 15 },
      }
    })
  }

  async updateSettings(user: AuthenticatedUser | undefined, body: UpdateDoctorSettings) {
    return this.db.run(user, async (tx) => {
      if (body.textSize !== undefined || body.highContrast !== undefined || body.reduceMotion !== undefined || body.quietHours !== undefined) {
        await tx.query(
          `INSERT INTO identity.user_preference (user_id, text_size, high_contrast, reduce_motion, quiet_hours)
           VALUES (util.ctx_user_id(), COALESCE($1, 'default'), COALESCE($2, false), COALESCE($3, false), COALESCE($4::jsonb, '{"enabled":true,"from":"22:00","to":"07:00"}'::jsonb))
           ON CONFLICT (user_id) DO UPDATE SET text_size = COALESCE($1, user_preference.text_size), high_contrast = COALESCE($2, user_preference.high_contrast),
                  reduce_motion = COALESCE($3, user_preference.reduce_motion), quiet_hours = COALESCE($4::jsonb, user_preference.quiet_hours)`,
          [body.textSize ?? null, body.highContrast ?? null, body.reduceMotion ?? null, body.quietHours ? JSON.stringify(body.quietHours) : null],
        )
      }
      for (const n of body.notifications ?? []) {
        if (n.category === 'emergency' && !n.enabled) throw new BadRequestException('Emergency alerts cannot be switched off')
        await tx.query(
          `INSERT INTO engage.notification_pref (user_id, category, channel, enabled) VALUES (util.ctx_user_id(), $1::engage.pref_category, $2, $3)
           ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled = EXCLUDED.enabled`,
          [n.category, n.channel, n.enabled],
        )
      }
      return { updated: true }
    })
  }
}
