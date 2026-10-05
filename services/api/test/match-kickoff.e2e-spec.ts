import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { SportsDataClient, SportsDataNotFoundError } from '../src/sports-data/sports-data-client';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { MatchKickoffService } from '../src/modules/sports/match-kickoff.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// sprint-4/match-kickoff-alerts (Decision Log #336 item 2). Proves what a mocked unit test cannot,
// against real Postgres: the MatchSubscription @@unique and RESTRICT FK, the at-most-once claim that
// stops a second sweep from re-firing, a postponed match staying pending, the match_kickoff
// Notification round-tripping into GET /notifications with resolved match data, and account
// anonymization removing the subscription rows.
//
// No Highlightly credentials exist in this environment, so the sweep's refresh fails and falls back
// to the seeded rows. That is the graceful-degradation path under test: a vendor outage must never
// stop kickoff alerts for rows already in Postgres.
describe('Match kickoff alerts e2e (sprint-4/match-kickoff-alerts)', () => {
  let app: INestApplication;
  let kickoff: MatchKickoffService;

  beforeAll(async () => {
    // The vendor reports a genuinely unknown match id as not-found, which getMatchById maps to 404.
    // Unconfigured, HighlightlyClient throws a generic error that propagates as 500 instead, so this
    // spec pins the vendor's answer to the real not-found case to test the real contract.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SportsDataClient)
      .useValue({
        getMatchById: async (externalRef: string) => {
          throw new SportsDataNotFoundError(`no match ${externalRef}`);
        },
        getMatches: async () => ({ items: [], totalCount: 0 }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    kickoff = app.get(MatchKickoffService);
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

  // Past kickoff by default, so a sweep at NOW fires it. Status 'scheduled' is the realistic
  // pre-kickoff state the refresh would have written.
  async function seedMatch(externalRef: string, overrides: Partial<Record<string, unknown>> = {}) {
    return getTestPrismaClient().matchData.create({
      data: {
        externalRef,
        competition: 'Premier League',
        teams: ['Chelsea', 'Liverpool'],
        status: 'scheduled',
        statusDetail: 'Not started',
        kickoffTime: new Date('2026-10-03T19:00:00.000Z'),
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
        email: `e2e-mk-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E MK ${label}`,
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  // A restricted-pending minor. JwtAuthGuard-only, so subscribing must still succeed (founder
  // decision: no GuardianConsentGuard on this feature).
  async function createRestrictedMinor(label: string): Promise<{ userId: string; accessToken: string }> {
    const user = await getTestPrismaClient().user.create({
      data: {
        email: `e2e-mk-minor-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused',
        displayName: `E2E MK Minor ${label}`,
        dateOfBirth: seedDob('2014-01-01'),
        isMinor: true,
        guardian: {
          create: {
            name: 'Guardian Name',
            email: `guardian-mk-${label}-${Date.now()}@example.com`,
            relationship: 'Parent',
            consentStatus: 'pending',
            consentToken: `tok-mk-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
          },
        },
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  describe('PUT / DELETE /sports/matches/:id/subscription', () => {
    it('subscribes a real user to a real match and writes one MatchSubscription row', async () => {
      await seedMatch('ext-sub-1', { kickoffTime: new Date('2099-01-01T15:00:00.000Z') });
      const { userId, accessToken } = await createUser('sub');

      await request(server())
        .put('/sports/matches/ext-sub-1/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200, { subscribed: true });

      const rows = await getTestPrismaClient().matchSubscription.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].externalRef).toBe('ext-sub-1');
      expect(rows[0].notifiedAt).toBeNull();
    });

    it('is idempotent and never resets notifiedAt on a re-subscribe', async () => {
      await seedMatch('ext-idem', { kickoffTime: new Date('2099-01-01T15:00:00.000Z') });
      const { userId, accessToken } = await createUser('idem');
      const prisma = getTestPrismaClient();
      await request(server())
        .put('/sports/matches/ext-idem/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const firedAt = new Date('2026-10-03T19:00:01.000Z');
      await prisma.matchSubscription.updateMany({ where: { userId }, data: { notifiedAt: firedAt } });

      await request(server())
        .put('/sports/matches/ext-idem/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200, { subscribed: true });

      const rows = await prisma.matchSubscription.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].notifiedAt?.toISOString()).toBe(firedAt.toISOString());
    });

    it('404s for an unknown match and creates no subscription row', async () => {
      const { userId, accessToken } = await createUser('nomatch');
      await request(server())
        .put('/sports/matches/does-not-exist/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(await getTestPrismaClient().matchSubscription.count({ where: { userId } })).toBe(0);
    });

    it('rejects an unauthenticated subscribe with 401', async () => {
      await seedMatch('ext-anon');
      await request(server()).put('/sports/matches/ext-anon/subscription').expect(401);
    });

    it('lets a restricted-pending minor subscribe (JwtAuthGuard only, no consent guard)', async () => {
      await seedMatch('ext-minor', { kickoffTime: new Date('2099-01-01T15:00:00.000Z') });
      const { accessToken } = await createRestrictedMinor('sub');
      await request(server())
        .put('/sports/matches/ext-minor/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200, { subscribed: true });
    });

    it('DELETE removes the caller\'s subscription and a repeat DELETE is a no-op 200', async () => {
      await seedMatch('ext-del', { kickoffTime: new Date('2099-01-01T15:00:00.000Z') });
      const { userId, accessToken } = await createUser('del');
      await request(server())
        .put('/sports/matches/ext-del/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(server())
        .delete('/sports/matches/ext-del/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200, { subscribed: false });
      await request(server())
        .delete('/sports/matches/ext-del/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200, { subscribed: false });

      expect(await getTestPrismaClient().matchSubscription.count({ where: { userId } })).toBe(0);
    });
  });

  describe('runKickoffSweep', () => {
    it('fires a due match exactly once across repeated sweeps (at-most-once claim)', async () => {
      await seedMatch('ext-fire');
      const { userId, accessToken } = await createUser('fire');
      await request(server())
        .put('/sports/matches/ext-fire/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const now = new Date('2026-10-03T19:05:00.000Z');
      expect(await kickoff.runKickoffSweep(now)).toEqual({ notified: 1 });
      expect(await kickoff.runKickoffSweep(now)).toEqual({ notified: 0 });
      expect(await kickoff.runKickoffSweep(now)).toEqual({ notified: 0 });

      const notifications = await getTestPrismaClient().notification.findMany({
        where: { userId, type: 'match_kickoff' },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].payloadRefId).toBe('ext-fire');

      const sub = await getTestPrismaClient().matchSubscription.findFirstOrThrow({ where: { userId } });
      expect(sub.notifiedAt).not.toBeNull();
    });

    it('does not fire a match whose kickoff is still in the future', async () => {
      await seedMatch('ext-future', { kickoffTime: new Date('2026-10-03T21:00:00.000Z') });
      const { userId, accessToken } = await createUser('future');
      await request(server())
        .put('/sports/matches/ext-future/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(await kickoff.runKickoffSweep(new Date('2026-10-03T19:05:00.000Z'))).toEqual({ notified: 0 });
      expect(await getTestPrismaClient().notification.count({ where: { userId } })).toBe(0);
    });

    it('keeps a postponed match pending, then fires it once the vendor reschedules it', async () => {
      const prisma = getTestPrismaClient();
      await seedMatch('ext-postponed', { status: 'postponed' });
      const { userId, accessToken } = await createUser('postponed');
      await request(server())
        .put('/sports/matches/ext-postponed/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const now = new Date('2026-10-03T19:05:00.000Z');
      expect(await kickoff.runKickoffSweep(now)).toEqual({ notified: 0 });
      expect((await prisma.matchSubscription.findFirstOrThrow({ where: { userId } })).notifiedAt).toBeNull();

      await prisma.matchData.update({
        where: { externalRef: 'ext-postponed' },
        data: { status: 'scheduled', kickoffTime: new Date('2026-10-03T18:59:00.000Z') },
      });
      expect(await kickoff.runKickoffSweep(now)).toEqual({ notified: 1 });
    });

    it('resolves the match_kickoff notification to the match summary through GET /notifications', async () => {
      await seedMatch('ext-inbox');
      const { accessToken } = await createUser('inbox');
      await request(server())
        .put('/sports/matches/ext-inbox/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await kickoff.runKickoffSweep(new Date('2026-10-03T19:05:00.000Z'));

      const res = await request(server())
        .get('/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const item = res.body.items.find((i: { type: string }) => i.type === 'match_kickoff');
      expect(item.payloadRefId).toBe('ext-inbox');
      expect(item.data.match).toMatchObject({
        externalRef: 'ext-inbox',
        competition: 'Premier League',
        homeTeamName: 'Chelsea',
        awayTeamName: 'Liverpool',
        status: 'scheduled',
      });
    });
  });

  describe('account anonymization', () => {
    it('removes a user\'s MatchSubscription rows, leaving other users\' subscriptions intact', async () => {
      const prisma = getTestPrismaClient();
      await seedMatch('ext-anon-a', { kickoffTime: new Date('2099-01-01T15:00:00.000Z') });
      const leaver = await createUser('leaver');
      const stayer = await createUser('stayer');
      for (const u of [leaver, stayer]) {
        await request(server())
          .put('/sports/matches/ext-anon-a/subscription')
          .set('Authorization', `Bearer ${u.accessToken}`)
          .expect(200);
      }

      await app.get(AccountDeletionSweepService).anonymizeUser(leaver.userId, false);

      expect(await prisma.matchSubscription.count({ where: { userId: leaver.userId } })).toBe(0);
      expect(await prisma.matchSubscription.count({ where: { userId: stayer.userId } })).toBe(1);
      expect(await prisma.user.findUnique({ where: { id: leaver.userId } })).not.toBeNull();
    });
  });
});
