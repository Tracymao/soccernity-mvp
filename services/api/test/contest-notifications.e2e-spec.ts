import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { ContestNotificationFacts } from '../src/modules/contest-notifications/contest-notification-facts.service';
import { ContestNotificationSweepService } from '../src/modules/contest-notifications/contest-notification-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w3c-contest-notifications (B-122, Decision Log #404 item 16) against REAL Postgres:
// the eligibility filter, the "has not voted" relation filter, the dedupeKey unique index that
// makes a re-run a no-op, and the Europe/London calendar edges. The sweep is driven by calling
// runOnce(now) directly with an explicit instant -- the same "call the method the @Cron job
// calls" precedent as account-deletion-sweep.e2e-spec.ts -- so no clock is faked.
//
// November 2026 is GMT (wall time = UTC). October 2026 is BST until the clocks go back at 02:00
// BST on Sun 25 Oct.
describe('Contest notifications e2e: scheduled in-app fan-out', () => {
  let app: INestApplication;
  let sweep: ContestNotificationSweepService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    sweep = app.get(ContestNotificationSweepService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);

  interface SeedUser {
    verified?: boolean;
    isMinor?: boolean;
    consent?: 'pending' | 'confirmed' | 'declined';
    accountStatus?: string;
  }

  async function createUser(label: string, over: SeedUser = {}): Promise<string> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-cn-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `CN ${label}`,
        username: `cn_${label}_${rand()}`.slice(0, 28),
        verificationStatus: over.verified === false ? 'unverified' : 'verified',
        dateOfBirth: seedDob(over.isMinor ? '2012-01-01' : '1998-07-04'),
        isMinor: over.isMinor ?? false,
        accountStatus: over.accountStatus ?? 'active',
      },
    });
    if (over.isMinor) {
      await prisma.guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian',
          email: `guardian-${rand()}@example.com`,
          relationship: 'parent',
          consentStatus: over.consent ?? 'pending',
          consentToken: randomUUID(),
          consentTokenExpiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    return user.id;
  }

  interface RoundSeed {
    status?: 'open' | 'judged';
    judgedAt?: Date;
    winners?: { userId: string; position: number }[];
  }

  // A cycle whose month is taken from startsAt. Winners need an entry (a Post + ContestEntry).
  async function createCycle(
    startsAt: string,
    rounds: [RoundSeed?, RoundSeed?, RoundSeed?] = [],
    over: { status?: string; crownedAt?: Date; standings?: { userId: string; position: number }[] } = {},
  ) {
    const prisma = getTestPrismaClient();
    const start = new Date(startsAt);
    const cycle = await prisma.contestCycle.create({
      data: {
        title: 'November Challenge',
        status: over.status ?? 'active',
        startsAt: start,
        endsAt: new Date(start.getTime() + 31 * 86_400_000),
        crownedAt: over.crownedAt ?? null,
      },
    });
    const roundIds: string[] = [];
    for (let w = 1; w <= 3; w++) {
      const seed = rounds[w - 1] ?? {};
      const round = await prisma.contestRound.create({
        data: {
          cycleId: cycle.id,
          weekNumber: w,
          status: seed.status ?? 'open',
          opensAt: start,
          closesAt: new Date(start.getTime() + 7 * 86_400_000),
          judgedAt: seed.judgedAt ?? null,
        },
      });
      roundIds.push(round.id);
      for (const win of seed.winners ?? []) {
        const post = await prisma.post.create({ data: { authorId: win.userId, contentText: 'entry', mediaUrls: [] } });
        const entry = await prisma.contestEntry.create({
          data: { cycleId: cycle.id, roundId: round.id, postId: post.id, userId: win.userId },
        });
        await prisma.contestRoundWinner.create({
          data: { roundId: round.id, entryId: entry.id, userId: win.userId, position: win.position },
        });
      }
    }
    for (const s of over.standings ?? []) {
      await prisma.contestStanding.create({ data: { cycleId: cycle.id, userId: s.userId, position: s.position } });
    }
    return { cycleId: cycle.id, roundIds };
  }

  const listFor = async (userId: string, type?: string) =>
    getTestPrismaClient().notification.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'asc' },
    });

  const countOf = (type: string) => getTestPrismaClient().notification.count({ where: { type } });

  const NOV_1_0800 = new Date('2026-11-01T08:00:00Z');

  describe('(a) week opens', () => {
    it('reaches every eligible account and nobody restricted, unverified, deactivated or declined', async () => {
      const adult = await createUser('adult');
      const confirmedMinor = await createUser('confirmed', { isMinor: true, consent: 'confirmed' });
      const pendingMinor = await createUser('pending', { isMinor: true, consent: 'pending' });
      const declinedMinor = await createUser('declined', { isMinor: true, consent: 'declined' });
      const unverified = await createUser('unverified', { verified: false });
      const deactivated = await createUser('deactivated', { accountStatus: 'deactivated' });
      const suspended = await createUser('suspended', { accountStatus: 'suspended' });
      await createCycle('2026-11-01T08:00:00Z');

      const result = await sweep.runOnce(NOV_1_0800);

      expect(result.created).toEqual({ contest_week_opens: 2 });
      expect(await listFor(adult, 'contest_week_opens')).toHaveLength(1);
      expect(await listFor(confirmedMinor, 'contest_week_opens')).toHaveLength(1);
      for (const excluded of [pendingMinor, declinedMinor, unverified, deactivated, suspended]) {
        expect(await listFor(excluded)).toHaveLength(0);
      }
    });

    it('writes the payload convention "<cycleId>:<week>" and leaves the row unread', async () => {
      const adult = await createUser('adult');
      const { cycleId } = await createCycle('2026-11-01T08:00:00Z');

      await sweep.runOnce(NOV_1_0800);

      const [row] = await listFor(adult, 'contest_week_opens');
      expect(row.payloadRefId).toBe(`${cycleId}:1`);
      expect(row.read).toBe(false);
      expect(row.dedupeKey).toBe(`contest_week_opens|${cycleId}|1|${adult}`);
    });

    it('is idempotent: re-runs, even several ticks later, never duplicate', async () => {
      await createUser('a');
      await createUser('b');
      await createCycle('2026-11-01T08:00:00Z');

      const first = await sweep.runOnce(NOV_1_0800);
      const second = await sweep.runOnce(NOV_1_0800);
      const later = await sweep.runOnce(new Date('2026-11-01T08:05:00Z'));

      expect(first.created.contest_week_opens).toBe(2);
      expect(second.created.contest_week_opens).toBe(0);
      expect(later.created.contest_week_opens).toBe(0);
      expect(await countOf('contest_week_opens')).toBe(2);
    });

    it('does not resurrect a read notification on a re-run (the read-state is the user\'s)', async () => {
      const adult = await createUser('adult');
      await createCycle('2026-11-01T08:00:00Z');
      await sweep.runOnce(NOV_1_0800);
      await getTestPrismaClient().notification.updateMany({ where: { userId: adult }, data: { read: true } });

      await sweep.runOnce(new Date('2026-11-01T08:10:00Z'));

      const rows = await listFor(adult);
      expect(rows).toHaveLength(1);
      expect(rows[0].read).toBe(true);
    });

    it('two overlapping sweeps (e.g. two instances) still write each row once', async () => {
      for (const l of ['a', 'b', 'c']) await createUser(l);
      await createCycle('2026-11-01T08:00:00Z');

      await Promise.all([sweep.runOnce(NOV_1_0800), sweep.runOnce(NOV_1_0800)]);

      expect(await countOf('contest_week_opens')).toBe(3);
    });

    it('does not fire before 08:00 and does not fire a stale one the next day', async () => {
      await createUser('a');
      await createCycle('2026-11-01T08:00:00Z');

      expect((await sweep.runOnce(new Date('2026-11-01T07:59:59Z'))).eventsDue).toBe(0);
      expect((await sweep.runOnce(new Date('2026-11-02T09:00:00Z'))).eventsDue).toBe(0);
      expect(await countOf('contest_week_opens')).toBe(0);
    });
  });

  describe('(b) votes-closing reminder', () => {
    it('goes only to eligible accounts that have not voted in that round', async () => {
      const voter = await createUser('voter');
      const nonVoter = await createUser('nonvoter');
      const pendingMinor = await createUser('pending', { isMinor: true, consent: 'pending' });
      const entrant = await createUser('entrant');
      const { cycleId, roundIds } = await createCycle('2026-11-01T08:00:00Z');
      const prisma = getTestPrismaClient();
      const post = await prisma.post.create({ data: { authorId: entrant, contentText: 'x', mediaUrls: [] } });
      const entry = await prisma.contestEntry.create({
        data: { cycleId, roundId: roundIds[0], postId: post.id, userId: entrant },
      });
      await prisma.contestVote.create({ data: { roundId: roundIds[0], voterId: voter, entryId: entry.id } });

      const result = await sweep.runOnce(new Date('2026-11-07T19:00:00Z'));

      expect(result.created).toEqual({ contest_votes_closing: 2 }); // nonVoter + the entrant (who has not voted)
      expect(await listFor(nonVoter, 'contest_votes_closing')).toHaveLength(1);
      expect(await listFor(entrant, 'contest_votes_closing')).toHaveLength(1);
      expect(await listFor(voter, 'contest_votes_closing')).toHaveLength(0);
      expect(await listFor(pendingMinor, 'contest_votes_closing')).toHaveLength(0);
    });

    it('a vote in ANOTHER round does not exempt the account from this week\'s reminder', async () => {
      const voterWeek2 = await createUser('voter2');
      const entrant = await createUser('entrant');
      const { cycleId, roundIds } = await createCycle('2026-11-01T08:00:00Z');
      const prisma = getTestPrismaClient();
      const post = await prisma.post.create({ data: { authorId: entrant, contentText: 'x', mediaUrls: [] } });
      const entry = await prisma.contestEntry.create({
        data: { cycleId, roundId: roundIds[1], postId: post.id, userId: entrant },
      });
      await prisma.contestVote.create({ data: { roundId: roundIds[1], voterId: voterWeek2, entryId: entry.id } });

      await sweep.runOnce(new Date('2026-11-07T19:00:00Z')); // week 1

      expect(await listFor(voterWeek2, 'contest_votes_closing')).toHaveLength(1);
    });

    it('is idempotent across the whole reminder hour', async () => {
      await createUser('a');
      await createCycle('2026-11-01T08:00:00Z');

      await sweep.runOnce(new Date('2026-11-07T19:00:00Z'));
      await sweep.runOnce(new Date('2026-11-07T19:30:00Z'));
      await sweep.runOnce(new Date('2026-11-07T19:59:59Z'));

      expect(await countOf('contest_votes_closing')).toBe(1);
      expect((await sweep.runOnce(new Date('2026-11-07T20:00:00Z'))).eventsDue).toBe(0);
    });

    it('sends the week-2 reminder as its own row (the key includes the week)', async () => {
      await createUser('a');
      await createCycle('2026-11-01T08:00:00Z');

      await sweep.runOnce(new Date('2026-11-07T19:00:00Z'));
      await sweep.runOnce(new Date('2026-11-14T19:00:00Z'));

      expect(await countOf('contest_votes_closing')).toBe(2);
    });
  });

  describe('(c) week result and the personal winner notification', () => {
    it('announces a judged week to everyone, once, and a forfeited week to nobody', async () => {
      const w1 = await createUser('w1');
      const w2 = await createUser('w2');
      const w3 = await createUser('w3');
      const fan = await createUser('fan');
      await createCycle('2026-11-01T08:00:00Z', [
        {
          status: 'judged',
          judgedAt: new Date('2026-11-07T20:00:00Z'),
          winners: [
            { userId: w1, position: 1 },
            { userId: w2, position: 2 },
            { userId: w3, position: 3 },
          ],
        },
        { status: 'judged', judgedAt: new Date('2026-11-14T20:00:00Z'), winners: [] }, // forfeited
      ]);

      await sweep.runOnce(new Date('2026-11-07T20:00:00Z'));
      await sweep.runOnce(new Date('2026-11-07T20:05:00Z'));
      await sweep.runOnce(new Date('2026-11-14T20:00:00Z'));

      expect(await listFor(fan, 'contest_week_result')).toHaveLength(1);
      expect(await listFor(w1, 'contest_week_result')).toHaveLength(1);
      expect(await countOf('contest_week_result')).toBe(4); // week 1 only; the forfeited week 2 sent none
    });

    it('winners get exactly one personal contest_win (from judging) alongside the week result', async () => {
      const winner = await createUser('winner');
      const other = await createUser('other');
      const prisma = getTestPrismaClient();
      const { cycleId, roundIds } = await createCycle('2026-11-01T08:00:00Z');
      const post = await prisma.post.create({ data: { authorId: winner, contentText: 'x', mediaUrls: [] } });
      const voter = await createUser('voter');
      // A new-model cycle (monthKey set) whose week 1 is in its voting phase with one qualified entry
      // and one vote; the real lock job (B-091) then decides the week and writes the personal notice.
      await prisma.contestCycle.update({ where: { id: cycleId }, data: { monthKey: '2026-11', minimumTally: 1 } });
      await prisma.contestRound.update({ where: { id: roundIds[0] }, data: { status: 'voting' } });
      const entry = await prisma.contestEntry.create({
        data: { cycleId, roundId: roundIds[0], postId: post.id, userId: winner, qualified: true, phase1Tally: 1, phase1Rank: 1 },
      });
      await prisma.contestVote.create({ data: { roundId: roundIds[0], voterId: voter, entryId: entry.id } });
      const at = new Date('2026-11-07T20:00:00Z');
      await app.get(ContestLifecycleService).runOnce(at);

      await sweep.runOnce(at);
      await sweep.runOnce(at);

      expect(await listFor(winner, 'contest_win')).toHaveLength(1);
      expect(await listFor(other, 'contest_win')).toHaveLength(0);
      expect(await listFor(winner, 'contest_week_result')).toHaveLength(1);
      expect(await listFor(other, 'contest_week_result')).toHaveLength(1);
    });
  });

  describe('(d) finalist qualification', () => {
    it('goes to each distinct eligible finalist only, once', async () => {
      const f1 = await createUser('f1');
      const f2 = await createUser('f2');
      const restrictedFinalist = await createUser('rf', { isMinor: true, consent: 'pending' });
      const fan = await createUser('fan');
      await createCycle('2026-11-01T08:00:00Z', [
        { status: 'judged', judgedAt: new Date('2026-11-07T20:00:00Z'), winners: [{ userId: f1, position: 1 }] },
        { status: 'judged', judgedAt: new Date('2026-11-14T20:00:00Z'), winners: [{ userId: f2, position: 1 }, { userId: f1, position: 2 }] },
        { status: 'judged', judgedAt: new Date('2026-11-21T20:00:00Z'), winners: [{ userId: restrictedFinalist, position: 1 }] },
      ]);

      await sweep.runOnce(new Date('2026-11-21T20:00:00Z'));
      await sweep.runOnce(new Date('2026-11-21T20:10:00Z'));

      expect(await listFor(f1, 'contest_finalist')).toHaveLength(1); // won twice, notified once
      expect(await listFor(f2, 'contest_finalist')).toHaveLength(1);
      expect(await listFor(fan, 'contest_finalist')).toHaveLength(0);
      expect(await listFor(restrictedFinalist, 'contest_finalist')).toHaveLength(0);
    });
  });

  describe('(e) reveal and the daylight-saving edges', () => {
    const finalists = async () => {
      const f = await createUser('f');
      const fan = await createUser('fan');
      return { f, fan };
    };
    const judgedRounds = (month: string, f: string): [RoundSeed, RoundSeed, RoundSeed] => [
      { status: 'judged', judgedAt: new Date(`${month}-07T20:00:00Z`), winners: [{ userId: f, position: 1 }] },
      { status: 'judged', judgedAt: new Date(`${month}-14T20:00:00Z`), winners: [{ userId: f, position: 1 }] },
      { status: 'judged', judgedAt: new Date(`${month}-21T20:00:00Z`), winners: [{ userId: f, position: 1 }] },
    ];

    it('reveals to everyone at 00:00 on day 25 (GMT month)', async () => {
      const { f, fan } = await finalists();
      await createCycle('2026-11-01T08:00:00Z', judgedRounds('2026-11', f));

      await sweep.runOnce(new Date('2026-11-24T23:59:59Z'));
      expect(await countOf('contest_reveal')).toBe(0);
      await sweep.runOnce(new Date('2026-11-25T00:00:00Z'));

      expect(await listFor(fan, 'contest_reveal')).toHaveLength(1);
      expect(await listFor(f, 'contest_reveal')).toHaveLength(1);
    });

    it('reveals at 00:00 BST = 23:00 UTC on 25 Oct 2026, the day the clocks go back', async () => {
      const { f } = await finalists();
      await createCycle('2026-10-01T07:00:00Z', [
        { status: 'judged', judgedAt: new Date('2026-10-07T19:00:00Z'), winners: [{ userId: f, position: 1 }] },
        { status: 'judged', judgedAt: new Date('2026-10-14T19:00:00Z'), winners: [{ userId: f, position: 1 }] },
        { status: 'judged', judgedAt: new Date('2026-10-21T19:00:00Z'), winners: [{ userId: f, position: 1 }] },
      ]);

      await sweep.runOnce(new Date('2026-10-24T22:59:59Z'));
      expect(await countOf('contest_reveal')).toBe(0);
      await sweep.runOnce(new Date('2026-10-24T23:00:00Z'));
      expect(await countOf('contest_reveal')).toBe(2);
    });

    it('reveals at 00:00 GMT on 25 Mar 2029, the day the clocks go forward', async () => {
      const { f } = await finalists();
      await createCycle('2029-03-01T08:00:00Z', judgedRounds('2029-03', f));

      await sweep.runOnce(new Date('2029-03-24T23:59:59Z'));
      expect(await countOf('contest_reveal')).toBe(0);
      await sweep.runOnce(new Date('2029-03-25T00:00:00Z'));
      expect(await countOf('contest_reveal')).toBe(2);
    });

    it('fires the October votes-closing reminder at 19:00 BST = 18:00 UTC', async () => {
      await createUser('a');
      await createCycle('2026-10-01T07:00:00Z');

      await sweep.runOnce(new Date('2026-10-07T17:59:59Z'));
      expect(await countOf('contest_votes_closing')).toBe(0);
      await sweep.runOnce(new Date('2026-10-07T18:00:00Z'));
      expect(await countOf('contest_votes_closing')).toBe(1);
    });

    it('sends no reveal when there are no finalists (no final)', async () => {
      await createUser('a');
      await createCycle('2026-11-01T08:00:00Z');

      await sweep.runOnce(new Date('2026-11-25T00:00:00Z'));

      expect(await countOf('contest_reveal')).toBe(0);
    });
  });

  describe('(h) finalist upload reminder', () => {
    it('reminds eligible finalists who have not uploaded, and skips those who have', async () => {
      const uploaded = await createUser('uploaded');
      const notYet = await createUser('notyet');
      const fan = await createUser('fan');
      await createCycle('2026-11-01T08:00:00Z', [
        { status: 'judged', judgedAt: new Date('2026-11-07T20:00:00Z'), winners: [{ userId: uploaded, position: 1 }] },
        { status: 'judged', judgedAt: new Date('2026-11-14T20:00:00Z'), winners: [{ userId: notYet, position: 1 }] },
        { status: 'judged', judgedAt: new Date('2026-11-21T20:00:00Z'), winners: [] },
      ]);
      // No final-entry storage exists until B-091: drive the seam directly.
      jest.spyOn(app.get(ContestNotificationFacts), 'getFinalEntryUserIds').mockResolvedValue(new Set([uploaded]));

      await sweep.runOnce(new Date('2026-11-24T11:59:59Z'));
      expect(await countOf('contest_upload_reminder')).toBe(0);
      await sweep.runOnce(new Date('2026-11-24T12:00:00Z'));
      await sweep.runOnce(new Date('2026-11-24T12:05:00Z'));

      expect(await listFor(notYet, 'contest_upload_reminder')).toHaveLength(1);
      expect(await listFor(uploaded, 'contest_upload_reminder')).toHaveLength(0);
      expect(await listFor(fan, 'contest_upload_reminder')).toHaveLength(0);
      // After the 23:59:59 deadline the reminder is no longer due.
      expect((await sweep.runOnce(new Date('2026-11-24T23:59:59Z'))).created.contest_upload_reminder ?? 0).toBe(0);
    });

    it('with no final-entry storage yet, every finalist is reminded', async () => {
      const f = await createUser('f');
      await createCycle('2026-11-01T08:00:00Z', [
        { status: 'judged', judgedAt: new Date('2026-11-07T20:00:00Z'), winners: [{ userId: f, position: 1 }] },
        { status: 'judged', judgedAt: new Date('2026-11-14T20:00:00Z'), winners: [] },
        { status: 'judged', judgedAt: new Date('2026-11-21T20:00:00Z'), winners: [] },
      ]);

      await sweep.runOnce(new Date('2026-11-24T12:00:00Z'));

      expect(await listFor(f, 'contest_upload_reminder')).toHaveLength(1);
    });
  });

  describe('(f) final result', () => {
    it('goes to everyone at the month end, and a read shows winners vs "No winner this month"', async () => {
      const winner = await createUser('winner');
      const fan = await createUser('fan');
      const crownedAt = new Date('2026-11-27T12:00:00Z');
      const withWinner = await createCycle('2026-11-01T08:00:00Z', [], {
        status: 'completed',
        crownedAt,
        standings: [{ userId: winner, position: 1 }],
      });

      await sweep.runOnce(new Date('2026-11-30T23:59:59Z'));
      expect(await countOf('contest_final_result')).toBe(0);
      await sweep.runOnce(new Date('2026-12-01T00:00:00Z'));
      await sweep.runOnce(new Date('2026-12-01T00:05:00Z'));

      expect(await listFor(fan, 'contest_final_result')).toHaveLength(1);
      expect(await listFor(winner, 'contest_final_result')).toHaveLength(1);

      // Resolved through the real GET /notifications: outcome derived from the standings.
      const token = (await app.get(TokenService).issueTokenPair(fan, 'player')).accessToken.token;
      const res = await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${token}`).expect(200);
      const item = res.body.items.find((i: { type: string }) => i.type === 'contest_final_result');
      expect(item.data).toEqual({
        cycle: { id: withWinner.cycleId, title: 'November Challenge' },
        week: null,
        outcome: 'winners',
      });
    });

    it('reads as "No winner this month" for a completed cycle with no standings', async () => {
      const fan = await createUser('fan');
      const { cycleId } = await createCycle('2026-11-01T08:00:00Z', [], {
        status: 'completed',
        crownedAt: new Date('2026-11-27T12:00:00Z'),
      });
      await sweep.runOnce(new Date('2026-12-01T00:00:00Z'));

      const token = (await app.get(TokenService).issueTokenPair(fan, 'player')).accessToken.token;
      const res = await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.items[0].data).toEqual({
        cycle: { id: cycleId, title: 'November Challenge' },
        week: null,
        outcome: 'no_winner',
      });
    });
  });

  describe('read side', () => {
    it('GET /notifications resolves a week-level event to its cycle and week, and the unread count includes it', async () => {
      const adult = await createUser('adult');
      const { cycleId } = await createCycle('2026-11-01T08:00:00Z');
      await sweep.runOnce(NOV_1_0800);

      const token = (await app.get(TokenService).issueTokenPair(adult, 'player')).accessToken.token;
      const res = await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.unreadCount).toBe(1);
      expect(res.body.items[0]).toMatchObject({
        type: 'contest_week_opens',
        read: false,
        data: { cycle: { id: cycleId, title: 'November Challenge' }, week: 1 },
      });
      expect(res.body.items[0]).not.toHaveProperty('dedupeKey');
    });
  });
});
