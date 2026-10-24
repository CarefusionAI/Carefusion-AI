import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { AuditModule } from '../audit/audit.module'
import { ApprovalService } from '../approval/approval.service'
import { GovAdminController } from './gov-admin.controller'
import { GovScopeService } from './gov-scope.service'
import { GovUnitsService } from './gov-units.service'
import { OverviewService } from './overview.service'
import { SurveillanceService } from './surveillance.service'
import { GovApprovalsService } from './approvals.service'
import { AlertsService } from './alerts.service'
import { BloodService } from './blood.service'
import { OversightService } from './oversight.service'
import { DirectoryService } from './directory.service'
import { PlatformService } from './platform.service'

/**
 * Government console API (district, state, zonal, central) under /api/v1/gov.
 * ApprovalService is provided here again (it only needs DatabaseService and AuditService) so that
 * decisions reuse the existing approval logic without changing ApprovalModule.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [GovAdminController],
  providers: [
    ApprovalService,
    GovScopeService,
    GovUnitsService,
    OverviewService,
    SurveillanceService,
    GovApprovalsService,
    AlertsService,
    BloodService,
    OversightService,
    DirectoryService,
    PlatformService,
  ],
})
export class GovAdminModule {}
