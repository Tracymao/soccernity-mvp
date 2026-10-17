import { PrismaService } from '../../prisma/prisma.service';
import { ContestNotificationFacts } from './contest-notification-facts.service';
import { ContestNotificationSweepService } from './contest-notification-sweep.service';

// Mocked-Prisma unit tests: what the sweep ASKS the database for and WRITES. Whether the unique
// index really makes a re-run a no-op, and whether the eligibility filter really excludes the
// right accounts, is proven against real Postgres in test/contest-notifications.e2e-spec.ts.

type Cycle = {
  id: string;
  startsAt: Date;
  status: string;
  crownedAt: Date | null;
  rounds: {
    id: string;
    weekNumber: number;
    status: string;
    judgedAt: Date | null;
    winners: { userId: string }[];
  }[];
};

function openCycle(over: Partial<Cycle> = {}): Cycle {
  return {
    id: 'cycle-1',
    startsAt: new Date('2026-11-01T08:00:00Z'),
    status: 'active',
    crownedAt: null,
    rounds: [1, 2, 3].map((w) => ({ id: `round-${w}`, weekNumber: w, status: 'open', judgedAt: null, winners: [] })),
    ...over,
  };
}

function build(cycles: Cycle[], users: string[] = ['u1', 'u2', 'u3']) {
  const prisma = {
    contestCycle: { findMany: jest.fn().mockResolvedValue(cycles) },
    user: {
      findMany: jest.fn().mockImplementation(async (args: { take: number; cursor?: { id: string } }) => {
        const start = args.cursor ? users.indexOf(args.cursor.id) + 1 : 0;
        return users.slice(start, start + args.take).map((id) => ({ id }));
      }),
    },
    notification: {
      createMany: jest.fn().mockImplementation(async (args: { data: unknown[] }) => ({ count: args.data.length })),
    },
  } as unknown as PrismaService;
  const facts = { getFinalEntryUserIds: jest.fn().mockResolvedValue(new Set<string>()) };
  const service = new ContestNotificationSweepService(prisma, facts as unknown as ContestNotificationFacts);
  return { prisma, facts, service };
}

const eligibleFilter = {
  accountStatus: 'active',
  verificationStatus: 'verified',
  OR: [{ isMinor: false }, { guardian: { is: { consentStatus: 'confirmed' } } }],
};

