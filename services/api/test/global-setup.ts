import { execSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { loadTestEnv } from './env';

// Jest `globalSetup` — runs exactly once, in Jest's main process, before
// any test file or worker starts (see jest-e2e.config.js). Responsible for
// getting a real, migrated Postgres test database ready to connect to,
// unattended, in both CI and local dev:
//
//   - CI (ci.yml): the `soccernity_test` database already exists (Postgres
//     service container is started with POSTGRES_DB: soccernity_test), and
//     DATABASE_URL is already set as a real job-level env var. The
//     database-exists check below is expected to find it already there and
//     skip creation — this is the "must not error if it already exists"
//     idempotency case.
//   - Local dev: `soccernity_test` does NOT exist yet on a developer's
//     docker-compose Postgres (only `soccernity`, the dev database, does).
//     DATABASE_URL comes from .env.test (see env.ts). The database-exists
//     check finds nothing and creates it.
//
// No branching on environment anywhere in this file — both cases run the
// exact same code; only the live state of the database they connect to
// differs.
function assertSafeIdentifier(name: string): void {
  // CREATE DATABASE can't take a parameterized identifier the way a value
  // can be parameterized in a query — this guards the one place this file
  // has to interpolate a string directly into raw SQL. DATABASE_URL is
  // developer/CI-controlled, not user input, but there's no reason not to
  // validate it as if it mattered.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Refusing to use "${name}" as a database name — expected a plain identifier (letters, digits, underscore, not starting with a digit). Check DATABASE_URL.`,
    );
  }
}

function getDatabaseName(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, '');
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

export default async function globalSetup(): Promise<void> {
  loadTestEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Locally: cp .env.test.example .env.test at the repo root (see test/README.md). ' +
        'In CI: ci.yml should already set this as a job-level env var.',
    );
  }

  const targetDatabaseName = getDatabaseName(databaseUrl);
  assertSafeIdentifier(targetDatabaseName);

  // Connect to the default "postgres" system database — the target test
  // database may not exist yet, so it can't be connected to directly for
  // this check. Same credentials/host/port as DATABASE_URL, only the
  // database name differs.
  const adminUrl = withDatabaseName(databaseUrl, 'postgres');
  const adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });

  try {
    const existing = await adminClient.$queryRaw<{ exists: number }[]>`
      SELECT 1 AS exists FROM pg_database WHERE datname = ${targetDatabaseName}
    `;

    if (existing.length === 0) {
      // Identifier interpolation, not a parameterized value — see
      // assertSafeIdentifier above for why this is guarded.
      await adminClient.$executeRawUnsafe(`CREATE DATABASE "${targetDatabaseName}"`);
      console.log(`[e2e global-setup] Created test database "${targetDatabaseName}".`);
    } else {
      console.log(`[e2e global-setup] Test database "${targetDatabaseName}" already exists — reusing it.`);
    }
  } finally {
    await adminClient.$disconnect();
  }

  // Apply every migration in prisma/migrations to the (now guaranteed to
  // exist) test database. Safe to run every time — `prisma migrate deploy`
  // is itself idempotent, applying only migrations not yet recorded against
  // this database.
  console.log(`[e2e global-setup] Running "prisma migrate deploy" against "${targetDatabaseName}"...`);
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
