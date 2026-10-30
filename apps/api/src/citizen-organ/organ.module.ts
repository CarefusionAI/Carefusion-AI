import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { OrganController } from './organ.controller'
import { OrganService } from './organ.service'

@Module({
  imports: [EventsModule],
  controllers: [OrganController],
  providers: [OrganService],
})
export class CitizenOrganModule {}
