import { Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'
import type { HprVerifyResponse } from '@carefusion/shared'

const FIRST_NAMES = ['Anil', 'Meera', 'Rajesh', 'Sneha', 'Arun', 'Divya', 'Suresh', 'Lakshmi']
const LAST_NAMES = ['Nair', 'Menon', 'Pillai', 'Kurian', 'Varghese', 'Iyer', 'Thomas', 'Warrier']
const COUNCILS = ['Travancore-Cochin Medical Council', 'National Medical Commission']
const SPECIALISATIONS = [
  'General Medicine',
  'Cardiology',
  'Paediatrics',
  'Orthopaedics',
  'Dermatology',
  'Obstetrics and Gynaecology',
]

/**
 * MOCK of the ABDM Healthcare Professionals Registry (HPR) lookup
 * (same request/response shape as the real service).
 * Only IDs of the form DEMO-HPR-71-NNNN (same rule as identity.is_canonical_hpr_id) are found. Doctor details are
 * deterministic, derived from a hash of the ID. All data is synthetic.
 */
@Injectable()
export class MockHprService {
  private readonly logger = new Logger(MockHprService.name)

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async verifyHpr(hprId: string): Promise<HprVerifyResponse> {
    this.logger.log('MOCK CONNECTOR: HPR verification')
    await this.delay(200)

    if (!hprId || !/^DEMO-HPR-71-[0-9]{4}$/.test(hprId)) {
      return { success: false, errorMessage: 'HPR ID not found in registry' }
    }

    const h = crypto.createHash('sha256').update(hprId).digest()
    const name = `Dr. ${FIRST_NAMES[h[0]! % FIRST_NAMES.length]} ${LAST_NAMES[h[1]! % LAST_NAMES.length]}`
    const council = COUNCILS[h[2]! % COUNCILS.length]!
    const regNumber = `DEMO-REG-${String(((h[3]! << 8) | h[4]!) % 100000).padStart(5, '0')}`
    const specialisation = SPECIALISATIONS[h[5]! % SPECIALISATIONS.length]!

    return { success: true, verified: true, name, council, regNumber, specialisation }
  }
}
