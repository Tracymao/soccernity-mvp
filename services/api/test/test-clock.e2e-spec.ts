import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK, Clock, systemClock } from '../src/clock/clock';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { buildContestSchedule } from '../src/modules/contest/contest-schedule.util';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/test-clock-qa. The environment-driven test clock, against the REAL app and REAL Postgres:
//  1. with TEST_CLOCK_ISO set under NODE_ENV=test the whole app (the contest read, the lifecycle
//     sweep) runs on that instant -- no overrideProvider, only the environment, exactly as a QA run
//     starts it;
//  2. without it the app runs on the system clock;
//  3. a production process REFUSES TO START when any test-clock variable is set (a real child
//     process running the real main.ts), and there is no HTTP route that sets the clock.

const CLOCK_VARS = ['TEST_CLOCK_ISO', 'TEST_CLOCK_ADVANCE', 'E2E_TEST_CLOCK'] as const;
// Day 10 of November 2026: week 2, Phase 1 (entries open until 00:00 on day 12).
const FROZEN_ISO = '2026-11-10T12:00:00Z';

describe('Test clock e2e', () => {
  const saved: Record<string, string | undefined> = {};
  const rand = () => Math.random().toString(36).slice(2);
  const prisma = () => getTestPrismaClient();

  beforeAll(() => {
    for (const k of CLOCK_VARS) saved[k] = process.env[k];
  });
  afterAll(async () => {
    for (const k of CLOCK_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await disconnectTestPrismaClient();
  });
  beforeEach(async () => {
    for (const k of CLOCK_VARS) delete process.env[k];
    await resetDatabase();
  });

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    return app;
  }

  async function seedNovemberCycle() {
    const schedule = buildContestSchedule(2026, 11);
    return prisma().contestCycle.create({
      data: {
        title: 'November Challenge',
        monthKey: schedule.monthKey,
        status: 'active',
        startsAt: schedule.weeks[0].opensAt,
        endsAt: schedule.final.monthEndAt,
        minimumTally: 5,
        rounds: {
          create: [
            ...schedule.weeks.map((w) => ({
              weekNumber: w.weekNumber,
              status: 'open',
              opensAt: w.opensAt,
              closesAt: w.votesLockAt,
              task: `Week ${w.weekNumber} task`,
              viewWatchLimitSeconds: 10,
            })),
            { weekNumber: 4, status: 'open', opensAt: schedule.final.opensAt, closesAt: schedule.final.revealAt },
          ],
        },
      },
      select: { id: true },
    });
  }

  async function userToken(app: INestApplication): Promise<string> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-test-clock-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: 'Clock Tester',
        verificationStatus: 'verified',
        username: `tc_${rand()}`.slice(0, 24),
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return accessToken.token;
  }

  it('runs the whole app on TEST_CLOCK_ISO under NODE_ENV=test (frozen)', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    process.env.TEST_CLOCK_ISO = FROZEN_ISO;
    const app = await boot();
    try {
      const clock = app.get<Clock>(APP_CLOCK);
      expect(clock).not.toBe(systemClock);
      expect(clock.now().toISOString()).toBe('2026-11-10T12:00:00.000Z');
      await new Promise((r) => setTimeout(r, 25));
      expect(clock.now().toISOString()).toBe('2026-11-10T12:00:00.000Z');

      await seedNovemberCycle();
      const token = await userToken(app);
      const res = await request(app.getHttpServer()).get('/contest/current').set('Authorization', `Bearer ${token}`).expect(200);
      // The contest read derives its state from the injected clock: 12:00Z on day 10 is week 2 Phase 1.
      expect(res.body.calendarState).toMatchObject({ kind: 'week_entries', weekNumber: 2 });
    } finally {
      await app.close();
    }
  });

  it('the lifecycle sweep decides on the test-clock instant, not the real date', async () => {
    process.env.TEST_CLOCK_ISO = FROZEN_ISO;
    const app = await boot();
    try {
      const { id } = await seedNovemberCycle();
      const result = await app.get(ContestLifecycleService).runOnce(app.get<Clock>(APP_CLOCK).now());
      expect(result.cyclesProcessed).toBeGreaterThanOrEqual(1);
      // Phase 1 of week 1 ended on day 5 -- before the frozen instant -- so week 1 was closed
      // (forfeited: it has no entries); week 2 (entries still open at 12:00 on day 10) was not.
      const rounds = await prisma().contestRound.findMany({ where: { cycleId: id }, orderBy: { weekNumber: 'asc' } });
      expect(rounds[0].phase1ClosedAt).not.toBeNull();
      expect(rounds[1].phase1ClosedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('advances in real time with TEST_CLOCK_ADVANCE=1', async () => {
    process.env.TEST_CLOCK_ISO = FROZEN_ISO;
    process.env.TEST_CLOCK_ADVANCE = '1';
    const app = await boot();
    try {
      const clock = app.get<Clock>(APP_CLOCK);
      const first = clock.now().getTime();
      await new Promise((r) => setTimeout(r, 60));
      const second = clock.now().getTime();
      expect(first).toBeGreaterThanOrEqual(Date.parse(FROZEN_ISO));
      expect(first - Date.parse(FROZEN_ISO)).toBeLessThan(60_000);
      expect(second - first).toBeGreaterThanOrEqual(50);
    } finally {
      await app.close();
    }
  });

  it('is the system clock when no test-clock variable is set', async () => {
    const app = await boot();
    try {
      expect(app.get<Clock>(APP_CLOCK)).toBe(systemClock);
    } finally {
      await app.close();
    }
  });

  it('exposes no HTTP route that sets or moves the clock', async () => {
    process.env.TEST_CLOCK_ISO = FROZEN_ISO;
    const app = await boot();
    try {
      const token = await userToken(app);
      const server = app.getHttpServer();
      for (const route of ['/clock', '/test-clock', '/admin/clock', '/admin/test-clock', '/contest/clock', '/health/clock']) {
        for (const method of ['post', 'put', 'patch'] as const) {
          const res = await request(server)[method](route).set('Authorization', `Bearer ${token}`).send({ now: '2030-01-01T00:00:00Z' });
          expect(res.status).toBe(404);
        }
      }
      expect(app.get<Clock>(APP_CLOCK).now().toISOString()).toBe('2026-11-10T12:00:00.000Z');
    } finally {
      await app.close();
    }
  });

  describe('production refuses to start with a test clock (a real child process running the real main.ts)', () => {
    // Runs src/main.ts through TypeScript's transpiler (the e2e suite has no built dist/ in CI).
    const hook = path.join(os.tmpdir(), `soccernity-ts-hook-${process.pid}.js`);
    beforeAll(() => {
      fs.writeFileSync(
        hook,
        [
          `const ts = require(${JSON.stringify(require.resolve('typescript'))});`,
          `const fs = require('fs');`,
          `require.extensions['.ts'] = (module, filename) => {`,
          `  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {`,
          `    fileName: filename,`,
          `    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true, emitDecoratorMetadata: true },`,
          `  });`,
          `  module._compile(out.outputText, filename);`,
          `};`,
          ``,
        ].join('\n'),
      );
    });
    afterAll(() => fs.rmSync(hook, { force: true }));

    const PROD_OK = {
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(48),
      ADMIN_JWT_SECRET: 'a'.repeat(48),
      WEB_APP_BASE_URL: 'https://soccernity.example.org',
      ADMIN_APP_BASE_URL: 'https://admin.soccernity.example.org',
      PORT: '0',
    };

    function startMain(extra: Record<string, string>) {
      const env: NodeJS.ProcessEnv = { ...process.env, ...PROD_OK, ...extra };
      for (const k of CLOCK_VARS) if (!(k in extra)) delete env[k];
      return spawnSync(process.execPath, ['-r', hook, path.resolve(__dirname, '..', 'src', 'main.ts')], {
        cwd: path.resolve(__dirname, '..'),
        env,
        encoding: 'utf8',
        timeout: 110_000,
      });
    }

    it.each([
      [{ TEST_CLOCK_ISO: FROZEN_ISO }, 'TEST_CLOCK_ISO'],
      [{ E2E_TEST_CLOCK: '1' }, 'E2E_TEST_CLOCK'],
      [{ TEST_CLOCK_ISO: FROZEN_ISO, E2E_TEST_CLOCK: '1', TEST_CLOCK_ADVANCE: '1' }, 'TEST_CLOCK_ISO, TEST_CLOCK_ADVANCE, E2E_TEST_CLOCK'],
    ])(
      'exits non-zero, naming the variables, before listening (%j)',
      (vars, named) => {
        const res = startMain(vars);
        expect(res.error).toBeUndefined();
        expect(res.status).not.toBe(0);
        expect(res.signal).toBeNull();
        const output = `${res.stdout}\n${res.stderr}`;
        expect(output).toContain('Refusing to start: the QA test clock is configured in production');
        expect(output).toContain(named);
        expect(output).not.toContain('Soccernity API running');
      },
      120_000,
    );
  });
});
