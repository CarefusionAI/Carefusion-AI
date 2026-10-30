import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { MedicinesController } from './medicines.controller'
import { MedicinesService } from './medicines.service'

@Module({
  imports: [EventsModule],
  controllers: [MedicinesController],
  providers: [MedicinesService],
})
export class CitizenMedicinesModule {}
