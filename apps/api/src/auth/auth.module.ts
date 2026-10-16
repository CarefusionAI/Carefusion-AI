import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { AuthController } from './auth.controller'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
