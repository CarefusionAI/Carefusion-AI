import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import {
  ComplaintNoteRequestSchema,
  CreateComplaintRequestSchema,
  ReopenComplaintRequestSchema,
} from '@carefusion/shared/dist/citizen-app.js'
import { Role } from '@carefusion/shared'
import { Roles } from '../../auth/roles.decorator'
import { parseWith } from '../../events/validation'
import { CitizenReq, citizenOf } from '../common/citizen-request'
import { ComplaintsService } from './complaints.service'

/** Complaints: file, follow the 3-stage timeline, add a note, reopen. */
@Controller('api/v1/citizen/complaints')
@Roles(Role.CITIZEN)
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  /** GET /api/v1/citizen/complaints -> ComplaintDto[] (with timeline) */
  @Get()
  list(@Req() req: CitizenReq) {
    return this.complaints.list(citizenOf(req))
  }

  /** GET /api/v1/citizen/complaints/options -> ComplaintOptionsResponse (form choices, helpline) */
  @Get('options')
  options(@Req() req: CitizenReq) {
    return this.complaints.options(citizenOf(req))
  }

  /** POST /api/v1/citizen/complaints -> ComplaintDto (ref like CMP-0417) */
  @Post()
  create(@Req() req: CitizenReq, @Body() body: unknown) {
    return this.complaints.create(citizenOf(req), parseWith(CreateComplaintRequestSchema, body))
  }

  /** GET /api/v1/citizen/complaints/:id -> ComplaintDto */
  @Get(':id')
  get(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.complaints.get(citizenOf(req), id)
  }

  /** POST /api/v1/citizen/complaints/:id/notes { text } -> ComplaintDto */
  @Post(':id/notes')
  note(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.complaints.addNote(citizenOf(req), id, parseWith(ComplaintNoteRequestSchema, body).text)
  }

  /** POST /api/v1/citizen/complaints/:id/reopen { text } -> ComplaintDto */
  @Post(':id/reopen')
  reopen(@Req() req: CitizenReq, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.complaints.reopen(citizenOf(req), id, parseWith(ReopenComplaintRequestSchema, body).text)
  }
}
