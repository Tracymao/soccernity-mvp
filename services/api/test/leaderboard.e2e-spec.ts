import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { LeaderboardRollupService } from '../src/modules/leaderboard/leaderboard-rollup.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-6/leaderboard-read-rollup — Build Plan Section 4.9. Hits
// test/README.md's e2e triggers #1 (raw SQL — a GROUP BY + RANK() OVER
// (...) window-function aggregation, never run against a real Postgres
// before this PR) and #2 (transaction/isolation reasoning is not the
// primary driver here, but the raw SQL's own correctness — the LEAST()
// cap, the CASE-based source split, the active-account JOIN filter, and
// the upsert-per-row loop — can only be genuinely proven against a real
// engine, not a mock that just returns whatever rows a test tells it to).
//
// The mocked unit suite (src/modules/leaderboard/*.spec.ts) covers ISO
// week date math (both directions, including year-boundary cases),
// JwtAuthGuard wiring, DTO/query validation, and pagination shape —
// all with a hand-built mocked PrismaService. This file is what proves
// the raw SQL itself is valid and correct against the real schema.
//
// Users are seeded directly via Prisma + a real TokenService-minted
// access token (createUser), not POST /auth/register — the same speed
// choice banter.e2e-spec.ts / community-groups.e2e-spec.ts make. GET
// /leaderboard carries no @AuthRateLimit(), so this is purely about
// speed, not a rate-limit workaround; every downstream request still
// exercises the real JwtAuthGuard -> TokenService.verifyAccessToken
// chain. LeaderboardRollupService.rollupPeriod() is called DIRECTLY
// (via app.get(...)) rather than waiting for the real @Cron() tick —
// exactly the same "call the underlying method directly, with an
// explicit period/now, for determinism" precedent
// AccountDeletionSweepService's own e2e coverage established for its
// @Cron()-driven sweep.
describe('Leaderboard e2e (Section 4.9)', () => {
  let app: INestApplication;
  let rollup: LeaderboardRollupService;

  const PERIOD = '2026-W33'; // Mon 2026-08-10 through Sun 2026-08-16 UTC
  const OTHER_PERIOD = '2026-W32'; // the immediately-preceding ISO week

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    rollup = app.get(LeaderboardRollupService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function server() {
    return app.getHttpServer();
  }

  async function createUser(label: string, over: { accountStatus?: string } = {}): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-lb-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Leaderboard ${label}`,
        dateOfBirth: new Date('1994-05-05'),
        isMinor: false,
        accountStatus: over.accountStatus ?? 'active',
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  // Points-in-period timestamp helper — Tuesday of PERIOD/OTHER_PERIOD,
  // safely inside the [Monday 00:00, next Monday 00:00) UTC boundary.
  const IN_PERIOD_AT = new Date('2026-08-11T12:00:00.000Z');
  const IN_OTHER_PERIOD_AT = new Date('2026-08-04T12:00:00.000Z');

  async function awardLedgerEntry(
    userId: string,
    source: string,
    points: number,
    refId: string,
    occurredAt: Date = IN_PERIOD_AT,
  ) {
    const prisma = getTestPrismaClient();
    await prisma.pointsLedgerEntry.create({
      data: { userId, source, points, refId, occurredAt },
    });
  }

  describe('rollupPeriod + GET /leaderboard, end to end', () => {
    it('ranks users by summed points, highest first', async () => {
      const alice = await createUser('alice');
      const bob = await createUser('bob');

      await awardLedgerEntry(alice.userId, 'engagement_post', 3, 'post-1');
      await awardLedgerEntry(alice.userId, 'engagement_post', 3, 'post-2');
      await awardLedgerEntry(bob.userId, 'engagement_post', 3, 'post-3');

      await rollup.rollupPeriod(PERIOD);

      const res = await request(server())
        .get('/leaderboard')
        .query({ period: PERIOD })
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([
        { userId: alice.userId, displayName: 'E2E Leaderboard alice', points: 6, rank: 1 },
        { userId: bob.userId, displayName: 'E2E Leaderboard bob', points: 3, rank: 2 },
      ]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('caps summed ENGAGEMENT points at 100 per period, but never caps Contest points', async () => {
      const grinder = await createUser('grinder');
      const champion = await createUser('champion');

      // 40 posts * 3 points = 120 raw engagement -> capped to 100.
      for (let i = 0; i < 40; i++) {
        await awardLedgerEntry(grinder.userId, 'engagement_post', 3, `grind-post-${i}`);
      }

      // A single weekly win (50, uncapped) plus modest, well-under-cap
      // engagement (2 posts = 6) -> 56 total, NOT reduced.
      await awardLedgerEntry(champion.userId, 'contest_weekly_win', 50, 'round-1');
      await awardLedgerEntry(champion.userId, 'engagement_post', 3, 'champ-post-1');
      await awardLedgerEntry(champion.userId, 'engagement_post', 3, 'champ-post-2');

      await rollup.rollupPeriod(PERIOD);

      const res = await request(server())
        .get('/leaderboard')
        .query({ period: PERIOD })
        .set('Authorization', `Bearer ${grinder.accessToken}`)
        .expect(200);

      const byUserId = Object.fromEntries(res.body.items.map((i: { userId: string; points: number }) => [i.userId, i.points]));
      expect(byUserId[grinder.userId]).toBe(100); // capped, not 120
      expect(byUserId[champion.userId]).toBe(56); // uncapped contest + uncapped small engagement
    });

    it('mixes capped engagement AND uncapped contest points for the SAME user correctly', async () => {
      const user = await createUser('mixed');
      for (let i = 0; i < 40; i++) {
        await awardLedgerEntry(user.userId, 'engagement_like', 1, `like-${i}`); // 40 raw, under cap
      }
      await awardLedgerEntry(user.userId, 'contest_monthly_crown', 250, 'cycle-1');

      await rollup.rollupPeriod(PERIOD);

      const res = await request(server())
        .get('/leaderboard')
        .query({ period: PERIOD })
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      // 40 (under the 100 cap, so untouched) + 250 (uncapped) = 290.
      expect(res.body.items[0]).toEqual({ userId: user.userId, displayName: 'E2E Leaderboard mixed', points: 290, rank: 1 });
    });

    it('excludes a DEACTIVATED user from a fresh rollup entirely — no LeaderboardEntry row is written at all', async () => {
      const deactivated = await createUser('deactivated', { accountStatus: 'deactivated' });
      const active = await createUser('active-peer');

      await awardLedgerEntry(deactivated.userId, 'engagement_post', 3, 'ghost-post');
      await awardLedgerEntry(active.userId, 'engagement_post', 3, 'real-post');

      await rollup.rollupPeriod(PERIOD);

      const prisma = getTestPrismaClient();
      const entries = await prisma.leaderboardEntry.findMany({ where: { period: PERIOD } });
      expect(entries.map((e) => e.userId)).toEqual([active.userId]);
    });

    it('excludes a user who deactivates AFTER an earlier rollup already wrote their row — at READ time, not just future rollups', async () => {
      const user = await createUser('later-deactivated');
      const peer = await createUser('peer');

      await awardLedgerEntry(user.userId, 'engagement_post', 3, 'p-1');
      await awardLedgerEntry(peer.userId, 'engagement_post', 3, 'p-2');

      // First rollup tick, while `user` is still active — their row IS written.
      await rollup.rollupPeriod(PERIOD);
      const prisma = getTestPrismaClient();
      const afterFirstRollup = await prisma.leaderboardEntry.findMany({ where: { period: PERIOD } });
      expect(afterFirstRollup.map((e) => e.userId).sort()).toEqual([peer.userId, user.userId].sort());

      // Now deactivate — simulating the gap between two 15-minute ticks.
      await prisma.user.update({ where: { id: user.userId }, data: { accountStatus: 'deactivated' } });

      const res = await request(server())
        .get('/leaderboard')
        .query({ period: PERIOD })
        .set('Authorization', `Bearer ${peer.accessToken}`)
        .expect(200);

      // The stale row still exists in Postgres (rollup wrote it before
      // deactivation and this test never re-runs the rollup) — but
      // GET /leaderboard's own defensive read-time filter hides it
      // immediately regardless.
      expect(res.body.items.map((i: { userId: string }) => i.userId)).toEqual([peer.userId]);
      const staleRowStillExists = await prisma.leaderboardEntry.findUnique({
        where: { userId_period: { userId: user.userId, period: PERIOD } },
      });
      expect(staleRowStillExists).not.toBeNull();
    });

    it('isolates periods — a point earned in one ISO week never counts toward another', async () => {
      const user = await createUser('cross-period');
      await awardLedgerEntry(user.userId, 'engagement_post', 3, 'this-week-post', IN_PERIOD_AT);
      await awardLedgerEntry(user.userId, 'engagement_post', 3, 'last-week-post', IN_OTHER_PERIOD_AT);

      await rollup.rollupPeriod(PERIOD);
      await rollup.rollupPeriod(OTHER_PERIOD);

      const currentRes = await request(server())
        .get('/leaderboard')
        .query({ period: PERIOD })
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      const previousRes = await request(server())
        .get('/leaderboard')
        .query({ period: OTHER_PERIOD })
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(currentRes.body.items[0].points).toBe(3);
      expect(previousRes.body.items[0].points).toBe(3);
    });

    it('a period with no ledger activity returns an empty page, not an error', async () => {
      const user = await createUser('lonely');
      const res = await request(server())
        .get('/leaderboard')
        .query({ period: '2026-W01' })
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('defaults to the current UTC ISO week when no period is supplied', async () => {
      const user = await createUser('default-period');
      await awardLedgerEntry(user.userId, 'engagement_post', 3, 'p-1', new Date());
      const now = new Date();
      const { getCurrentIsoWeekPeriod } = await import('../src/modules/leaderboard/iso-week.util');
      await rollup.rollupPeriod(getCurrentIsoWeekPeriod(now));

      const res = await request(server())
        .get('/leaderboard')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.items.map((i: { userId: string }) => i.userId)).toContain(user.userId);
    });

    it('ties are allowed — two users with equal points share the same rank', async () => {
      const a = await createUser('tie-a');
      const b = await createUser('tie-b');
      await awardLedgerEntry(a.userId, 'engagement_post', 3, 'a-1');
      await awardLedgerEntry(b.userId, 'engagement_post', 3, 'b-1');

      await rollup.rollupPeriod(PERIOD);

      const res = await request(server())
        .get('/leaderboard')
        .query({ period: PERIOD })
        .set('Authorization', `Bearer ${a.accessToken}`)
        .expect(200);

      const ranks = res.body.items.map((i: { rank: number }) => i.rank);
      expect(ranks).toEqual([1, 1]);
    });

    it('re-running rollupPeriod on the same period is idempotent (upsert, not duplicate rows)', async () => {
      const user = await createUser('idempotent');
      await awardLedgerEntry(user.userId, 'engagement_post', 3, 'p-1');

      await rollup.rollupPeriod(PERIOD);
      await rollup.rollupPeriod(PERIOD);
      await rollup.rollupPeriod(PERIOD);

      const prisma = getTestPrismaClient();
      const rows = await prisma.leaderboardEntry.findMany({ where: { userId: user.userId, period: PERIOD } });
      expect(rows).toHaveLength(1);
      expect(rows[0].points).toBe(3);
    });

    it('keyset pagination walks the full ranked list with no duplicates and no gaps', async () => {
      const users = [];
      for (let i = 0; i < 5; i++) {
        const u = await createUser(`page-${i}`);
        await awardLedgerEntry(u.userId, 'engagement_post', 3 + i, `page-post-${i}`); // distinct points -> distinct ranks
        users.push(u);
      }

      await rollup.rollupPeriod(PERIOD);

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await request(server())
          .get('/leaderboard')
          .query({ period: PERIOD, limit: 2, ...(cursor ? { cursor } : {}) })
          .set('Authorization', `Bearer ${users[0].accessToken}`)
          .expect(200);
        seen.push(...res.body.items.map((i: { userId: string }) => i.userId));
        cursor = res.body.nextCursor ?? undefined;
      } while (cursor);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5); // no duplicates
      // Highest points (3+4=7) first.
      expect(seen[0]).toBe(users[4].userId);
      expect(seen[4]).toBe(users[0].userId);
    });
  });

  describe('validation and auth', () => {
    it('rejects an unauthenticated request', async () => {
      await request(server()).get('/leaderboard').expect(401);
    });

    it('rejects a malformed period with 400', async () => {
      const user = await createUser('bad-period');
      await request(server())
        .get('/leaderboard')
        .query({ period: 'not-a-period' })
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(400);
    });

    it('rejects a period week that does not exist for its ISO year with 400', async () => {
      const user = await createUser('bad-week');
      // 2025 has only 52 ISO weeks (2025-01-01 is a Wednesday, not a leap
      // year) — see iso-week.util.spec.ts.
      await request(server())
        .get('/leaderboard')
        .query({ period: '2025-W53' })
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(400);
    });
  });
});
