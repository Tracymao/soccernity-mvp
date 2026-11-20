import { ConflictException, NotFoundException } from '@nestjs/common';
import { MATCH_ALREADY_STARTED_CODE, MatchKickoffService } from './match-kickoff.service';

// B-070 (Decision Log #472): PUT .../subscription for a match that has already started is a coded 409.
const NOW = new Date('2026-10-03T19:00:00.000Z');

function build(match: Record<string, unknown>) {
  const prisma = { matchSubscription: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
  const sportsService = { getMatchById: jest.fn().mockResolvedValue(match) };
  return { service: new MatchKickoffService(prisma as never, sportsService as never), prisma, sportsService };
}

describe('MatchKickoffService.subscribe - already started', () => {
  it.each([
    ['live', '2026-10-03T18:00:00.000Z'],
    ['finished', '2026-10-03T16:00:00.000Z'],
    ['scheduled', '2026-10-03T18:59:59.000Z'], // vendor lag: kickoff passed, status not updated yet
    ['scheduled', '2026-10-03T19:00:00.000Z'], // exactly now: the sweep would fire it on the next tick
  ])('refuses a %s match (kickoff %s) with a coded 409 and creates nothing', async (status, kickoffTime) => {
    const { service, prisma } = build({ status, kickoffTime });
    const err = await service.subscribe('user-1', 'ext-1', NOW).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ statusCode: 409, code: MATCH_ALREADY_STARTED_CODE });
    expect(prisma.matchSubscription.create).not.toHaveBeenCalled();
  });

  it('still allows a scheduled match that kicks off later', async () => {
    const { service, prisma } = build({ status: 'scheduled', kickoffTime: '2026-10-03T19:00:01.000Z' });
    await service.subscribe('user-1', 'ext-1', NOW);
    expect(prisma.matchSubscription.create).toHaveBeenCalledWith({ data: { userId: 'user-1', externalRef: 'ext-1' } });
  });

  it.each(['postponed', 'cancelled'])('still allows a %s match whose original kickoff has passed (the sweep will not fire it)', async (status) => {
    const { service, prisma } = build({ status, kickoffTime: '2026-10-03T10:00:00.000Z' });
    await service.subscribe('user-1', 'ext-1', NOW);
    expect(prisma.matchSubscription.create).toHaveBeenCalled();
  });

  it('an unknown match is still a 404, not a 409', async () => {
    const { service, sportsService } = build({});
    sportsService.getMatchById.mockRejectedValue(new NotFoundException('Match not found'));
    await expect(service.subscribe('user-1', 'nope', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unsubscribing never looks at the match, so it is allowed after kickoff', async () => {
    const { service, prisma, sportsService } = build({ status: 'finished', kickoffTime: '2020-01-01T00:00:00.000Z' });
    await service.unsubscribe('user-1', 'ext-1');
    expect(sportsService.getMatchById).not.toHaveBeenCalled();
    expect(prisma.matchSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', externalRef: 'ext-1' } });
  });
});
