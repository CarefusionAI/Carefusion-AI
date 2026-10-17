import { Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'
import type { AadhaarOtpInitResponse, AadhaarEkycResponse } from '@carefusion/shared'

const FIRST_NAMES = ['Arjun', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Deepa', 'Suresh', 'Lakshmi', 'Arun', 'Meera']
const LAST_NAMES = ['Kumar', 'Sharma', 'Nair', 'Menon', 'Pillai', 'Das', 'Patel', 'Reddy', 'Iyer', 'Varma']
const CITIES = ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad']
const SEXES = ['female', 'male', 'other'] as const

/** Demo OTP that always passes in the mock connector. */
const DEMO_OTP = '123456'

/**
 * MOCK of the Aadhaar OTP-based e-KYC service (same request/response shape as the real one).
 * The raw Aadhaar number is used only to derive a token and is NEVER stored or returned.
 * All data returned is synthetic.
 */
@Injectable()
export class MockAadhaarEkycService {
  private readonly logger = new Logger(MockAadhaarEkycService.name)

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private hash(aadhaarNumber: string): Buffer {
    return crypto.createHash('sha256').update(aadhaarNumber).digest()
  }

  async initOtp(aadhaarNumber: string): Promise<AadhaarOtpInitResponse> {
    this.logger.log('MOCK CONNECTOR: Aadhaar e-KYC (initOtp)')
    await this.delay(200)
    if (!/^\d{12}$/.test(aadhaarNumber)) {
      return { success: false, errorMessage: 'Aadhaar number must be 12 digits' }
    }
    return { success: true, txnId: `DEMO-TXN-${crypto.randomUUID()}` }
  }

  async verifyEkyc(aadhaarNumber: string, otp: string, txnId: string): Promise<AadhaarEkycResponse> {
    this.logger.log('MOCK CONNECTOR: Aadhaar e-KYC (verifyEkyc)')
    await this.delay(200)

    if (!/^\d{12}$/.test(aadhaarNumber)) {
      return { success: false, errorCode: 'INVALID_AADHAAR', errorMessage: 'Aadhaar number must be 12 digits' }
    }
    if (!txnId) {
      return { success: false, errorCode: 'INVALID_TXN', errorMessage: 'Missing transaction id' }
    }
    if (otp !== DEMO_OTP) {
      return { success: false, errorCode: 'OTP_MISMATCH', errorMessage: 'Invalid OTP' }
    }

    const h = this.hash(aadhaarNumber)
    const hex = h.toString('hex')
    const token = `DEMO-AADHAAR-${hex.slice(0, 16).toUpperCase()}`

    const first = FIRST_NAMES[h[0]! % FIRST_NAMES.length]!
    const last = LAST_NAMES[h[1]! % LAST_NAMES.length]!
    const sex = SEXES[h[2]! % SEXES.length]!

    // Deterministic DOB between 1960-01-01 and 2008-12-28
    const year = 1960 + (((h[3]! << 8) | h[4]!) % 49)
    const month = 1 + (h[5]! % 12)
    const day = 1 + (h[6]! % 28)
    const dob = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const city = CITIES[h[7]! % CITIES.length]!
    const house = 1 + (((h[8]! << 8) | h[9]!) % 999)
    const address = `${house}, Demo Nagar, ${city}, Kerala (SYNTHETIC)`

    return {
      success: true,
      token,
      name: `${first} ${last}`,
      dob,
      sex,
      address,
      // 1x1 transparent PNG placeholder (no real photo in the demo)
      photoBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    }
  }
}
