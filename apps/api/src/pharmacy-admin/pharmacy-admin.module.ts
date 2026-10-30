import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { AuditModule } from '../audit/audit.module'
import { AdminOpsService } from '../admin-ops/admin-ops.service'
import { PharmacyAdminController } from './pharmacy-admin.controller'
import { PharmacyAdminService } from './pharmacy-admin.service'
import { PharmacyStockService } from './pharmacy-stock.service'

/** Pharmacy admin console (role PHARMACY_ADMIN). AdminOpsService is provided here again so the existing module stays untouched. */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [PharmacyAdminController],
  providers: [PharmacyAdminService, PharmacyStockService, AdminOpsService],
})
export class PharmacyAdminModule {}
