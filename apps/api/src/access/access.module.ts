import { Module } from '@nestjs/common'
import { AccessController } from './access.controller'
import { AccessService } from './access.service'
import { AccessGateMiddleware } from './access.middleware'

@Module({
  controllers: [AccessController],
  providers: [AccessService, AccessGateMiddleware],
  exports: [AccessService],
})
export class AccessModule {}
