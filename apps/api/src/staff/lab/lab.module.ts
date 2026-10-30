import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { StaffCommonModule } from '../common/staff-common.module'
import { LabController } from './lab.controller'
import { LabService } from './lab.service'

@Module({
  imports: [DatabaseModule, StaffCommonModule],
  controllers: [LabController],
  providers: [LabService],
  exports: [LabService],
})
export class LabModule {}
