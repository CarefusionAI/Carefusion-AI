import { Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'
import type { AbhaCreateRequest, AbhaCreateResponse } from '@carefusion/shared'

/**
 * MOCK of ABDM ABHA creation (same request/response shape as the real service).
 * Returns a deterministic synthetic ABHA number (DEMO-XXXX-XXXX) and address,
 * derived from the Aadhaar token. Never touches a raw Aadhaar number.
 */
@Injectable()
export class MockAbhaService {
  private readonly logger = new Logger(MockAbhaService.name)

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async createAbha(request: AbhaCreateRequest): Promise<AbhaCreateResponse> {
    this.logger.log('MOCK CONNECTOR: ABHA creation')
    await this.delay(150)

    if (!request.aadhaarToken) {
      return { success: false, errorMessage: 'Missing Aadhaar token' }
    }

    const h = crypto.createHash('sha256').update(request.aadhaarToken).digest()
    const digits = (start: number) =>
      String(((h[start]! << 8) | h[start + 1]!) % 10000).padStart(4, '0')
    const abhaNumber = `DEMO-${digits(0)}-${digits(2)}`

    const handle = request.name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join('.')
    const suffix = digits(4)
    const abhaAddress = `${handle || 'demo.user'}.${suffix}@abdm`

    return { success: true, abhaNumber, abhaAddress }
  }
}
