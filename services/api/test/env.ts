import * as dotenv from 'dotenv';
import * as path from 'path';

// Shared env-loading logic for the e2e layer — used by both
// jest-e2e.config.js's `globalSetup` (runs once, in Jest's main process,
// before any test file or worker exists) and `setupFiles` (runs once per
// test-file worker, before that file's own imports execute, in particular
// before `import { AppModule } from '../src/app.module'` triggers
// ConfigModule.forRoot()'s own dotenv load of the root .env). Both need the
// exact same resolution, so it lives here once rather than being
// duplicated or drifting between the two entry points.
//
// This does NOT branch on environment (CI vs local) anywhere. It always
// attempts to load `.env.test` from the repo root; the reason this is safe
// in CI (where no .env.test file exists — only .env.test.example is
// committed) is dotenv's own default behavior, not a conditional here:
// dotenv.config() never overrides a variable already present in
// process.env, and silently no-ops (does not throw) when the target file
// doesn't exist. CI's ci.yml already sets DATABASE_URL (and, as of the
// PR #59 CI-failure fix below, JWT_SECRET) as real job-level env vars
// before `npm run test:e2e` runs, so by the time this file's
// dotenv.config() call executes, those are already set and the
// missing-file no-op leaves them untouched. Locally, neither is usually
// already in process.env, so the load from .env.test actually takes
// effect. Same code path, same outcome logic, different starting state —
// see test/README.md.
//
// Corrected framing, post PR #59: this file's job is to load whatever a
// *self-contained* e2e run needs, not to assume a developer's pre-existing
// local `.env` will quietly supply the rest. PR #59's own first CI run
// failed with "secretOrPrivateKey must have a value" precisely because
// JWT_SECRET was never one of the values anything here (or in ci.yml)
// actually set — it only ever worked locally because a developer's
// long-lived root `.env` happened to already have a real one, which
// `ConfigModule.forRoot`'s own dotenv load (triggered by importing
// AppModule) picks up completely independently of this file. That was
// accidental, not by design — see .env.test.example's corrected comment
// for the full explanation of which config keys are genuinely optional
// (code-level default or graceful no-op) versus required with no
// fallback (currently just JWT_SECRET).
let loaded = false;

export function loadTestEnv(): void {
  if (loaded) return;
  loaded = true;

  const envTestPath = path.resolve(__dirname, '..', '..', '..', '.env.test');
  dotenv.config({ path: envTestPath });
}
