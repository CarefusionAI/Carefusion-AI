import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  CreateFolderRequestSchema,
  MoveDocumentRequestSchema,
  RenameFolderRequestSchema,
  Role,
  UploadDocumentRequestSchema,
} from '@carefusion/shared'
import { Roles } from '../auth/roles.decorator'
import type { AuthenticatedUser } from '../auth/types'
import { parseBody, requireCitizen } from '../citizen/citizen-context'
import { DocumentsService } from './documents.service'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // 20 MB per file in the alpha

type CitizenRequest = { user?: AuthenticatedUser }

/** Citizen health-record folders and documents. Documents are immutable; folders can only be renamed. */
@Controller('api/v1/citizen')
@Roles(Role.CITIZEN)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('folders')
  listFolders(@Req() req: CitizenRequest) {
    const { personId, userId } = requireCitizen(req)
    return this.documents.listFolders(personId, userId)
  }

  @Post('folders')
  createFolder(@Req() req: CitizenRequest, @Body() body: unknown) {
    const { personId, userId } = requireCitizen(req)
    return this.documents.createFolder(personId, userId, parseBody(CreateFolderRequestSchema, body))
  }

  @Patch('folders/:id')
  renameFolder(@Req() req: CitizenRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { personId } = requireCitizen(req)
    return this.documents.renameFolder(personId, id, parseBody(RenameFolderRequestSchema, body))
  }

  @Get('folders/:id/documents')
  listDocuments(@Req() req: CitizenRequest, @Param('id', ParseUUIDPipe) id: string) {
    const { personId } = requireCitizen(req)
    return this.documents.listDocuments(personId, id)
  }

  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@Req() req: CitizenRequest, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown) {
    const { personId, userId } = requireCitizen(req)
    if (!file) throw new BadRequestException('A file is required (form field "file")')
    return this.documents.upload(personId, userId, file, parseBody(UploadDocumentRequestSchema, body))
  }

  @Get('documents/recent')
  recentDocuments(@Req() req: CitizenRequest, @Query('limit') limit?: string) {
    const { personId } = requireCitizen(req)
    return this.documents.listRecentDocuments(personId, Number(limit ?? 3))
  }

  @Get('documents/:id/download')
  download(@Req() req: CitizenRequest, @Param('id', ParseUUIDPipe) id: string) {
    const { personId } = requireCitizen(req)
    return this.documents.getDownloadUrl(personId, id)
  }

  @Post('documents/:id/move')
  move(@Req() req: CitizenRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { personId, userId } = requireCitizen(req)
    return this.documents.moveDocument(personId, userId, id, parseBody(MoveDocumentRequestSchema, body))
  }
}
