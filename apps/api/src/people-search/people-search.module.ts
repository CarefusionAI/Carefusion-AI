import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { DatabaseModule } from '../database/database.module'
import { PeopleSearchController } from './people-search.controller'
import { PeopleSearchService } from './people-search.service'

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [PeopleSearchController],
  providers: [PeopleSearchService],
})
export class PeopleSearchModule {}
