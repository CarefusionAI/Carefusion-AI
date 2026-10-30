import { Module } from '@nestjs/common'
import { AccessKeyService } from './access-key.service'
import { AccessService } from './access.service'
import { AiService } from './ai.service'
import { CareService } from './care.service'
import { DoctorDbService } from './doctor-db.service'
import {
  DoctorAiController,
  DoctorClinicalController,
  DoctorEmergencyController,
  DoctorHomeController,
  DoctorNetworkController,
  DoctorSessionController,
} from './doctor.controllers'
import { EmergencyService } from './emergency.service'
import { MockESignService } from './esign.mock'
import { HomeService } from './home.service'
import { MessagesService } from './messages.service'
import { NetworkService } from './network.service'
import { OrdersService } from './orders.service'
import { PatientService } from './patient.service'
import { PrescriptionsService } from './prescriptions.service'
import { ProfileService } from './profile.service'

/** Doctor app API (role DOCTOR): queue, patient session by rotating key / break-glass, AI (simulated), prescriptions, orders, referrals, handover, donors, profile. */
@Module({
  controllers: [
    DoctorHomeController,
    DoctorSessionController,
    DoctorAiController,
    DoctorClinicalController,
    DoctorEmergencyController,
    DoctorNetworkController,
  ],
  providers: [
    DoctorDbService,
    AccessKeyService,
    AccessService,
    PatientService,
    AiService,
    PrescriptionsService,
    OrdersService,
    CareService,
    EmergencyService,
    MessagesService,
    HomeService,
    NetworkService,
    ProfileService,
    MockESignService,
  ],
  exports: [AccessKeyService, DoctorDbService],
})
export class DoctorModule {}
