import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { createRequire } from 'module';
import {
  ADMIN_CREDENTIALS,
  PORTS,
  QA_DB_NAME,
  QA_REDIS_DB,
  REPO,
  RUN_DIR,
  URLS,
  qaDatabaseUrl,
} from './stack';
import { apiEnvironment, spawnApi, stopApi, waitForApiHealth } from './api-process';
import { contestPhaseInstant, isContestPhase, CONTEST_PHASES } from './contest-clock';
import { startFakeMediaServices } from './fake-media-services';

// Everything below is TEST HARNESS, not product code: it creates a scratch
// database, migrates it with the repo's own migrations, seeds the one
// admin account that cannot be self-registered (Decision Log #191), and
// launches the real API + both frontends.

const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));

function readRootEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(REPO, '.env');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function waitForPort(port: number, label: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`${label} did not open port ${port} in ${timeoutMs}ms`));
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

const children: ChildProcess[] = [];
const closers: Array<() => Promise<void>> = [];

export default async function globalSetup(): Promise<() => Promise<void>> {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.rmSync(path.join(RUN_DIR, 'admin-token.json'), { force: true }); // a stale token belongs to a dropped database
  const rootEnv = readRootEnv();
  const baseDb = process.env.QA_BASE_DATABASE_URL ?? rootEnv.DATABASE_URL;
  if (!baseDb) throw new Error('No DATABASE_URL in the root .env (or QA_BASE_DATABASE_URL) to take credentials from.');
  const dbUrl = qaDatabaseUrl(baseDb);
  const redisBase = (process.env.QA_BASE_REDIS_URL ?? rootEnv.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '');
  const redisUrl = `${redisBase}/${QA_REDIS_DB}`;

  // --- 1. Fresh scratch database ------------------------------------------
  const { PrismaClient } = requireFromApi('@prisma/client');
  const adminUrl = new URL(baseDb);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    if (!process.env.E2E_KEEP_DB) {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${QA_DB_NAME}" WITH (FORCE)`);
    }
    const existing = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${QA_DB_NAME}`;
    if ((existing as unknown[]).length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${QA_DB_NAME}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.join(REPO, 'services', 'api'),
    env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    stdio: 'inherit',
  });

  // --- 2. Redis logical DB ------------------------------------------------
  const Redis = requireFromApi('ioredis');
  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();

  // --- 3. The one admin account that cannot self-register -----------------
  const argon2 = requireFromApi('argon2');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.adminUser.create({
      data: {
        email: ADMIN_CREDENTIALS.email,
        fullName: ADMIN_CREDENTIALS.fullName,
        passwordHash: await argon2.hash(ADMIN_CREDENTIALS.password),
        role: 'superadmin',
        accountStatus: 'active',
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  // --- 4. Build + start the real API ---------------------------------------
  execSync('node ../../node_modules/@nestjs/cli/bin/nest.js build', {
    cwd: path.join(REPO, 'services', 'api'),
    stdio: 'inherit',
  });
  // backend/test-clock-qa: start the API on a chosen instant so a real browser can see a live
  // Contest phase. QA_CONTEST_PHASE=<phase> (see support/contest-clock.ts) picks the instant for
  // QA_CONTEST_MONTH (default 2026-11); QA_TEST_CLOCK_ISO sets it explicitly; QA_TEST_CLOCK_ADVANCE=1
  // lets it run on from there. Nothing set = the real clock. The three variables are always written
  // explicitly (blank when unused) so a stray value in the developer's shell can never reach the API.
  let testClockIso = process.env.QA_TEST_CLOCK_ISO?.trim() || '';
  const qaPhase = process.env.QA_CONTEST_PHASE?.trim();
  if (!testClockIso && qaPhase) {
    if (!isContestPhase(qaPhase)) throw new Error(`QA_CONTEST_PHASE must be one of: ${CONTEST_PHASES.join(', ')} (got "${qaPhase}")`);
    testClockIso = contestPhaseInstant(qaPhase, process.env.QA_CONTEST_MONTH).toISOString();
  }
  if (testClockIso) console.log(`[e2e global-setup] API test clock: ${testClockIso}${process.env.QA_TEST_CLOCK_ADVANCE === '1' ? ' (advancing)' : ' (frozen)'}`);
  // FC10 (B-240): the object store and the Rekognition stand-ins the API's media pipeline talks to.
  const fakeMedia = await startFakeMediaServices();
  closers.push(() => fakeMedia.close());
  const api = spawnApi(
    apiEnvironment(dbUrl, redisUrl, { iso: testClockIso, advance: process.env.QA_TEST_CLOCK_ADVANCE === '1' }),
    true,
  );
  children.push(api);
  await waitForApiHealth();

  // --- 5. Real frontends ---------------------------------------------------
  const vite = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
  for (const [app, port] of [
    ['web', PORTS.web],
    ['admin', PORTS.admin],
  ] as const) {
    const log = fs.openSync(path.join(RUN_DIR, `${app}.log`), 'w');
    const child = spawn('node', [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
      cwd: path.join(REPO, 'apps', app),
      env: { ...process.env, VITE_API_BASE_URL: URLS.api },
      stdio: ['ignore', log, log],
    });
    children.push(child);
    await waitForPort(port, `apps/${app}`);
  }

  // Exposed to the worker processes.
  process.env.QA_DATABASE_URL = dbUrl;
  process.env.QA_REDIS_URL = redisUrl;

  return async () => {
    for (const close of closers) await close().catch(() => undefined);
    for (const c of children) {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
    // Spec 17 restarts the API on test-clock instants; whichever one is running now is the one in api.pid.
    await stopApi().catch(() => undefined);
  };
}
