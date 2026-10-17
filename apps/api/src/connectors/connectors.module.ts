import { Module } from '@nestjs/common'
import { MockAadhaarEkycService } from './aadhaar-ekyc.mock'
import { MockFaceCheckService } from './face-check.mock'
import { MockAbhaService } from './abha.mock'

@Module({
  providers: [MockAadhaarEkycService, MockFaceCheckService, MockAbhaService],
  exports: [MockAadhaarEkycService, MockFaceCheckService, MockAbhaService],
})
export class ConnectorsModule {}
