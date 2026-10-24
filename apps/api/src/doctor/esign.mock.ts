import { Injectable, Logger } from '@nestjs/common'
import crypto from 'crypto'

export interface ESignRequest {
  signerHprId: string
  signerName: string
  /** SHA-256 hex of the document being signed. */
  documentHash: string
  reason: string
}

export interface ESignResponse {
  success: boolean
  txnId: string
  method: 'mock'
  signatureRef: string
  signedAt: string
  certificateSubject: string
  errorMessage?: string
}

/**
 * MOCK of an Aadhaar e-Sign / DSC signing service (CLAUDE.md rule 4): same request/response shape as the real
 * service, no real signature. The reference only proves the demo flow; it is NOT a legal signature.
 */
@Injectable()
export class MockESignService {
  private readonly logger = new Logger(MockESignService.name)

  async sign(req: ESignRequest): Promise<ESignResponse> {
    this.logger.log('MOCK CONNECTOR: e-Sign')
    await new Promise((r) => setTimeout(r, 150))
    if (!req.signerHprId.startsWith('DEMO-HPR-')) {
      return { success: false, txnId: '', method: 'mock', signatureRef: '', signedAt: new Date().toISOString(), certificateSubject: '', errorMessage: 'Signer is not a registered demo doctor' }
    }
    const digest = crypto.createHash('sha256').update(`${req.signerHprId}|${req.documentHash}`).digest('hex')
    return {
      success: true,
      txnId: `DEMO-ESIGN-TXN-${digest.slice(0, 10).toUpperCase()}`,
      method: 'mock',
      signatureRef: `DEMO-ESIGN-${digest.slice(10, 34).toUpperCase()}`,
      signedAt: new Date().toISOString(),
      certificateSubject: `CN=${req.signerName}, O=Demo e-Sign (simulated), C=IN`,
    }
  }
}
