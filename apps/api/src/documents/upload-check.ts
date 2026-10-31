import { BadRequestException } from '@nestjs/common'

/**
 * File types a citizen may upload, with the first bytes each one must start with (text types have none).
 * The browser's claimed type is not trusted on its own: the content has to match it.
 */
export const UPLOAD_TYPES: Record<string, { magic?: number[][]; label: string }> = {
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

export function checkUploadType(file: Express.Multer.File): string {
  const claimed = (file.mimetype || '').toLowerCase().split(';')[0]!.trim()
  const rule = UPLOAD_TYPES[claimed]
  if (!rule) throw new BadRequestException('This file type is not allowed. Upload a PDF, image, Word, text, CSV or DICOM file.')
  if (file.size === 0) throw new BadRequestException('The file is empty.')
  if (rule.magic && !rule.magic.some((m) => m.every((b, i) => file.buffer[i] === b))) {
    throw new BadRequestException(`The file does not look like a real ${rule.label} file.`)
  }
  return claimed
}
