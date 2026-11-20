// Sentry must be initialized before anything else in the process — this is a
// hard requirement of the SDK's auto-instrumentation, and why this file is
// imported as the very first line of main.ts, ahead of @nestjs/core.
//
// Because the Nest DI container (and therefore ConfigService) does not exist
// yet at this point in the process lifecycle, this file reads SENTRY_DSN via
// `dotenv` directly rather than through @nestjs/config's ConfigService.
// @nestjs/config's ConfigModule (see app.module.ts) still governs env access
// everywhere else in the running application — this is the one place in the
// codebase that has to read process.env directly, and it does so for a
// documented SDK-ordering reason, not out of convenience.
import * as dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN?.trim();
const isPlaceholder = !dsn || dsn === 'replace-me-with-real-dsn-once-account-exists';

if (isPlaceholder) {
  // Graceful no-op: no real DSN has been provisioned yet (see CLAUDE.md /
  // Sentry account creation requires a human). Sentry.init() is intentionally
  // NOT called, so every Sentry SDK call elsewhere in the app becomes a no-op
  // rather than throwing or crashing startup.
  console.log('[sentry] SENTRY_DSN not set — error monitoring is wired but inactive.');
} else {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 1.0,
  });
  console.log('[sentry] initialized.');
}
