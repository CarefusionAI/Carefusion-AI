import { Injectable, Logger } from '@nestjs/common'
import type { FaceCheckResponse } from '@carefusion/shared'

/**
 * MOCK of UIDAI face authentication (same request/response shape as the real service).
 * Always matches in demo mode, unless the selfie is empty or the literal string "FAIL".
 */
@Injectable()
export class MockFaceCheckService {
  private readonly logger = new Logger(MockFaceCheckService.name)

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async verifyFace(aadhaarToken: string, selfieBase64: string): Promise<FaceCheckResponse> {
    this.logger.log('MOCK CONNECTOR: Face check')
    await this.delay(300)

    if (!aadhaarToken) {
      return { success: false, errorCode: 'INVALID_TOKEN', errorMessage: 'Missing Aadhaar token' }
    }
    if (!selfieBase64 || selfieBase64 === 'FAIL') {
      return { success: true, match: false, confidence: 12.3 }
    }
    return { success: true, match: true, confidence: 95.5 }
  }
}
