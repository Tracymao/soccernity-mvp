import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { SentryModule } from '@sentry/nestjs/setup';
import { HealthModule } from './health/health.module';
import { PasswordResetModule } from './modules/auth/password-reset/password-reset.module';

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
    // envFilePath is explicit and built from __dirname (this compiled
    // file's real on-disk location — services/api/dist/ under both
    // `nest start` and `nest build`, per nest-cli.json's default
    // sourceRoot/outDir), not left to default. This is a confirmed bug
    // fix, not a hypothetical one: the default envFilePath resolves
    // relative to process.cwd(), and there is no services/api/.env —
    // only the repo-root one, per CLAUDE.md's "one root .env for now"
    // decision (see PR #8's flagged gap, and CLAUDE.md's Environment
    // variables section). __dirname sidesteps process.cwd() entirely,
    // so this resolves correctly no matter how the process is launched
    // — via `npm run dev:api` from the repo root, directly from inside
    // services/api, or a process manager invoking dist/main.js with an
    // arbitrary cwd. Do not "simplify" this back to a bare
    // envFilePath-less ConfigModule.forRoot({ isGlobal: true }) call.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
    }),
    HealthModule, // Sprint 0 infra — MVP Build Plan Section 5
    // AuthModule,          // Sprint 1 — B2/B3/B6 land the rest of this; see
    // PasswordResetModule's own doc comment for why this PR (B4) wires
    // itself in directly instead of waiting for a unified AuthModule.
    // Expect a normal merge-order conflict here when B2/B3/B6 land too.
    PasswordResetModule, // Sprint 1 / PR B4 — /auth/forgot-password, /auth/reset-password
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
