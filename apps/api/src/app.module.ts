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
import { AdminOpsModule } from './admin-ops/admin-ops.module'
import { CitizenModule } from './citizen/citizen.module'
import { StorageModule } from './storage/storage.module'
import { DocumentsModule } from './documents/documents.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    RegistrationModule,
    ApprovalModule,
    AdminOpsModule,
    StorageModule,
    CitizenModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: CfAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
