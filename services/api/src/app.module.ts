import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { HealthModule } from './health/health.module';

// Feature modules land in src/modules/* as each is built — see the
// Sprint-by-Sprint Backlog (MVP Build Plan Section 6) for build order.
// Do not import Discover- or Careers-pillar modules; they are out of
// MVP scope per Build Plan Section 2.2.
@Module({
  imports: [
    // Must be the first import per @sentry/nestjs setup docs. Safe to import
    // even when SENTRY_DSN is unset — Sentry.init() was never called (see
    // src/instrument.ts), so the interceptors this module wires up become
    // no-ops rather than doing anything.
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule, // Sprint 0 infra — MVP Build Plan Section 5
    // AuthModule,          // Sprint 1
    // UsersModule,         // Sprint 1
    // FeedModule,          // Sprint 2
    // ClubsModule,         // Sprint 2
    // BanterModule,        // Sprint 3
    // MessagingModule,     // Sprint 3
    // NotificationsModule, // Sprint 3
    // SportsModule,        // Sprint 4
    // AdminModule,         // Sprint 5
    // GrassrootsModule,    // Sprint 5
    // SearchModule,        // Sprint 6
    // LeaderboardModule,   // Sprint 6
  ],
})
export class AppModule {}
