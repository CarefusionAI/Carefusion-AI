import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import type {
  CreateFolderRequest,
  DocumentDownloadResponse,
  DocumentResponse,
  FolderResponse,
  MoveDocumentRequest,
  RenameFolderRequest,
  UploadDocumentRequest,
  UploadDocumentResponse,
} from '@carefusion/shared'
import { CitizenService } from '../citizen/citizen.service'
import { DatabaseService } from '../database/database.service'
import { StorageService } from '../storage/storage.service'

// A document's current folder is the target of its latest move, or the folder it was created in.
const DOC_CURRENT_FOLDER_CTE = `
  doc_current AS (
    SELECT d.id,
           COALESCE(
             (SELECT m.to_folder_id FROM records.document_move m
               WHERE m.document_id = d.id ORDER BY m.moved_at DESC, m.id DESC LIMIT 1),
             d.folder_id) AS current_folder_id
      FROM records.document d
     WHERE d.patient_person_id = $1
  )`

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly citizens: CitizenService,
  ) {}

  async listFolders(personId: string, userId: string): Promise<FolderResponse[]> {
    await this.citizens.ensureSystemFolders(personId, userId)
    const rows = await this.db.query(
      `WITH ${DOC_CURRENT_FOLDER_CTE}
       SELECT f.id, f.name, f.kind::text AS kind, f.parent_folder_id, f.created_at,
              (SELECT count(*)::int FROM doc_current dc WHERE dc.current_folder_id = f.id) AS document_count
         FROM records.folder f
        WHERE f.patient_person_id = $1
        ORDER BY (f.kind = 'user'), f.created_at, f.name`,
      [personId],
    )
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      parentFolderId: f.parent_folder_id,
      documentCount: f.document_count,
      createdAt: new Date(f.created_at).toISOString(),
    }))
  }

  async createFolder(personId: string, userId: string, body: CreateFolderRequest): Promise<FolderResponse> {
    if (body.parentFolderId) await this.requireOwnFolder(personId, body.parentFolderId)
    await this.assertNameFree(personId, body.parentFolderId ?? null, body.name)

    const rows = await this.db.query(
      `INSERT INTO records.folder (patient_person_id, parent_folder_id, name, kind, created_by_user_id)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id, name, kind::text AS kind, parent_folder_id, created_at`,
      [personId, body.parentFolderId ?? null, body.name, userId],
    )
    const f = rows[0]
    return {
      id: f.id,
      name: f.name,
      kind: f.kind,
      parentFolderId: f.parent_folder_id,
      documentCount: 0,
      createdAt: new Date(f.created_at).toISOString(),
    }
  }

  async renameFolder(personId: string, folderId: string, body: RenameFolderRequest) {
    const folder = await this.requireOwnFolder(personId, folderId)
    if (folder.kind !== 'user') throw new BadRequestException('System folders cannot be renamed')
    await this.assertNameFree(personId, folder.parent_folder_id, body.name, folderId)

    await this.db.query(`UPDATE records.folder SET name = $1 WHERE id = $2`, [body.name, folderId])
    return { id: folderId, name: body.name }
  }

  async listDocuments(personId: string, folderId: string): Promise<DocumentResponse[]> {
    await this.requireOwnFolder(personId, folderId)
    const rows = await this.db.query(
      `WITH ${DOC_CURRENT_FOLDER_CTE}
       SELECT d.id, d.title, d.doc_type::text AS doc_type, d.mime_type, d.size_bytes,
              d.is_self_reported, d.created_at
         FROM records.document d
         JOIN doc_current dc ON dc.id = d.id
        WHERE dc.current_folder_id = $2
        ORDER BY d.created_at DESC, d.id DESC`,
      [personId, folderId],
    )
    return rows.map((d) => ({
      id: d.id,
      title: d.title,
      docType: d.doc_type,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes == null ? null : Number(d.size_bytes),
      isSelfReported: d.is_self_reported,
      createdAt: new Date(d.created_at).toISOString(),
    }))
  }

  async upload(
    personId: string,
    userId: string,
    file: Express.Multer.File,
    body: UploadDocumentRequest,
  ): Promise<UploadDocumentResponse> {
    await this.requireOwnFolder(personId, body.folderId)
    const mimeType = checkUploadType(file)

    const sha256 = createHash('sha256').update(file.buffer).digest()
    const storageKey = `citizen/${personId}/${body.folderId}/${randomUUID()}/${safeFileName(file.originalname)}`

    await this.storage.upload(storageKey, file.buffer, mimeType)

    try {
      const rows = await this.db.query(
        `INSERT INTO records.document
           (patient_person_id, folder_id, title, doc_type, storage_key, mime_type, size_bytes,
            sha256, enc_key_id, is_self_reported, created_by_user_id)
         VALUES ($1, $2, $3, $4::records.doc_type, $5, $6, $7, $8, 'demo-none', true, $9)
         RETURNING id, created_at`,
        [personId, body.folderId, body.title, body.docType, storageKey, mimeType, file.size, sha256, userId],
      )
      const d = rows[0]
      return {
        id: d.id,
        title: body.title,
        folderId: body.folderId,
        docType: body.docType,
        mimeType,
        sizeBytes: file.size,
        sha256: sha256.toString('hex'),
        createdAt: new Date(d.created_at).toISOString(),
      }
    } catch (err) {
      // Don't leave an orphan file behind if the database insert failed.
      await this.storage.delete(storageKey).catch((e) => this.logger.warn(`Cleanup of ${storageKey} failed: ${e}`))
      throw err
    }
  }

  async getDownloadUrl(personId: string, documentId: string): Promise<DocumentDownloadResponse> {
    const rows = await this.db.query(
      `SELECT patient_person_id, title, mime_type, storage_key FROM records.document WHERE id = $1`,
      [documentId],
    )
    const doc = rows[0]
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.patient_person_id !== personId) throw new ForbiddenException('Not your document')
    if (!doc.storage_key) throw new BadRequestException('This document has no downloadable file')

    return {
      url: await this.storage.getPresignedUrl(doc.storage_key),
      title: doc.title,
      mimeType: doc.mime_type,
    }
  }

  async moveDocument(personId: string, userId: string, documentId: string, body: MoveDocumentRequest) {
    const docs = await this.db.query(`SELECT patient_person_id FROM records.document WHERE id = $1`, [documentId])
    const doc = docs[0]
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.patient_person_id !== personId) throw new ForbiddenException('Not your document')
    await this.requireOwnFolder(personId, body.toFolderId)

    const rows = await this.db.query(
      `INSERT INTO records.document_move (document_id, to_folder_id, moved_by_user_id)
       VALUES ($1, $2, $3) RETURNING id, moved_at`,
      [documentId, body.toFolderId, userId],
    )
    return {
      id: rows[0].id,
      documentId,
      toFolderId: body.toFolderId,
      movedAt: new Date(rows[0].moved_at).toISOString(),
    }
  }

  private async requireOwnFolder(personId: string, folderId: string) {
    const rows = await this.db.query(
      `SELECT id, patient_person_id, parent_folder_id, kind::text AS kind FROM records.folder WHERE id = $1`,
      [folderId],
    )
    const folder = rows[0]
    if (!folder) throw new NotFoundException('Folder not found')
    if (folder.patient_person_id !== personId) throw new ForbiddenException('Not your folder')
    return folder as { id: string; patient_person_id: string; parent_folder_id: string | null; kind: string }
  }

  // The database unique key ignores rows with no parent folder, so check names here too.
  private async assertNameFree(personId: string, parentId: string | null, name: string, exceptId?: string) {
    const rows = await this.db.query(
      `SELECT 1 FROM records.folder
        WHERE patient_person_id = $1 AND parent_folder_id IS NOT DISTINCT FROM $2::uuid
          AND lower(name) = lower($3) AND ($4::uuid IS NULL OR id <> $4::uuid)
        LIMIT 1`,
      [personId, parentId, name, exceptId ?? null],
    )
    if (rows.length > 0) throw new ConflictException('A folder with this name already exists here')
  }
}

