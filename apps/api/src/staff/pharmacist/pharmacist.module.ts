import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { StaffCommonModule } from '../common/staff-common.module'
import { PharmacistController } from './pharmacist.controller'
import { PharmacistService } from './pharmacist.service'

@Module({
  imports: [DatabaseModule, StaffCommonModule],
  controllers: [PharmacistController],
  providers: [PharmacistService],
  exports: [PharmacistService],
})
export class PharmacistModule {}
