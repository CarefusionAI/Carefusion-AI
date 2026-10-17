import { Module } from '@nestjs/common'
import { MockAadhaarEkycService } from './aadhaar-ekyc.mock'
import { MockFaceCheckService } from './face-check.mock'
import { MockAbhaService } from './abha.mock'
import { MockHprService } from './hpr.mock'
import { MockHfrService } from './hfr.mock'

@Module({
  providers: [MockAadhaarEkycService, MockFaceCheckService, MockAbhaService, MockHprService, MockHfrService],
  exports: [MockAadhaarEkycService, MockFaceCheckService, MockAbhaService, MockHprService, MockHfrService],
})
export class ConnectorsModule {}
