import { Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MatchKickoffService } from './match-kickoff.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function build() {
  const tx = {
    matchSubscription: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    matchSubscription: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: tx.matchSubscription.updateMany,
    },
    matchData: { findMany: jest.fn().mockResolvedValue([]) },
    notification: tx.notification,
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const sportsService = {
    getMatchById: jest.fn().mockResolvedValue({}),
    refreshDateForKickoffWatch: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MatchKickoffService(prisma as never, sportsService as never);
  return { service, prisma, tx, sportsService };
}

const NOW = new Date('2026-10-03T19:00:00.000Z');
const PAST = new Date('2026-10-03T18:00:00.000Z');
const FUTURE = new Date('2026-10-03T21:00:00.000Z');

describe('MatchKickoffService.subscribe', () => {
  it('validates the match via getMatchById before creating the subscription', async () => {
    const { service, prisma, sportsService } = build();
    await service.subscribe('user-1', 'ext-1');
    expect(sportsService.getMatchById).toHaveBeenCalledWith('ext-1');
    expect(prisma.matchSubscription.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', externalRef: 'ext-1' },
    });
  });

  it('does not create a subscription for an unknown match', async () => {
    const { service, prisma, sportsService } = build();
    sportsService.getMatchById.mockRejectedValue(new NotFoundException('Match not found'));
    await expect(service.subscribe('user-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.matchSubscription.create).not.toHaveBeenCalled();
  });

  it('treats a duplicate subscription (P2002) as success', async () => {
    const { service, prisma } = build();
    prisma.matchSubscription.create.mockRejectedValue(p2002());
    await expect(service.subscribe('user-1', 'ext-1')).resolves.toBeUndefined();
  });

  it('rethrows any non-duplicate database error', async () => {
    const { service, prisma } = build();
    prisma.matchSubscription.create.mockRejectedValue(new Error('connection lost'));
    await expect(service.subscribe('user-1', 'ext-1')).rejects.toThrow('connection lost');
  });
});

describe('MatchKickoffService.unsubscribe', () => {
  it('deletes only the caller\'s own subscription and is a no-op when none exists', async () => {
    const { service, prisma } = build();
    await service.unsubscribe('user-1', 'ext-1');
    expect(prisma.matchSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', externalRef: 'ext-1' },
    });
  });
});

describe('MatchKickoffService.runKickoffSweep', () => {
  it('does nothing and makes no refresh when no subscription is pending', async () => {
    const { service, prisma, sportsService } = build();
    const result = await service.runKickoffSweep(NOW);
    expect(result).toEqual({ notified: 0 });
    expect(prisma.matchData.findMany).not.toHaveBeenCalled();
    expect(sportsService.refreshDateForKickoffWatch).not.toHaveBeenCalled();
  });

  it('refreshes each distinct kickoff date once, before deciding what is due', async () => {
    const { service, prisma, sportsService } = build();
    prisma.matchSubscription.findMany.mockResolvedValueOnce([
      { externalRef: 'a' },
      { externalRef: 'b' },
    ]);
    prisma.matchData.findMany
      .mockResolvedValueOnce([{ kickoffTime: FUTURE }, { kickoffTime: FUTURE }])
      .mockResolvedValueOnce([]);
    await service.runKickoffSweep(NOW);
    expect(sportsService.refreshDateForKickoffWatch).toHaveBeenCalledTimes(1);
    expect(sportsService.refreshDateForKickoffWatch).toHaveBeenCalledWith('2026-10-03');
    expect(sportsService.refreshDateForKickoffWatch.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.matchData.findMany.mock.invocationCallOrder[1],
    );
  });

  it('fires a due match, claiming it inside the same transaction as the notification', async () => {
    const { service, prisma, tx } = build();
    prisma.matchSubscription.findMany
      .mockResolvedValueOnce([{ externalRef: 'a' }])
      .mockResolvedValueOnce([{ id: 'sub-1', userId: 'user-1', externalRef: 'a' }]);
    prisma.matchData.findMany
      .mockResolvedValueOnce([{ kickoffTime: PAST }])
      .mockResolvedValueOnce([{ externalRef: 'a', kickoffTime: PAST, status: 'scheduled' }]);

    const result = await service.runKickoffSweep(NOW);

    expect(result).toEqual({ notified: 1 });
    expect(tx.matchSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', notifiedAt: null },
      data: { notifiedAt: NOW },
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'match_kickoff', payloadRefId: 'a' },
    });
  });

  it('does not fire a match that has not reached kickoff yet', async () => {
    const { service, prisma, tx } = build();
    prisma.matchSubscription.findMany
      .mockResolvedValueOnce([{ externalRef: 'a' }])
      .mockResolvedValueOnce([]);
    prisma.matchData.findMany
      .mockResolvedValueOnce([{ kickoffTime: FUTURE }])
      .mockResolvedValueOnce([{ externalRef: 'a', kickoffTime: FUTURE, status: 'scheduled' }]);
    const result = await service.runKickoffSweep(NOW);
    expect(result).toEqual({ notified: 0 });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it.each(['postponed', 'cancelled'])('never fires a %s match, leaving its subscription pending', async (status) => {
    const { service, prisma, tx } = build();
    prisma.matchSubscription.findMany.mockResolvedValueOnce([{ externalRef: 'a' }]);
    prisma.matchData.findMany
      .mockResolvedValueOnce([{ kickoffTime: PAST }])
      .mockResolvedValueOnce([{ externalRef: 'a', kickoffTime: PAST, status }]);
    const result = await service.runKickoffSweep(NOW);
    expect(result).toEqual({ notified: 0 });
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(prisma.matchSubscription.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not notify when another instance already claimed the subscription', async () => {
    const { service, prisma, tx } = build();
    prisma.matchSubscription.findMany
      .mockResolvedValueOnce([{ externalRef: 'a' }])
      .mockResolvedValueOnce([{ id: 'sub-1', userId: 'user-1', externalRef: 'a' }]);
    prisma.matchData.findMany
      .mockResolvedValueOnce([{ kickoffTime: PAST }])
      .mockResolvedValueOnce([{ externalRef: 'a', kickoffTime: PAST, status: 'live' }]);
    tx.matchSubscription.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.runKickoffSweep(NOW);

    expect(result).toEqual({ notified: 0 });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('keeps going when one subscription fails, so one bad row cannot block the rest', async () => {
    const { service, prisma, tx } = build();
    prisma.matchSubscription.findMany
      .mockResolvedValueOnce([{ externalRef: 'a' }])
      .mockResolvedValueOnce([
        { id: 'bad', userId: 'user-1', externalRef: 'a' },
        { id: 'good', userId: 'user-2', externalRef: 'a' },
      ]);
    prisma.matchData.findMany
      .mockResolvedValueOnce([{ kickoffTime: PAST }])
      .mockResolvedValueOnce([{ externalRef: 'a', kickoffTime: PAST, status: 'scheduled' }]);
    tx.notification.create.mockRejectedValueOnce(new Error('insert failed')).mockResolvedValueOnce({});

    const result = await service.runKickoffSweep(NOW);

    expect(result).toEqual({ notified: 1 });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });
});

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
