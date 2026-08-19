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
// doesn't exist. CI's ci.yml already sets DATABASE_URL as a real job-level
// env var before `npm run test:e2e` runs, so by the time this file's
// dotenv.config() call executes, DATABASE_URL is already set and the
// missing-file no-op leaves it untouched. Locally, DATABASE_URL is usually
// NOT already in process.env, so the load from .env.test actually takes
// effect. Same code path, same outcome logic, different starting state —
// see test/README.md.
let loaded = false;

export function loadTestEnv(): void {
  if (loaded) return;
  loaded = true;

  const envTestPath = path.resolve(__dirname, '..', '..', '..', '.env.test');
  dotenv.config({ path: envTestPath });
}
