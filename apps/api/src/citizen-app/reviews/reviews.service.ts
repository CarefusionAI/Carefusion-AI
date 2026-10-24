import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  CreateReviewRequest,
  ListReviewsQuery,
  ReviewDto,
  ReviewListResponse,
  ReviewSummaryDto,
  ReviewableVisitDto,
} from '@carefusion/shared/dist/citizen-app.js'
import { EventsService } from '../../events/events.service'
import { RequestDbService, RequestTx } from '../../events/request-db.service'
import { isoReq } from '../common/clock'
import type { CitizenCtx } from '../common/citizen-request'
import { publicName } from './reviews.logic'

interface ReviewRow {
  id: string
  target_type: string
  target_id: string
  target_name: string | null
  stars: number
  comment: string | null
  tags: string[]
  visit_verified: boolean
  created_at: Date
  rater_person_id: string
  rater_name: string
  location: string | null
  department: string | null
  helpful: number
  marked: boolean
  reply_by: string | null
  reply_text: string | null
  reply_at: Date | null
}

const REVIEW_SELECT = `
  SELECT r.id, r.target_type::text AS target_type, r.target_id,
         CASE r.target_type WHEN 'hospital' THEN h.name WHEN 'doctor' THEN dper.full_name WHEN 'pharmacy' THEN ph.name END AS target_name,
         r.stars, r.comment, r.tags, r.visit_verified, r.created_at, r.rater_person_id, rp.full_name AS rater_name,
         d.name AS location, dep.name AS department,
         (SELECT count(*)::int FROM engage.rating_helpful x WHERE x.rating_id = r.id) AS helpful,
         EXISTS (SELECT 1 FROM engage.rating_helpful x WHERE x.rating_id = r.id AND x.user_id = $1) AS marked,
         rep.author_name AS reply_by, rep.body AS reply_text, rep.created_at AS reply_at
    FROM engage.rating r
    JOIN identity.person rp ON rp.id = r.rater_person_id
    LEFT JOIN org.hospital h ON r.target_type = 'hospital' AND h.id = r.target_id
    LEFT JOIN identity.app_user du ON r.target_type = 'doctor' AND du.id = r.target_id
    LEFT JOIN identity.person dper ON dper.id = du.person_id
    LEFT JOIN identity.doctor_profile ddp ON ddp.user_id = du.id
    LEFT JOIN org.hospital dh ON dh.id = ddp.hospital_id
    LEFT JOIN org.pharmacy ph ON r.target_type = 'pharmacy' AND ph.id = r.target_id
    LEFT JOIN geo.district d ON d.id = COALESCE(h.district_id, dh.district_id, ph.district_id)
    LEFT JOIN org.department dep ON dep.id = r.department_id
    LEFT JOIN LATERAL (
         SELECT rr.body, rr.created_at, ap.full_name AS author_name
           FROM engage.rating_reply rr
           LEFT JOIN identity.app_user au ON au.id = rr.author_user_id
           LEFT JOIN identity.person ap ON ap.id = au.person_id
          WHERE rr.rating_id = r.id ORDER BY rr.created_at DESC LIMIT 1) rep ON true`

