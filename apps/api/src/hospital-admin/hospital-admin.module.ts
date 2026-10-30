import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { AuditModule } from '../audit/audit.module'
import { ApprovalService } from '../approval/approval.service'
import { AdminOpsService } from '../admin-ops/admin-ops.service'
import { HospitalAdminController } from './hospital-admin.controller'
import { HospitalAdminService } from './hospital-admin.service'
import { HospitalOpsService } from './hospital-ops.service'
import { HospitalOversightService } from './hospital-oversight.service'

/**
 * Hospital admin console (role HOSPITAL_ADMIN). ApprovalService and AdminOpsService are provided here
 * again (they only need the database and audit services) so the existing modules stay untouched.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [HospitalAdminController],
  providers: [HospitalAdminService, HospitalOpsService, HospitalOversightService, ApprovalService, AdminOpsService],
})
export class HospitalAdminModule {}
