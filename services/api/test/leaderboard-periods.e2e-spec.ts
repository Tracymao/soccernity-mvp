import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { LeaderboardHistoryRollupService } from '../src/modules/leaderboard/leaderboard-history-rollup.service';
import { LeaderboardRollupService } from '../src/modules/leaderboard/leaderboard-rollup.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b053-leaderboard-periods (B-053, Decision Log #472), against real Postgres: the all-time board,
// the club per row, and the 7-day rank change. The raw SQL in LeaderboardHistoryRollupService (a UNION of
// two aggregations, a RANK() per club, and an UPDATE with a scalar subquery) can only be proven correct
// against a real engine. The rollups are called DIRECTLY with a fixed `now`, the same precedent
// leaderboard.e2e-spec.ts uses, so nothing here depends on the wall clock.
//
// Calendar (all UTC, hand-derived: 2026-08-10 is a Monday):
//   2026-W32 = Mon 2026-08-03 .. Sun 2026-08-09      2026-W33 = Mon 2026-08-10 .. Sun 2026-08-16
//   NOW      = Wed 2026-08-12 12:00   ->  "seven days earlier" (AS_OF) = Wed 2026-08-05 12:00
describe('Leaderboard all-time, club and 7-day change e2e (B-053)', () => {
  let app: INestApplication;
  let rollup: LeaderboardRollupService;
  let history: LeaderboardHistoryRollupService;

  const WEEK = '2026-W33';
  const NOW = new Date('2026-08-12T12:00:00.000Z');
  const BEFORE_AS_OF = new Date('2026-08-04T12:00:00.000Z'); // W32, before AS_OF
  const AFTER_AS_OF = new Date('2026-08-07T12:00:00.000Z'); // W32, after AS_OF
  const THIS_WEEK = new Date('2026-08-11T12:00:00.000Z'); // W33, before NOW

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    rollup = app.get(LeaderboardRollupService);
    history = app.get(LeaderboardHistoryRollupService);
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

  async function createUser(
    label: string,
    over: { isMinor?: boolean; representedClubId?: string | null } = {},
  ): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-lbp-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Real Name ${label}`,
        username: `lbp_${label}`,
        dateOfBirth: seedDob(over.isMinor ? '2012-05-05' : '1994-05-05'),
        isMinor: over.isMinor ?? false,
        accountStatus: 'active',
        representedClubId: over.representedClubId ?? null,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createClub(name: string): Promise<string> {
    return (await getTestPrismaClient().clubPage.create({ data: { name } })).id;
  }

  // Whole points in, quarter units stored. `revokedAt` and `clubId` are optional.
  let refCounter = 0;
  async function ledger(
    userId: string,
    points: number,
    occurredAt: Date,
    extra: { revokedAt?: Date; clubId?: string } = {},
  ) {
    await getTestPrismaClient().pointsLedgerEntry.create({
      data: {
        userId,
        source: 'engagement_like_given',
        quarterPoints: points * 4,
        refId: `ref-${++refCounter}`,
        occurredAt,
        revokedAt: extra.revokedAt,
        clubId: extra.clubId,
      },
    });
  }

  async function runAllRollups() {
    await rollup.rollupPeriod(WEEK);
    await history.runHistoryRollup(NOW);
  }

  function board(accessToken: string, query: Record<string, string>) {
    return request(server()).get('/leaderboard').query(query).set('Authorization', `Bearer ${accessToken}`);
  }

  type Item = { userId: string; points: number; rank: number; club: unknown; rankChange7d: number | null };
  const byId = (items: Item[]) => Object.fromEntries(items.map((i) => [i.userId, i]));

  describe('all-time board', () => {
    it('is the sum of the quarter-point ledger since the start, across weeks, ranked like a weekly board', async () => {
      const alice = await createUser('alice');
      const bob = await createUser('bob');
      await ledger(alice.userId, 5, BEFORE_AS_OF);
      await ledger(alice.userId, 10, AFTER_AS_OF);
      await ledger(alice.userId, 20, THIS_WEEK);
      await ledger(bob.userId, 10, BEFORE_AS_OF);
      await ledger(bob.userId, 8, THIS_WEEK);
      // An older year too: all-time reaches back to the start.
      await ledger(bob.userId, 100, new Date('2025-03-01T12:00:00.000Z'));

      await runAllRollups();

      const res = await board(alice.accessToken, { period: 'all-time' }).expect(200);
      expect(res.body.items.map((i: Item) => [i.userId, i.points, i.rank])).toEqual([
        [bob.userId, 118, 1],
        [alice.userId, 35, 2],
      ]);
      // The weekly board is untouched: W33 only has this week's rows.
      const weekly = await board(alice.accessToken, { period: WEEK }).expect(200);
      expect(weekly.body.items.map((i: Item) => [i.userId, i.points, i.rank])).toEqual([
        [alice.userId, 20, 1],
        [bob.userId, 8, 2],
      ]);
    });

    it('leaves a REVOKED row out and a deactivated account off, exactly like the weekly board', async () => {
      const alice = await createUser('alice');
      const gone = await createUser('gone');
      await ledger(alice.userId, 7, THIS_WEEK);
      await ledger(alice.userId, 50, BEFORE_AS_OF, { revokedAt: THIS_WEEK });
      await ledger(gone.userId, 99, THIS_WEEK);
      await getTestPrismaClient().user.update({ where: { id: gone.userId }, data: { accountStatus: 'deactivated' } });

      await runAllRollups();

      const res = await board(alice.accessToken, { period: 'all-time' }).expect(200);
      expect(res.body.items.map((i: Item) => [i.userId, i.points])).toEqual([[alice.userId, 7]]);
    });

    it('is empty (not an error) before the rollup has run, and an unknown period is still a 400', async () => {
      const alice = await createUser('alice');
      const res = await board(alice.accessToken, { period: 'all-time' }).expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
      await board(alice.accessToken, { period: 'All-Time' }).expect(400);
    });

    it('pages with the same (rank, userId) keyset: no gaps, no repeats', async () => {
      const users = [];
      for (let i = 1; i <= 5; i++) {
        const u = await createUser(`p${i}`);
        users.push(u);
        await ledger(u.userId, i * 3, THIS_WEEK);
      }
      await runAllRollups();

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 3; page++) {
        const res = await board(users[0].accessToken, { period: 'all-time', limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...res.body.items.map((i: Item) => i.userId));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual([users[4], users[3], users[2], users[1], users[0]].map((u) => u.userId));
    });
  });

  describe('7-day rank change', () => {
    // The shared story. THEN = the board as it stood at AS_OF (Wed 2026-08-05 12:00).
    //   THEN weekly (W32 up to AS_OF):   dave 50 (his row is revoked only AFTER AS_OF), bob 10, alice 5.
    //                                    eve's 30 was revoked BEFORE AS_OF, so eve is not on it.
    //   NOW  weekly (W33):               alice 20, bob 8, carol 3, dave 1, eve 2.
    async function seedStory() {
      const alice = await createUser('alice');
      const bob = await createUser('bob');
      const carol = await createUser('carol');
      const dave = await createUser('dave');
      const eve = await createUser('eve');
      await ledger(dave.userId, 50, BEFORE_AS_OF, { revokedAt: new Date('2026-08-06T00:00:00.000Z') });
      await ledger(bob.userId, 10, BEFORE_AS_OF);
      await ledger(alice.userId, 5, BEFORE_AS_OF);
      await ledger(eve.userId, 30, BEFORE_AS_OF, { revokedAt: new Date('2026-08-05T00:00:00.000Z') });
      await ledger(alice.userId, 10, AFTER_AS_OF); // after AS_OF: must NOT count in the earlier board
      await ledger(alice.userId, 20, THIS_WEEK);
      await ledger(bob.userId, 8, THIS_WEEK);
      await ledger(carol.userId, 3, THIS_WEEK);
      await ledger(dave.userId, 1, THIS_WEEK);
      await ledger(eve.userId, 2, THIS_WEEK);
      return { alice, bob, carol, dave, eve };
    }

    it('weekly board: this week to date against last week at the same moment, null for anyone not on it then', async () => {
      const { alice, bob, carol, dave, eve } = await seedStory();

      await runAllRollups();

      const res = await board(alice.accessToken, { period: WEEK }).expect(200);
      const rows = byId(res.body.items);
      // Now: alice 1, bob 2, carol 3, eve 4 (2 pts), dave 5 (1 pt). Then: dave 1, bob 2, alice 3.
      expect(rows[alice.userId]).toMatchObject({ rank: 1, rankChange7d: -2 }); // 1 - 3: moved up two
      expect(rows[bob.userId]).toMatchObject({ rank: 2, rankChange7d: 0 }); // a real zero: same rank both times
      expect(rows[carol.userId]).toMatchObject({ rank: 3, rankChange7d: null }); // not on the board then
      expect(rows[eve.userId]).toMatchObject({ rank: 4, rankChange7d: null }); // revoked before AS_OF: not on it
      expect(rows[dave.userId]).toMatchObject({ rank: 5, rankChange7d: 4 }); // 5 - 1: moved down four (a row revoked
      // AFTER AS_OF still counted then)
    });

    it('all-time board: the whole ledger up to seven days ago against the whole ledger now', async () => {
      const { alice, bob, carol, dave, eve } = await seedStory();

      await runAllRollups();

      const res = await board(alice.accessToken, { period: 'all-time' }).expect(200);
      const rows = byId(res.body.items);
      // Now (unrevoked rows only): alice 35, bob 18, carol 3, eve 2, dave 1.
      // Then (as of AS_OF): dave 50, bob 10, alice 5.
      expect(rows[alice.userId]).toMatchObject({ points: 35, rank: 1, rankChange7d: -2 });
      expect(rows[bob.userId]).toMatchObject({ points: 18, rank: 2, rankChange7d: 0 });
      expect(rows[carol.userId]).toMatchObject({ rank: 3, rankChange7d: null });
      expect(rows[eve.userId]).toMatchObject({ rank: 4, rankChange7d: null });
      expect(rows[dave.userId]).toMatchObject({ rank: 5, rankChange7d: 4 });
    });

    it('is null for everyone, never 0, when there is no history seven days back (a brand new board)', async () => {
      const alice = await createUser('alice');
      const bob = await createUser('bob');
      await ledger(alice.userId, 5, THIS_WEEK);
      await ledger(bob.userId, 3, THIS_WEEK);

      await runAllRollups();

      for (const period of [WEEK, 'all-time']) {
        const res = await board(alice.accessToken, { period }).expect(200);
        expect(res.body.items).toHaveLength(2);
        expect(res.body.items.map((i: Item) => i.rankChange7d)).toEqual([null, null]);
      }
    });

    it('is null until the baseline has been computed for a row (no made-up zero)', async () => {
      const alice = await createUser('alice');
      await ledger(alice.userId, 5, BEFORE_AS_OF);
      await ledger(alice.userId, 5, THIS_WEEK);
      await rollup.rollupPeriod(WEEK); // the live board only; the history pass has not run

      const res = await board(alice.accessToken, { period: WEEK }).expect(200);
      expect(res.body.items[0].rankChange7d).toBeNull();
    });

    it('a settled week compares with the previous week final board, whatever `now` is afterwards', async () => {
      const alice = await createUser('alice');
      const bob = await createUser('bob');
      // W32 (the settled week): bob 9, alice 3. W31 (the week before): alice 6, bob 2.
      await ledger(bob.userId, 9, new Date('2026-08-05T12:00:00.000Z'));
      await ledger(alice.userId, 3, new Date('2026-08-05T13:00:00.000Z'));
      await ledger(alice.userId, 6, new Date('2026-07-29T12:00:00.000Z'));
      await ledger(bob.userId, 2, new Date('2026-07-29T13:00:00.000Z'));

      await rollup.rollupPeriod('2026-W32');
      // Seen from a `now` well after W32 ended; its reference is the end of W32, not the clock.
      await history.updateSevenDayBaseline('2026-W32', new Date('2026-09-30T00:00:00.000Z'));

      const res = await board(alice.accessToken, { period: '2026-W32' }).expect(200);
      const rows = byId(res.body.items);
      // W31 final board: alice 6 (rank 1), bob 2 (rank 2). W32: bob 9 (rank 1), alice 3 (rank 2).
      expect(rows[bob.userId]).toMatchObject({ rank: 1, rankChange7d: 1 - 2 });
      expect(rows[alice.userId]).toMatchObject({ rank: 2, rankChange7d: 2 - 1 });
    });

    it('is stable: running the history pass twice gives the same numbers', async () => {
      const { alice } = await seedStory();
      await runAllRollups();
      const first = (await board(alice.accessToken, { period: WEEK }).expect(200)).body.items;
      await history.runHistoryRollup(NOW);
      const second = (await board(alice.accessToken, { period: WEEK }).expect(200)).body.items;
      expect(second).toEqual(first);
    });

    it('the weekly change still works on club boards, ranked within the club by the club snapshot on the ledger row', async () => {
      const clubA = await createClub('Club A');
      const alice = await createUser('alice', { representedClubId: clubA });
      const bob = await createUser('bob', { representedClubId: clubA });
      const carol = await createUser('carol', { representedClubId: clubA });
      // Earlier (as of AS_OF): bob 10, alice 5 on Club A's board.
      await ledger(bob.userId, 10, BEFORE_AS_OF, { clubId: clubA });
      await ledger(alice.userId, 5, BEFORE_AS_OF, { clubId: clubA });
      // Now on Club A's board: alice 20, bob 8, carol 3.
      await ledger(alice.userId, 20, THIS_WEEK, { clubId: clubA });
      await ledger(bob.userId, 8, THIS_WEEK, { clubId: clubA });
      await ledger(carol.userId, 3, THIS_WEEK, { clubId: clubA });

      await runAllRollups();

      const res = await board(alice.accessToken, { period: WEEK, clubId: clubA }).expect(200);
      const rows = byId(res.body.items);
      expect(rows[alice.userId]).toMatchObject({ rank: 1, rankChange7d: 1 - 2 });
      expect(rows[bob.userId]).toMatchObject({ rank: 2, rankChange7d: 2 - 1 });
      expect(rows[carol.userId]).toMatchObject({ rank: 3, rankChange7d: null });
    });
  });

  describe('club per row', () => {
    it("shows an adult's represented club on the Overall and all-time boards, and null for no club", async () => {
      const clubA = await createClub('Lagos Rovers');
      const alice = await createUser('alice', { representedClubId: clubA });
      const bob = await createUser('bob');
      await ledger(alice.userId, 9, THIS_WEEK);
      await ledger(bob.userId, 4, THIS_WEEK);
      await runAllRollups();

      for (const period of [WEEK, 'all-time']) {
        const res = await board(alice.accessToken, { period }).expect(200);
        const rows = byId(res.body.items);
        expect(rows[alice.userId].club).toEqual({ id: clubA, name: 'Lagos Rovers' });
        expect(rows[bob.userId].club).toBeNull();
      }
    });

    it("is null for a minor on every board, even when the minor represents a club", async () => {
      const clubA = await createClub('Lagos Rovers');
      const adult = await createUser('adult', { representedClubId: clubA });
      const minor = await createUser('minor', { isMinor: true, representedClubId: clubA });
      await ledger(adult.userId, 9, THIS_WEEK, { clubId: clubA });
      await ledger(minor.userId, 6, THIS_WEEK, { clubId: clubA });
      await runAllRollups();

      for (const query of [{ period: WEEK }, { period: 'all-time' }, { period: WEEK, clubId: clubA }] as Record<string, string>[]) {
        const res = await board(adult.accessToken, query).expect(200);
        const rows = byId(res.body.items);
        expect(rows[minor.userId]).toBeDefined(); // still ranked: only the club is withheld
        expect(rows[minor.userId].club).toBeNull();
        expect(rows[adult.userId].club).toEqual({ id: clubA, name: 'Lagos Rovers' });
      }
    });

    it("on a club board the row's club is that club, even if the person has since switched club", async () => {
      const clubA = await createClub('Club A');
      const clubB = await createClub('Club B');
      const alice = await createUser('alice', { representedClubId: clubA });
      const bob = await createUser('bob', { representedClubId: clubA });
      await ledger(alice.userId, 9, THIS_WEEK, { clubId: clubA });
      await ledger(bob.userId, 4, THIS_WEEK, { clubId: clubA });
      await getTestPrismaClient().user.update({ where: { id: bob.userId }, data: { representedClubId: clubB } });
      await runAllRollups();

      const res = await board(alice.accessToken, { period: WEEK, clubId: clubA }).expect(200);
      expect(res.body.items.map((i: Item) => i.club)).toEqual([
        { id: clubA, name: 'Club A' },
        { id: clubA, name: 'Club A' },
      ]);
      // On the Overall board bob shows the club he represents NOW.
      const overall = await board(alice.accessToken, { period: WEEK }).expect(200);
      expect(byId(overall.body.items)[bob.userId].club).toEqual({ id: clubB, name: 'Club B' });
    });

    it('returns nothing about the club beyond its id and name', async () => {
      const clubA = await createClub('Lagos Rovers');
      const alice = await createUser('alice', { representedClubId: clubA });
      await ledger(alice.userId, 9, THIS_WEEK);
      await runAllRollups();

      const res = await board(alice.accessToken, { period: WEEK }).expect(200);
      expect(Object.keys(res.body.items[0].club).sort()).toEqual(['id', 'name']);
      expect(Object.keys(res.body.items[0]).sort()).toEqual(['club', 'points', 'publicName', 'rank', 'rankChange7d', 'userId']);
    });
  });
});
