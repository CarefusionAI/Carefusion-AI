import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
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
import { EventsModule } from './events'
import { CitizenAppModule } from './citizen-app'
import { DoctorModule } from './doctor/doctor.module'
import { StaffModule } from './staff/staff.module'
import { HospitalAdminModule } from './hospital-admin/hospital-admin.module'
import { PharmacyAdminModule } from './pharmacy-admin/pharmacy-admin.module'
import { GovAdminModule } from './gov-admin/gov-admin.module'
import { AccessModule } from './access/access.module'
import { AccessGateMiddleware } from './access/access.middleware'
import { CitizenExtrasModule } from './citizen-extras.module'

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
    EventsModule,
    CitizenAppModule,
    DoctorModule,
    StaffModule,
    HospitalAdminModule,
    PharmacyAdminModule,
    GovAdminModule,
    CitizenExtrasModule,
    AccessModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: CfAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AccessGateMiddleware).forRoutes('*')
  }
}
