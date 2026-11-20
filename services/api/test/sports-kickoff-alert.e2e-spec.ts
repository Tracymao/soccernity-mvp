import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { SportsDataClient } from '../src/sports-data/sports-data-client';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-070 (Decision Log #472): the per-caller `kickoffAlert` flag on the three public match reads and the
// coded 409 on PUT for a match that has already started. Real Postgres, real tokens, the real guard.
// The vendor client is stubbed to "nothing upstream" so the reads serve the seeded rows.
describe('Sports kickoff-alert flag and match_already_started (B-070)', () => {
  let app: INestApplication;
  const TODAY = new Date().toISOString().slice(0, 10);
  const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SportsDataClient)
      .useValue({
        getMatchById: async () => {
          throw new Error('no upstream in this spec');
        },
        getMatches: async () => ({ items: [], totalCount: 0 }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const server = () => app.getHttpServer();

  async function seedMatch(externalRef: string, overrides: Partial<Record<string, unknown>> = {}) {
    return getTestPrismaClient().matchData.create({
      data: {
        externalRef,
        competition: 'Premier League',
        teams: ['Chelsea', 'Liverpool'],
        status: 'scheduled',
        statusDetail: 'Not started',
        kickoffTime: FUTURE,
        leagueId: '133',
        leagueName: 'Premier League',
        season: '2026',
        homeTeamId: 'home-1',
        homeTeamName: 'Chelsea',
        awayTeamId: 'away-1',
        awayTeamName: 'Liverpool',
        ...overrides,
      },
    });
  }

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const user = await getTestPrismaClient().user.create({
      data: {
        email: `e2e-ka-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E KA ${label}`,
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const flags = (items: Array<{ id: string; kickoffAlert: boolean }>) => Object.fromEntries(items.map((i) => [i.id, i.kickoffAlert]));

  // Three reads x (subscribed, not subscribed, logged out, invalid token), plus caller isolation.
  describe('the flag on GET /sports/fixtures, /live-scores and /matches/:id', () => {
    async function seedScenario() {
      // m-future: scheduled and still to come (today's fixtures list needs a kickoff today, so the
      // fixtures read uses its own date below). m-live: live now.
      await seedMatch('m-sched', { kickoffTime: new Date(`${TODAY}T23:59:00.000Z`) });
      await seedMatch('m-other', { kickoffTime: new Date(`${TODAY}T23:58:00.000Z`) });
      await seedMatch('m-live', { status: 'live', statusDetail: 'Second half', kickoffTime: new Date(`${TODAY}T00:01:00.000Z`) });
      const a = await createUser('a');
      const b = await createUser('b');
      const prisma = getTestPrismaClient();
      await prisma.matchSubscription.create({ data: { userId: a.userId, externalRef: 'm-sched' } });
      await prisma.matchSubscription.create({ data: { userId: a.userId, externalRef: 'm-live' } });
      await prisma.matchSubscription.create({ data: { userId: b.userId, externalRef: 'm-other' } });
      return { a, b };
    }

    it('fixtures: true for the caller\'s subscriptions only, per caller, false when logged out or token invalid', async () => {
      const { a, b } = await seedScenario();
      const url = `/sports/fixtures?date=${TODAY}`;

      const forA = await request(server()).get(url).set(auth(a.accessToken)).expect(200);
      expect(flags(forA.body.items)).toEqual({ 'm-live': true, 'm-sched': true, 'm-other': false });

      const forB = await request(server()).get(url).set(auth(b.accessToken)).expect(200);
      expect(flags(forB.body.items)).toEqual({ 'm-live': false, 'm-sched': false, 'm-other': true });

      const anon = await request(server()).get(url).expect(200);
      expect(Object.values(flags(anon.body.items))).toEqual([false, false, false]);

      const badToken = await request(server()).get(url).set(auth('not-a-real-token')).expect(200);
      expect(Object.values(flags(badToken.body.items))).toEqual([false, false, false]);
    });

    it('live-scores: true for a subscribed live match, false for a caller with none and when logged out', async () => {
      const { a, b } = await seedScenario();

      const forA = await request(server()).get('/sports/live-scores').set(auth(a.accessToken)).expect(200);
      expect(flags(forA.body.items)).toEqual({ 'm-live': true });

      const forB = await request(server()).get('/sports/live-scores').set(auth(b.accessToken)).expect(200);
      expect(flags(forB.body.items)).toEqual({ 'm-live': false });

      const anon = await request(server()).get('/sports/live-scores').expect(200);
      expect(flags(anon.body.items)).toEqual({ 'm-live': false });
    });

    it('matches/:id: true when subscribed, false when not, false when logged out', async () => {
      const { a, b } = await seedScenario();

      expect((await request(server()).get('/sports/matches/m-sched').set(auth(a.accessToken)).expect(200)).body.kickoffAlert).toBe(true);
      expect((await request(server()).get('/sports/matches/m-sched').set(auth(b.accessToken)).expect(200)).body.kickoffAlert).toBe(false);
      expect((await request(server()).get('/sports/matches/m-sched').expect(200)).body.kickoffAlert).toBe(false);
    });

    it('stays public: a logged-out read still succeeds with the same match data, and the three responses vary on Authorization', async () => {
      await seedScenario();
      for (const url of [`/sports/fixtures?date=${TODAY}`, '/sports/live-scores', '/sports/matches/m-sched']) {
        const res = await request(server()).get(url).expect(200);
        expect(String(res.headers.vary)).toMatch(/Authorization/i);
      }
    });

    it('two callers in a row never see each other\'s flag (no shared response caching)', async () => {
      const { a, b } = await seedScenario();
      const url = `/sports/fixtures?date=${TODAY}`;
      const first = await request(server()).get(url).set(auth(a.accessToken)).expect(200);
      const second = await request(server()).get(url).set(auth(b.accessToken)).expect(200);
      const third = await request(server()).get(url).expect(200);
      expect(flags(first.body.items)['m-sched']).toBe(true);
      expect(flags(second.body.items)['m-sched']).toBe(false);
      expect(flags(third.body.items)['m-sched']).toBe(false);
    });

    it('the flag follows PUT and DELETE end to end', async () => {
      await seedMatch('m-toggle');
      const { accessToken } = await createUser('toggle');
      const read = async () => (await request(server()).get('/sports/matches/m-toggle').set(auth(accessToken)).expect(200)).body.kickoffAlert;

      expect(await read()).toBe(false);
      await request(server()).put('/sports/matches/m-toggle/subscription').set(auth(accessToken)).expect(200, { subscribed: true });
      expect(await read()).toBe(true);
      await request(server()).delete('/sports/matches/m-toggle/subscription').set(auth(accessToken)).expect(200, { subscribed: false });
      expect(await read()).toBe(false);
    });
  });

  describe('PUT .../subscription for a match that has already started', () => {
    it.each([
      ['live', new Date(Date.now() - 30 * 60 * 1000)],
      ['finished', new Date(Date.now() - 5 * 60 * 60 * 1000)],
      ['scheduled', new Date(Date.now() - 60 * 1000)], // kickoff passed, vendor status not updated yet
    ])('a %s match is a coded 409 match_already_started and writes no row', async (status, kickoffTime) => {
      await seedMatch('m-started', { status, kickoffTime });
      const { userId, accessToken } = await createUser('started');

      const res = await request(server()).put('/sports/matches/m-started/subscription').set(auth(accessToken)).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, code: 'match_already_started' });
      expect(await getTestPrismaClient().matchSubscription.count({ where: { userId } })).toBe(0);
    });

    it('an upcoming match is still 200 and no token is still 401 (unknown-match 404 is covered by match-kickoff.e2e-spec.ts)', async () => {
      await seedMatch('m-upcoming');
      const { accessToken } = await createUser('ok');
      await request(server()).put('/sports/matches/m-upcoming/subscription').set(auth(accessToken)).expect(200, { subscribed: true });
      await request(server()).put('/sports/matches/m-upcoming/subscription').expect(401);
    });

    it('a postponed match whose original kickoff has passed can still be subscribed to', async () => {
      await seedMatch('m-postponed', { status: 'postponed', kickoffTime: new Date(Date.now() - 24 * 60 * 60 * 1000) });
      const { accessToken } = await createUser('pp');
      await request(server()).put('/sports/matches/m-postponed/subscription').set(auth(accessToken)).expect(200);
    });

    it('DELETE is always allowed, including for a match that has started and for one never subscribed to', async () => {
      await seedMatch('m-del', { status: 'finished', kickoffTime: new Date(Date.now() - 5 * 60 * 60 * 1000) });
      const { userId, accessToken } = await createUser('del');
      await getTestPrismaClient().matchSubscription.create({ data: { userId, externalRef: 'm-del' } });

      await request(server()).delete('/sports/matches/m-del/subscription').set(auth(accessToken)).expect(200, { subscribed: false });
      expect(await getTestPrismaClient().matchSubscription.count({ where: { userId } })).toBe(0);
      await request(server()).delete('/sports/matches/m-del/subscription').set(auth(accessToken)).expect(200, { subscribed: false });
    });
  });
});
