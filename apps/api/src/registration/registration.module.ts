import { Module } from '@nestjs/common'
import { ConnectorsModule } from '../connectors/connectors.module'
import { DatabaseModule } from '../database/database.module'
import { AuditModule } from '../audit/audit.module'
import { RegistrationController } from './registration.controller'
import { RegistrationService } from './registration.service'

@Module({
  imports: [ConnectorsModule, DatabaseModule, AuditModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
