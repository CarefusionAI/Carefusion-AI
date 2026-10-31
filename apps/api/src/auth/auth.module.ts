import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { AuthController } from './auth.controller'
import { AuditModule } from '../audit/audit.module'
import { DatabaseModule } from '../database/database.module'
import { AccessModule } from '../access/access.module'
import { DemoCredentialsService } from './demo-credentials.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuditModule,
    DatabaseModule,
    AccessModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, DemoCredentialsService],
  exports: [PassportModule, DemoCredentialsService],
})
export class AuthModule {}