function toDto(r: ReviewRow, mePerson: string): ReviewDto {
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    targetName: r.target_name,
    reviewerName: r.rater_person_id === mePerson ? 'You' : publicName(r.rater_name),
    location: r.location,
    department: r.department,
    stars: r.stars,
    comment: r.comment,
    tags: r.tags ?? [],
    verified: r.visit_verified,
    createdAt: isoReq(r.created_at),
    helpful: r.helpful,
    markedHelpful: r.marked,
    mine: r.rater_person_id === mePerson,
    reply: r.reply_text ? { by: r.reply_by, text: r.reply_text, at: isoReq(r.reply_at!) } : null,
  }
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly requestDb: RequestDbService,
    private readonly events: EventsService,
  ) {}

  async list(c: CitizenCtx, q: ListReviewsQuery): Promise<ReviewListResponse> {
    const where = `WHERE (r.moderation_status = 'published')
        AND ($2::text IS NULL OR r.target_type::text = $2) AND ($3::uuid IS NULL OR r.target_id = $3)
        AND ($4::int IS NULL OR r.stars = $4) AND ($5::int IS NULL OR r.stars >= $5)
        AND ($6::text IS NULL OR dep.name ILIKE $6) AND ($7::text IS NULL OR d.name ILIKE $7)`
    const order =
      q.sort === 'rating' ? 'r.stars DESC, r.created_at DESC' : q.sort === 'helpful' ? 'helpful DESC, r.created_at DESC' : 'r.created_at DESC'
    const params = [c.userId, q.targetType ?? null, q.targetId ?? null, q.stars ?? null, q.minStars ?? null, q.department ?? null, q.location ?? null]
    const rows = await this.requestDb.run(c.user, (tx) =>
      tx.query<ReviewRow>(`${REVIEW_SELECT} ${where} ORDER BY ${order} LIMIT ${q.limit}`, params),
    )
    // Summary of the same target (if given) or of everything matching the filters.
    const summary = await this.requestDb.run(c.user, (tx) => this.summaryOf(tx, q.targetType ?? null, q.targetId ?? null))
    return { summary, reviews: rows.map((r) => toDto(r, c.personId)) }
  }

  async summary(c: CitizenCtx, targetType: string | null, targetId: string | null): Promise<ReviewSummaryDto> {
    return this.requestDb.run(c.user, (tx) => this.summaryOf(tx, targetType, targetId))
  }

  private async summaryOf(tx: RequestTx, targetType: string | null, targetId: string | null): Promise<ReviewSummaryDto> {
    const base = `FROM engage.rating r WHERE r.moderation_status = 'published' AND ($1::text IS NULL OR r.target_type::text = $1) AND ($2::uuid IS NULL OR r.target_id = $2)`
    const agg = (
      await tx.query<{ n: number; avg: string | null; verified: number; replied: number; s1: number; s2: number; s3: number; s4: number; s5: number }>(
        `SELECT count(*)::int AS n, round(avg(r.stars), 2)::text AS avg,
                count(*) FILTER (WHERE r.visit_verified)::int AS verified,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM engage.rating_reply rr WHERE rr.rating_id = r.id))::int AS replied,
                count(*) FILTER (WHERE r.stars = 1)::int AS s1, count(*) FILTER (WHERE r.stars = 2)::int AS s2,
                count(*) FILTER (WHERE r.stars = 3)::int AS s3, count(*) FILTER (WHERE r.stars = 4)::int AS s4,
                count(*) FILTER (WHERE r.stars = 5)::int AS s5
           ${base}`,
        [targetType, targetId],
      )
    )[0]!
    const tags = await tx.query<{ tag: string; count: number }>(
      `SELECT t AS tag, count(*)::int AS count ${base.replace('FROM engage.rating r', 'FROM engage.rating r, unnest(r.tags) AS t')}
        GROUP BY t ORDER BY count DESC, t LIMIT 8`,
      [targetType, targetId],
    )
    return {
      average: agg.avg === null ? null : Number(agg.avg),
      count: agg.n,
      verified: agg.verified,
      replied: agg.replied,
      distribution: { '1': agg.s1, '2': agg.s2, '3': agg.s3, '4': agg.s4, '5': agg.s5 },
      tags,
    }
  }

  /** My reviews (any moderation state) and the finished visits I could still review. */
  async mine(c: CitizenCtx): Promise<{ reviews: ReviewDto[]; reviewable: ReviewableVisitDto[] }> {
    return this.requestDb.run(c.user, async (tx) => {
      const rows = await tx.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.rater_person_id = $2 ORDER BY r.created_at DESC`, [c.userId, c.personId])
      const visits = await tx.query<{
        id: string
        visit_date: string
        doctor_user_id: string | null
        doctor_name: string | null
        hospital_id: string
        hospital_name: string
        dept: string | null
        rated_doctor: boolean
        rated_hospital: boolean
      }>(
        `SELECT v.id, v.visit_date::text AS visit_date, v.doctor_user_id, dp.full_name AS doctor_name, v.hospital_id,
                h.name AS hospital_name, dep.name AS dept,
                EXISTS (SELECT 1 FROM engage.rating r WHERE r.rater_person_id = $1 AND r.target_type = 'doctor' AND r.target_id = v.doctor_user_id) AS rated_doctor,
                EXISTS (SELECT 1 FROM engage.rating r WHERE r.rater_person_id = $1 AND r.target_type = 'hospital' AND r.target_id = v.hospital_id) AS rated_hospital
           FROM engage.op_visit v
           JOIN org.hospital h ON h.id = v.hospital_id
           LEFT JOIN org.department dep ON dep.id = v.department_id
           LEFT JOIN (SELECT u.id, p.full_name FROM identity.app_user u JOIN identity.person p ON p.id = u.person_id) dp ON dp.id = v.doctor_user_id
          WHERE v.patient_person_id = $1 AND v.status = 'done'
          ORDER BY v.visit_date DESC`,
        [c.personId],
      )
      const reviewable: ReviewableVisitDto[] = []
      for (const v of visits) {
        if (v.doctor_user_id) {
          reviewable.push({
            opVisitId: v.id,
            targetType: 'doctor',
            targetId: v.doctor_user_id,
            title: v.doctor_name ?? 'Doctor',
            sub: `Visit ${v.visit_date}${v.dept ? ` · ${v.dept}` : ''}`,
            visitDate: v.visit_date,
            alreadyReviewed: v.rated_doctor,
          })
        }
        reviewable.push({
          opVisitId: v.id,
          targetType: 'hospital',
          targetId: v.hospital_id,
          title: v.hospital_name,
          sub: `Visit ${v.visit_date}${v.dept ? ` · ${v.dept}` : ''}`,
          visitDate: v.visit_date,
          alreadyReviewed: v.rated_hospital,
        })
      }
      return { reviews: rows.map((r) => toDto(r, c.personId)), reviewable }
    })
  }

  async create(c: CitizenCtx, req: CreateReviewRequest): Promise<ReviewDto> {
    return this.requestDb.run(c.user, async (tx) => {
      // The target must exist; remember its facility so the right admin hears about it.
      let hospitalId: string | null = null
      let pharmacyId: string | null = null
      if (req.targetType === 'hospital') {
        hospitalId = (await tx.query<{ id: string }>('SELECT id FROM org.hospital WHERE id = $1', [req.targetId]))[0]?.id ?? null
      } else if (req.targetType === 'doctor') {
        hospitalId = (await tx.query<{ hospital_id: string }>('SELECT hospital_id FROM identity.doctor_profile WHERE user_id = $1', [req.targetId]))[0]?.hospital_id ?? null
      } else {
        pharmacyId = (await tx.query<{ id: string }>('SELECT id FROM org.pharmacy WHERE id = $1', [req.targetId]))[0]?.id ?? null
      }
      if (!hospitalId && !pharmacyId) throw new NotFoundException('Review target not found')

      const ins = await tx.query<{ id: string }>(
        `INSERT INTO engage.rating (rater_person_id, target_type, target_id, stars, comment, tags, op_visit_id)
         VALUES ($1, $2::engage.rating_target, $3, $4, $5, $6, $7) RETURNING id`,
        [c.personId, req.targetType, req.targetId, req.stars, req.comment ?? null, req.tags, req.opVisitId ?? null],
      )
      await this.events.emit(tx, {
        type: 'review',
        to: [pharmacyId ? 'pharmacyadmin' : 'hospitaladmin'],
        title: `New review · ${req.stars} stars`,
        text: (req.comment ?? 'Review posted for moderation').slice(0, 120),
        hospitalId: hospitalId ?? undefined,
        pharmacyId: pharmacyId ?? undefined,
        entityType: 'engage.rating',
        entityId: ins[0]!.id,
      })
      const row = (await tx.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.id = $2`, [c.userId, ins[0]!.id]))[0]!
      return toDto(row, c.personId)
    })
  }

  async helpful(c: CitizenCtx, id: string): Promise<{ helpful: number; markedHelpful: true }> {
    return this.requestDb.run(c.user, async (tx) => {
      const r = await tx.query<{ rater_person_id: string }>(
        `SELECT rater_person_id FROM engage.rating WHERE id = $1 AND moderation_status = 'published'`,
        [id],
      )
      if (!r[0]) throw new NotFoundException('Review not found')
      if (r[0].rater_person_id === c.personId) throw new BadRequestException('You cannot mark your own review as helpful')
      await tx.query('INSERT INTO engage.rating_helpful (rating_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, c.userId])
      const n = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM engage.rating_helpful WHERE rating_id = $1', [id]))[0]!.n
      return { helpful: n, markedHelpful: true as const }
    })
  }

  async report(c: CitizenCtx, id: string, reason: string): Promise<{ reported: true }> {
    return this.requestDb.run(c.user, async (tx) => {
      const r = await tx.query('SELECT 1 FROM engage.rating WHERE id = $1 AND moderation_status = \'published\'', [id])
      if (!r.length) throw new NotFoundException('Review not found')
      await tx.query('INSERT INTO engage.rating_report (rating_id, reporter_user_id, reason) VALUES ($1, $2, $3)', [id, c.userId, reason])
      return { reported: true as const }
    })
  }
}