/** Keep object keys simple: no slashes or odd characters from the uploaded file name. */
/**
 * File types a citizen may upload, with the first bytes each one must start with (text types have none).
 * The browser's claimed type is not trusted on its own: the content has to match it.
 */
const UPLOAD_TYPES: Record<string, { magic?: number[][]; label: string }> = {
  'application/pdf': { magic: [[0x25, 0x50, 0x44, 0x46]], label: 'PDF' },
  'image/jpeg': { magic: [[0xff, 0xd8, 0xff]], label: 'JPEG' },
  'image/png': { magic: [[0x89, 0x50, 0x4e, 0x47]], label: 'PNG' },
  'image/gif': { magic: [[0x47, 0x49, 0x46, 0x38]], label: 'GIF' },
  'image/webp': { magic: [[0x52, 0x49, 0x46, 0x46]], label: 'WebP' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { magic: [[0x50, 0x4b, 0x03, 0x04]], label: 'Word' },
  'application/dicom': { label: 'DICOM' },
  'text/plain': { label: 'text' },
  'text/csv': { label: 'CSV' },
}

function checkUploadType(file: Express.Multer.File): string {
  const claimed = (file.mimetype || '').toLowerCase().split(';')[0]!.trim()
  const rule = UPLOAD_TYPES[claimed]
  if (!rule) throw new BadRequestException('This file type is not allowed. Upload a PDF, image, Word, text, CSV or DICOM file.')
  if (file.size === 0) throw new BadRequestException('The file is empty.')
  if (rule.magic && !rule.magic.some((m) => m.every((b, i) => file.buffer[i] === b))) {
    throw new BadRequestException(`The file does not look like a real ${rule.label} file.`)
  }
  return claimed
}

function safeFileName(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120)
  return cleaned || 'file'
}
