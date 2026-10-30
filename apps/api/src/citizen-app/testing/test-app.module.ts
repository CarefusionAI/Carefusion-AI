import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from '../../auth/auth.module'
import { CfAuthGuard } from '../../auth/auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { DatabaseModule } from '../../database/database.module'
import { EventsModule } from '../../events/events.module'
import { CitizenAppModule } from '../citizen-app.module'

/**
 * Minimal app for e2e checks of EventsModule + CitizenAppModule (same global guards as AppModule).
 * Run: DATABASE_URL=... DEMO_MODE=true node dist/citizen-app/testing/test-main.js
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthModule, EventsModule, CitizenAppModule],
  providers: [
    { provide: APP_GUARD, useClass: CfAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class TestAppModule {}
