import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { SentryModule } from '@sentry/nestjs/setup';
import { HealthModule } from './health/health.module';
import { PasswordResetModule } from './modules/auth/password-reset/password-reset.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthRegistrationModule } from './modules/auth/registration/registration.module';
import { GuardianConsentModule } from './modules/auth/guardian-consent/guardian-consent.module';
import { UsersModule } from './modules/users/users.module';
import { FeedModule } from './modules/feed/feed.module';
import { ClubsModule } from './modules/clubs/clubs.module';

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
    PasswordResetModule, // Sprint 1 / PR B4 — /auth/forgot-password, /auth/reset-password
    AuthModule, // Sprint 1 / PR B3 — login, refresh, logout (Section 4.1 / 5.7)
    // Sprint 1 / PR B2 — POST /auth/register, POST /auth/verify-email
    // only (Build Plan Section 4.1). Deliberately its own module, not a
    // shared "AuthModule" — see registration.module.ts. B3/B4/B6 add the
    // rest of the Auth/User endpoints in their own parallel modules; a
    // small merge-order conflict on the lines around this import is
    // expected when those land, not something to avoid architecturally.
    AuthRegistrationModule,
    GuardianConsentModule, // Sprint 1 / PR B5 — /auth/guardian-consent (Section 4.1 / 8.3 step 4)
    UsersModule, // Sprint 1 — B6 (profile endpoints, Section 4.2, self-scope only for now)
    // Sprint 2 — Section 4.3 slice one only: POST /posts + GET /posts/feed.
    // GET /posts/:id, like, comment, save (also Section 4.3) are a
    // separate follow-up slice — see modules/feed/README.md.
    FeedModule,
    // Sprint 2 — Section 4.4 (Club & Banter Service), club subset only:
    // GET /clubs, GET /clubs/:id, POST /clubs/:id/join. /banter-rooms*
    // (the other half of Section 4.4) remains Sprint 3 — see
    // modules/clubs/README.md.
    ClubsModule,
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
