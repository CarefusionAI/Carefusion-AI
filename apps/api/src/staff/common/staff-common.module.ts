import { Module } from '@nestjs/common'
import { StaffContextService } from './staff-context.service'
import { HandoverService } from './handover.service'

/** Shared helpers for the four staff modules: staff profile lookup, transactions, cross-role events, shift handover. */
@Module({
  providers: [StaffContextService, HandoverService],
  exports: [StaffContextService, HandoverService],
})
export class StaffCommonModule {}
