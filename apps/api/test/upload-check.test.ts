import { describe, expect, it } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { checkUploadType } from '../src/documents/upload-check'

const file = (mimetype: string, bytes: number[] | string, size?: number) => {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes)
  return { mimetype, buffer, size: size ?? buffer.length } as unknown as Express.Multer.File
}

describe('upload type check', () => {
  it('accepts a real PDF, PNG and JPEG', () => {
    expect(checkUploadType(file('application/pdf', '%PDF-1.4 x'))).toBe('application/pdf')
    expect(checkUploadType(file('image/png', [0x89, 0x50, 0x4e, 0x47, 1]))).toBe('image/png')
    expect(checkUploadType(file('image/jpeg', [0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
  })
  it('accepts plain text without a signature', () => {
    expect(checkUploadType(file('text/plain', 'hello'))).toBe('text/plain')
  })
  it('ignores a charset suffix and case', () => {
    expect(checkUploadType(file('Text/Plain; charset=utf-8', 'hello'))).toBe('text/plain')
  })
  it('rejects a file whose content does not match its claimed type', () => {
    expect(() => checkUploadType(file('application/pdf', 'MZ not a pdf'))).toThrow(BadRequestException)
    expect(() => checkUploadType(file('image/png', [0xff, 0xd8, 0xff]))).toThrow(/real PNG/)
  })
  it('rejects types that are not on the list', () => {
    for (const t of ['text/html', 'application/x-sh', 'application/javascript', 'image/svg+xml', 'application/octet-stream', '']) {
      expect(() => checkUploadType(file(t, 'x'))).toThrow(/not allowed/)
    }
  })
  it('rejects an empty file', () => {
    expect(() => checkUploadType(file('text/plain', '', 0))).toThrow(/empty/)
  })
})
