import { Module } from '@nestjs/common'
import { LabModule } from './lab/lab.module'
import { NurseModule } from './nurse/nurse.module'
import { PharmacistModule } from './pharmacist/pharmacist.module'
import { RadiologyModule } from './radiology/radiology.module'

/** Phase 3c: nurse, lab technician, radiology technician and pharmacist APIs. Register this one module in AppModule. */
@Module({ imports: [NurseModule, LabModule, RadiologyModule, PharmacistModule] })
export class StaffModule {}
