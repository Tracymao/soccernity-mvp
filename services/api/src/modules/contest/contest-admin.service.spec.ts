import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { ContestAdminService } from './contest-admin.service';
import { ContestReadModel } from './contest-read-model.service';
import { CreateCycleDto } from './dto/create-cycle.dto';

// backend/w7-contest (B-091). The admin form's rules on a mocked database: what a contest is created
// with, which dates are derived (never supplied), and the post-launch locking of section 4a. The same
// flow against real Postgres is in test/contest.e2e-spec.ts.

// November 2026 is GMT: week 1 opens 2026-11-01T08:00Z, week 4 opens 2026-11-22T08:00Z.
const BEFORE_LAUNCH = new Date('2026-10-31T12:00:00Z');
const WEEK_1_OPENS = new Date('2026-11-01T08:00:00Z');
const WEEK_2_OPENS = new Date('2026-11-08T08:00:00Z');
const WEEK_4_OPENS = new Date('2026-11-22T08:00:00Z');

const dto = (over: Partial<CreateCycleDto> = {}): CreateCycleDto => ({
  month: '2026-11',
  title: '  November Challenge  ',
  description: ' Show us. ',
  weeks: [
    { weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
    { weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
    { weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
  ],
  finalTask: ' Best goal ',
  minimumTally: 5,
  ...over,
});

function storedCycle(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    title: 'November Challenge',
    description: 'Show us.',
    monthKey: '2026-11',
    minimumTally: 5,
    weeklyPoints1: 500,
    weeklyPoints2: 300,
    weeklyPoints3: 150,
    monthlyPoints1: 2000,
    monthlyPoints2: 1200,
    monthlyPoints3: 600,
    followersExcludedWeek4: false,
    exposureTolerancePercent: 10,
    exposureViewerDailyCap: 3,
    rounds: [
      { id: 'r1', weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
      { id: 'r2', weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
      { id: 'r3', weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
      { id: 'r4', weekNumber: 4, task: 'Best goal', viewWatchLimitSeconds: null },
    ],
    ...over,
  };
}

function build() {
  const prisma = {
    contestCycle: { create: jest.fn().mockResolvedValue({ id: 'c1' }), findUnique: jest.fn(), update: jest.fn() },
    contestRound: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const service = new ContestAdminService(
    prisma as unknown as PrismaService,
    {} as ContestReadModel,
    audit as unknown as AdminActionLogService,
    { now: () => BEFORE_LAUNCH },
  );
  // The detail response is covered by the e2e suite; here it is stubbed.
  jest.spyOn(service, 'getCycleByIdForAdmin').mockResolvedValue({ cycle: { id: 'c1' } } as never);
  return { prisma, audit, service };
}

describe('ContestAdminService.createCycle', () => {
  it('derives every date from the month, stores trimmed text, defaults the spec points, and audits it', async () => {
    const { prisma, audit, service } = build();
    await service.createCycle('admin-1', dto(), BEFORE_LAUNCH);

    const data = prisma.contestCycle.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: 'November Challenge',
      description: 'Show us.',
      monthKey: '2026-11',
      status: 'active',
      startsAt: WEEK_1_OPENS,
      endsAt: new Date('2026-12-01T00:00:00Z'), // 00:00 GMT on 1 December
      minimumTally: 5,
      weeklyPoints1: 500,
      weeklyPoints2: 300,
      weeklyPoints3: 150,
      monthlyPoints1: 2000,
      monthlyPoints2: 1200,
      monthlyPoints3: 600,
      followersExcludedWeek4: false,
      exposureTolerancePercent: 10,
      exposureViewerDailyCap: 3,
    });
    const rounds = data.rounds.create;
    expect(rounds.map((r: { weekNumber: number }) => r.weekNumber)).toEqual([1, 2, 3, 4]);
    // weeks 1-3 close at the vote lock (20:00), week 4 at the reveal; the weeks may be sent in any order
    expect(rounds[0]).toMatchObject({ opensAt: WEEK_1_OPENS, closesAt: new Date('2026-11-07T20:00:00Z'), task: 'Juggling', viewWatchLimitSeconds: 10 });
    expect(rounds[2]).toMatchObject({ task: 'Finishing', viewWatchLimitSeconds: 30 });
    expect(rounds[3]).toMatchObject({ opensAt: WEEK_4_OPENS, closesAt: new Date('2026-11-25T00:00:00Z'), task: 'Best goal', viewWatchLimitSeconds: null });
    expect(audit.record).toHaveBeenCalledWith('admin-1', 'contest_cycle.created', 'contest_cycle', 'c1', expect.not.stringMatching(/\b5\b/));
  });

  it('takes the admin\'s placement points and week-4 settings when given', async () => {
    const { prisma, service } = build();
    await service.createCycle(
      'a',
      dto({
        placementPoints: { weekly: [100, 50, 25], monthly: [400, 200, 100] },
        followersExcludedWeek4: true,
        exposureTolerancePercent: 20,
        exposureViewerDailyCap: 7,
      }),
      BEFORE_LAUNCH,
    );
    expect(prisma.contestCycle.create.mock.calls[0][0].data).toMatchObject({
      weeklyPoints1: 100,
      weeklyPoints3: 25,
      monthlyPoints1: 400,
      monthlyPoints3: 100,
      followersExcludedWeek4: true,
      exposureTolerancePercent: 20,
      exposureViewerDailyCap: 7,
    });
  });

  it('a final task is optional (it can be set until week 4 starts)', async () => {
    const { prisma, service } = build();
    await service.createCycle('a', dto({ finalTask: undefined }), BEFORE_LAUNCH);
    expect(prisma.contestCycle.create.mock.calls[0][0].data.rounds.create[3].task).toBeNull();
  });

  it('refuses a month whose first week has already opened (exactly at 08:00 on day 1 is too late)', async () => {
    const { prisma, service } = build();
    await expect(service.createCycle('a', dto(), new Date(WEEK_1_OPENS.getTime() - 1))).resolves.toBeDefined();
    await expect(service.createCycle('a', dto(), WEEK_1_OPENS)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_month_started' }),
    });
    expect(prisma.contestCycle.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed month and a weeks list that is not exactly 1, 2, 3', async () => {
    const { service } = build();
    await expect(service.createCycle('a', dto({ month: '2026-13' }), BEFORE_LAUNCH)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createCycle('a', dto({ weeks: [dto().weeks[0], dto().weeks[0], dto().weeks[1]] }), BEFORE_LAUNCH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a second contest for the same month is a coded 409 (unique month key)', async () => {
    const { prisma, audit, service } = build();
    prisma.contestCycle.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(service.createCycle('a', dto(), BEFORE_LAUNCH)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_month_taken' }),
    });
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('ContestAdminService.updateCycle: the locking rules of spec section 4a', () => {
  const update = (service: ContestAdminService, body: Record<string, unknown>, now: Date) =>
    service.updateCycle('admin-1', 'c1', body as never, now);

  it('before launch everything but the dates can change, and the change is audited by field NAME only', async () => {
    const { prisma, audit, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await update(
      service,
      { title: 'New', minimumTally: 9, placementPoints: { weekly: [1, 1, 1] }, weeks: [{ weekNumber: 1, task: 'T', viewWatchLimitSeconds: 99 }] },
      BEFORE_LAUNCH,
    );
    expect(prisma.contestCycle.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ title: 'New', minimumTally: 9, weeklyPoints1: 1 }),
    });
    expect(prisma.contestRound.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { task: 'T', viewWatchLimitSeconds: 99 },
    });
    const note = audit.record.mock.calls[0][4] as string;
    expect(note).toContain('minimumTally');
    expect(note).not.toMatch(/\b9\b|\b99\b/); // never the values of the secret settings
  });

  it('from the instant week 1 opens, a changed locked field is a coded 409 listing EVERY locked field', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await expect(
      update(
        service,
        { title: 'Other', minimumTally: 6, placementPoints: { monthly: [1, 2, 3] }, weeks: [{ weekNumber: 1, viewWatchLimitSeconds: 11 }] },
        WEEK_1_OPENS,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'contest_field_locked',
        fields: expect.arrayContaining(['title', 'minimumTally', 'placementPoints.monthly', 'weeks[1].viewWatchLimitSeconds']),
      }),
    });
    expect(prisma.contestCycle.update).not.toHaveBeenCalled();
    expect(prisma.contestRound.update).not.toHaveBeenCalled();
  });

  it('one millisecond before week 1 opens it is still editable', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await expect(update(service, { minimumTally: 6 }, new Date(WEEK_1_OPENS.getTime() - 1))).resolves.toBeDefined();
    expect(prisma.contestCycle.update).toHaveBeenCalled();
  });

  it('posting a locked field UNCHANGED is not an edit (a form can send the whole object back)', async () => {
    const { prisma, audit, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await update(
      service,
      { title: 'November Challenge', minimumTally: 5, placementPoints: { weekly: [500, 300, 150] }, weeks: [{ weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 }] },
      WEEK_1_OPENS,
    );
    expect(prisma.contestCycle.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('after launch the description and the task of weeks that have not started stay editable', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await update(
      service,
      { description: 'Updated', weeks: [{ weekNumber: 2, task: 'Better' }, { weekNumber: 3, viewWatchLimitSeconds: 45 }], finalTask: 'Final!' },
      new Date(WEEK_2_OPENS.getTime() - 1),
    );
    expect(prisma.contestCycle.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { description: 'Updated' } });
    const calls = prisma.contestRound.update.mock.calls.map((c) => [c[0].where.id, c[0].data]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ['r2', { task: 'Better' }],
        ['r3', { viewWatchLimitSeconds: 45 }],
        ['r4', { task: 'Final!' }],
      ]),
    );
  });

  it('a week\'s task and limit lock when THAT week opens; week 2 is refused at 08:00 on day 8', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await expect(update(service, { weeks: [{ weekNumber: 2, task: 'Late change' }] }, WEEK_2_OPENS)).rejects.toMatchObject({
      response: expect.objectContaining({ fields: ['weeks[2].task'] }),
    });
  });

  it('the week-4 settings (followers switch, tolerance, per-viewer cap) are editable through week 3 and lock at week 4 (Decision Log #402)', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await update(
      service,
      { followersExcludedWeek4: true, exposureTolerancePercent: 15, exposureViewerDailyCap: 5 },
      new Date(WEEK_4_OPENS.getTime() - 1),
    );
    expect(prisma.contestCycle.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { followersExcludedWeek4: true, exposureTolerancePercent: 15, exposureViewerDailyCap: 5 },
    });
    await expect(update(service, { exposureViewerDailyCap: 6 }, WEEK_4_OPENS)).rejects.toMatchObject({
      response: expect.objectContaining({ fields: ['exposureViewerDailyCap'] }),
    });
  });

  it('nothing is editable once the month is over', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await expect(update(service, { description: 'Too late' }, new Date('2026-12-01T00:00:00Z'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s an unknown contest and refuses to edit a legacy admin-judged one', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(null);
    await expect(update(service, { description: 'x' }, BEFORE_LAUNCH)).rejects.toBeInstanceOf(NotFoundException);
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle({ monthKey: null }));
    await expect(update(service, { description: 'x' }, BEFORE_LAUNCH)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_legacy_cycle' }),
    });
  });

  it('the same week twice in one request is a 400', async () => {
    const { prisma, service } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(storedCycle());
    await expect(
      update(service, { weeks: [{ weekNumber: 1, task: 'a' }, { weekNumber: 1, task: 'b' }] }, BEFORE_LAUNCH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
