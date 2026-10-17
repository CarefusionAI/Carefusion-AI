import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { AuditModule } from '../audit/audit.module'
import { ApprovalController } from './approval.controller'
import { ApprovalService } from './approval.service'

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
})
export class ApprovalModule {}
