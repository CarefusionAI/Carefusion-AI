import { Module } from '@nestjs/common'
import { CitizenBloodModule } from './citizen-blood'
import { CitizenMedicinesModule } from './citizen-medicines'
import { CitizenOrganModule } from './citizen-organ'

/** Citizen screens that have their own area: medicines, blood donation, organ donation. */
@Module({ imports: [CitizenMedicinesModule, CitizenBloodModule, CitizenOrganModule] })
export class CitizenExtrasModule {}
