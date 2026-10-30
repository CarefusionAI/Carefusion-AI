import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { StaffCommonModule } from '../common/staff-common.module'
import { NurseController } from './nurse.controller'
import { NurseService } from './nurse.service'

@Module({
  imports: [DatabaseModule, StaffCommonModule],
  controllers: [NurseController],
  providers: [NurseService],
  exports: [NurseService],
})
export class NurseModule {}
