import { Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'
import type { DrugLicenceVerifyResponse, HfrVerifyResponse } from '@carefusion/shared'

const FACILITY_KINDS = ['District Hospital', 'Taluk Hospital', 'Community Health Centre', 'Medical College Hospital']
const PLACES = ['Demo Nagar', 'Demo Puram', 'Demo Kara', 'Demo Vila']

/**
 * MOCK of the ABDM Health Facility Registry (HFR) lookup and of a drug-licence
 * check (same request/response shape as the real services).
 * Only IDs starting with "DEMO-HFR-" / "DEMO-DL-" are accepted. All data is synthetic.
 */
@Injectable()
export class MockHfrService {
  private readonly logger = new Logger(MockHfrService.name)

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async verifyHfr(hfrId: string): Promise<HfrVerifyResponse> {
    this.logger.log('MOCK CONNECTOR: HFR verification')
    await this.delay(200)

    if (!hfrId || !hfrId.startsWith('DEMO-HFR-')) {
      return { success: false, errorMessage: 'HFR ID not found in registry' }
    }

    const h = crypto.createHash('sha256').update(hfrId).digest()
    const facilityName = `${PLACES[h[0]! % PLACES.length]} ${FACILITY_KINDS[h[1]! % FACILITY_KINDS.length]}`
    return { success: true, verified: true, facilityName }
  }

  async verifyDrugLicence(licenceNo: string): Promise<DrugLicenceVerifyResponse> {
    this.logger.log('MOCK CONNECTOR: Drug licence verification')
    await this.delay(150)

    if (!licenceNo || !licenceNo.startsWith('DEMO-DL-')) {
      return { success: false, errorMessage: 'Drug licence not found in registry' }
    }
    return { success: true, verified: true }
  }
}
