import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import {
  CreateReviewRequestSchema,
  ListReviewsQuerySchema,
  ReportReviewRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { ReviewsService } from './reviews.service'

/** Public reviews of hospitals, doctors and pharmacies. Reviewer names are shortened ("Sreelatha K."). */
@Controller('api/v1/citizen/reviews')
@Roles(Role.CITIZEN)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** GET /api/v1/citizen/reviews?targetType=&targetId=&minStars=&department=&location=&sort=recent|rating|helpful -> ReviewListResponse */
  @Get()
  list(@Req() req: CitizenReq, @Query() query: unknown) {
    return this.reviews.list(citizenOf(req), parseWith(ListReviewsQuerySchema, query))
  }

  /** GET /api/v1/citizen/reviews/mine -> { reviews: ReviewDto[], reviewable: ReviewableVisitDto[] } */
  @Get('mine')
  mine(@Req() req: CitizenReq) {
    return this.reviews.mine(citizenOf(req))
  }

  /** POST /api/v1/citizen/reviews -> ReviewDto (starts as pending until moderated; ABHA-verified users only) */
  @Post()
  create(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.reviews.create(citizenOf(req), parseWith(CreateReviewRequestSchema, body))
  }

  /** POST /api/v1/citizen/reviews/:id/helpful -> { helpful, markedHelpful } */
  @Post(':id/helpful')
  helpful(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.helpful(citizenOf(req), id)
  }

  /** POST /api/v1/citizen/reviews/:id/report { reason } -> { reported } */
  @Post(':id/report')
  report(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.reviews.report(citizenOf(req), id, parseWith(ReportReviewRequestSchema, body).reason)
  }
}
