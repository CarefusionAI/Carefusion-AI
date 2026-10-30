import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { AccessModule } from './access/access.module'
import { AiChatModule } from './ai-chat/ai-chat.module'
import { AlertsModule } from './alerts/alerts.module'
import { CareModule } from './care/care.module'
import { ComplaintsModule } from './complaints/complaints.module'
import { DatesModule } from './dates/dates.module'
import { MessagesModule } from './messages/messages.module'
import { ReviewsModule } from './reviews/reviews.module'
import { SettingsModule } from './settings/settings.module'
import { VitalsModule } from './vitals/vitals.module'

/** Citizen app screens beyond profile/documents: dates, vitals, AI chat, messages, care, alerts, settings, reviews, complaints, access. */
@Module({
  imports: [
    EventsModule,
    DatesModule,
    VitalsModule,
    AiChatModule,
    MessagesModule,
    CareModule,
    AlertsModule,
    SettingsModule,
    ReviewsModule,
    ComplaintsModule,
    AccessModule,
  ],
})
export class CitizenAppModule {}
