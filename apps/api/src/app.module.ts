import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AppController } from './app.controller'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { CfAuthGuard } from './auth/auth.guard'
import { RolesGuard } from './auth/roles.guard'
import { RegistrationModule } from './registration/registration.module'
import { ApprovalModule } from './approval/approval.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    RegistrationModule,
    ApprovalModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: CfAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
