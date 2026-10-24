import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { StaffCommonModule } from '../common/staff-common.module'
import { RadiologyController } from './radiology.controller'
import { RadiologyService } from './radiology.service'

@Module({
  imports: [DatabaseModule, StaffCommonModule],
  controllers: [RadiologyController],
  providers: [RadiologyService],
  exports: [RadiologyService],
})
export class RadiologyModule {}