describe('ContestNotificationSweepService.runOnce', () => {
  it('does nothing, and queries no users, when no event is due', async () => {
    const { prisma, service } = build([openCycle()]);

    const result = await service.runOnce(new Date('2026-11-03T12:00:00Z')); // between events

    expect(result).toEqual({ eventsDue: 0, created: {} });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('(a) week opens: one row per eligible account with the idempotency key, duplicates skipped', async () => {
    const { prisma, service } = build([openCycle()]);

    const result = await service.runOnce(new Date('2026-11-01T08:00:00Z'));

    expect(result.created).toEqual({ contest_week_opens: 3 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: eligibleFilter }));
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'u1', type: 'contest_week_opens', payloadRefId: 'cycle-1:1', dedupeKey: 'contest_week_opens|cycle-1|1|u1' },
        { userId: 'u2', type: 'contest_week_opens', payloadRefId: 'cycle-1:1', dedupeKey: 'contest_week_opens|cycle-1|1|u2' },
        { userId: 'u3', type: 'contest_week_opens', payloadRefId: 'cycle-1:1', dedupeKey: 'contest_week_opens|cycle-1|1|u3' },
      ],
      skipDuplicates: true,
    });
  });

  it('excludes restricted accounts by filter: a minor needs confirmed consent, and the account must be active and verified', async () => {
    const { prisma, service } = build([openCycle()]);

    await service.runOnce(new Date('2026-11-01T08:00:00Z'));

    const where = (prisma.user.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.accountStatus).toBe('active');
    expect(where.verificationStatus).toBe('verified');
    expect(where.OR).toEqual([{ isMinor: false }, { guardian: { is: { consentStatus: 'confirmed' } } }]);
  });

  it('(b) votes-closing: restricts the audience to accounts with no vote in that round', async () => {
    const { prisma, service } = build([openCycle()]);

    const result = await service.runOnce(new Date('2026-11-07T19:00:00Z'));

    expect(result.created).toEqual({ contest_votes_closing: 3 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [eligibleFilter, { contestVotes: { none: { roundId: 'round-1' } } }] },
      }),
    );
    const row = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data[0];
    expect(row).toMatchObject({ payloadRefId: 'cycle-1:1', dedupeKey: 'contest_votes_closing|cycle-1|1|u1' });
  });

  describe('with all weeks judged', () => {
    const judged = (over: Partial<Cycle> = {}) =>
      openCycle({
        rounds: [
          { id: 'round-1', weekNumber: 1, status: 'judged', judgedAt: new Date('2026-11-07T20:00:00Z'), winners: [{ userId: 'w1' }, { userId: 'w2' }] },
          { id: 'round-2', weekNumber: 2, status: 'judged', judgedAt: new Date('2026-11-14T20:00:00Z'), winners: [{ userId: 'w3' }] },
          { id: 'round-3', weekNumber: 3, status: 'judged', judgedAt: new Date('2026-11-21T20:00:00Z'), winners: [{ userId: 'w4' }, { userId: 'w1' }] },
        ],
        ...over,
      });

    it('(c) week result: everyone', async () => {
      const { prisma, service } = build([judged()]);
      const result = await service.runOnce(new Date('2026-11-07T20:00:00Z'));
      expect(result.created).toEqual({ contest_week_result: 3 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: eligibleFilter }));
    });

    it('(d) finalist qualification: only the distinct finalists, still behind the eligibility filter', async () => {
      const { prisma, service } = build([judged()], ['w1', 'w2', 'w3', 'w4']);
      const result = await service.runOnce(new Date('2026-11-21T20:00:00Z'));
      expect(result.created.contest_finalist).toBe(4);
      const finalistCall = (prisma.user.findMany as jest.Mock).mock.calls.find(
        (c) => c[0].where.AND?.[1]?.id,
      );
      expect(finalistCall[0].where).toEqual({
        AND: [eligibleFilter, { id: { in: ['w1', 'w2', 'w3', 'w4'] } }],
      });
    });

    it('(e) reveal: everyone, at 00:00 on day 25', async () => {
      const { prisma, service } = build([judged()]);
      const result = await service.runOnce(new Date('2026-11-25T00:00:00Z'));
      expect(result.created).toEqual({ contest_reveal: 3 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: eligibleFilter }));
    });

    it('(h) upload reminder: finalists minus those who already uploaded', async () => {
      const { prisma, facts, service } = build([judged()], ['w1', 'w2', 'w3', 'w4']);
      facts.getFinalEntryUserIds.mockResolvedValue(new Set(['w2', 'w4']));

      const result = await service.runOnce(new Date('2026-11-24T12:00:00Z'));

      expect(facts.getFinalEntryUserIds).toHaveBeenCalledWith('cycle-1');
      expect(result.eventsDue).toBeGreaterThanOrEqual(1);
      // (the mock does not apply `where`, so only the filter handed to the database is asserted)
      expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        AND: [eligibleFilter, { id: { in: ['w1', 'w3'] } }],
      });
    });

    it('(h) writes nothing when every finalist has already uploaded', async () => {
      const { prisma, facts, service } = build([judged()]);
      facts.getFinalEntryUserIds.mockResolvedValue(new Set(['w1', 'w2', 'w3', 'w4']));

      const result = await service.runOnce(new Date('2026-11-24T12:00:00Z'));

      expect(result.created).toEqual({ contest_upload_reminder: 0 });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('(f) final result: everyone, once the cycle is crowned and the month has ended', async () => {
      const { prisma, service } = build([judged({ status: 'completed', crownedAt: new Date('2026-11-27T12:00:00Z') })]);
      const result = await service.runOnce(new Date('2026-12-01T00:00:00Z'));
      expect(result.created).toEqual({ contest_final_result: 3 });
      const row = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data[0];
      expect(row.dedupeKey).toBe('contest_final_result|cycle-1|-|u1');
    });
  });

  it('(g) writes nothing for a forfeited week', async () => {
    const forfeited = openCycle({
      rounds: [
        { id: 'round-1', weekNumber: 1, status: 'judged', judgedAt: new Date('2026-11-07T20:00:00Z'), winners: [] },
        { id: 'round-2', weekNumber: 2, status: 'open', judgedAt: null, winners: [] },
        { id: 'round-3', weekNumber: 3, status: 'open', judgedAt: null, winners: [] },
      ],
    });
    const { prisma, service } = build([forfeited]);

    const result = await service.runOnce(new Date('2026-11-07T20:05:00Z'));

    expect(result.eventsDue).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('pages a large audience and keeps writing batches until it is exhausted', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => `user-${String(i).padStart(5, '0')}`);
    const { prisma, service } = build([openCycle()], many);

    const result = await service.runOnce(new Date('2026-11-01T08:00:00Z'));

    expect(result.created.contest_week_opens).toBe(2500);
    expect((prisma.notification.createMany as jest.Mock).mock.calls.map((c) => c[0].data.length)).toEqual([
      1000, 1000, 500,
    ]);
  });

  it('a re-run asks for exactly the same rows again, so the unique index (not the sweep) is the idempotency guard', async () => {
    const { prisma, service } = build([openCycle()]);

    await service.runOnce(new Date('2026-11-01T08:00:00Z'));
    await service.runOnce(new Date('2026-11-01T08:05:00Z'));

    const calls = (prisma.notification.createMany as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toEqual(calls[1][0]);
    expect(calls[1][0].skipDuplicates).toBe(true);
  });

  it('one failing event does not stop the others', async () => {
    const { prisma, service } = build([
      openCycle({ startsAt: new Date('2026-11-01T08:00:00Z') }),
      openCycle({ id: 'cycle-2', startsAt: new Date('2026-11-01T08:00:00Z') }),
    ]);
    (prisma.notification.createMany as jest.Mock)
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockImplementation(async (args: { data: unknown[] }) => ({ count: args.data.length }));

    const result = await service.runOnce(new Date('2026-11-01T08:00:00Z'));

    expect(result.eventsDue).toBe(2);
    expect(result.created).toEqual({ contest_week_opens: 3 });
  });

  it('asks only for cycles that started recently', async () => {
    const { prisma, service } = build([]);
    const now = new Date('2026-11-01T08:00:00Z');

    await service.runOnce(now);

    const where = (prisma.contestCycle.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.startsAt.gte.getTime()).toBe(now.getTime() - 70 * 24 * 60 * 60 * 1000);
  });
});

describe('ContestNotificationSweepService.handleCron', () => {
  it('skips a tick while the previous one is still running', async () => {
    const { prisma, service } = build([]);
    let release!: () => void;
    (prisma.contestCycle.findMany as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );

    const first = service.handleCron();
    await service.handleCron(); // overlapping tick returns immediately
    expect(prisma.contestCycle.findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('never throws out of the scheduler', async () => {
    const { prisma, service } = build([]);
    (prisma.contestCycle.findMany as jest.Mock).mockRejectedValue(new Error('down'));

    await expect(service.handleCron()).resolves.toBeUndefined();
  });
});
