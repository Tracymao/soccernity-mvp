import { AgeReclassificationSweepService } from './age-reclassification-sweep.service';

const NOW = new Date('2026-09-20T12:00:00Z');

interface Row {
  id: string;
  dateOfBirth: Date | null;
  isMinor: boolean;
  isUnder16: boolean;
}

function build(rows: Row[], updateCount = 1) {
  const createMany = jest.fn().mockResolvedValue({ count: 1 });
  const updateMany = jest.fn().mockResolvedValue({ count: updateCount });
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(rows) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ user: { updateMany }, ageReclassificationLog: { createMany } }),
    ),
  };
  const service = new AgeReclassificationSweepService(prisma as never);
  return { service, prisma, updateMany, createMany };
}

describe('AgeReclassificationSweepService', () => {
  it('flips isUnder16 only when the user turned 16 (still a minor), one log row', async () => {
    const { service, updateMany, createMany } = build([
      { id: 'u1', dateOfBirth: new Date('2010-09-19'), isMinor: true, isUnder16: true },
    ]);
    const res = await service.sweepReclassifications(NOW);
    expect(res.reclassifiedUserIds).toEqual(['u1']);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', isMinor: true, isUnder16: true },
      data: { isMinor: true, isUnder16: false },
    });
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ field: 'isUnder16', fromValue: true, toValue: false, ageAtChange: 16 }),
    ]);
  });

  it('flips both fields and logs both when a stale row crosses 18', async () => {
    const { service, createMany } = build([
      { id: 'u2', dateOfBirth: new Date('2008-09-19'), isMinor: true, isUnder16: true },
    ]);
    await service.sweepReclassifications(NOW);
    expect(createMany.mock.calls[0][0].data.map((l: { field: string }) => l.field)).toEqual([
      'isMinor',
      'isUnder16',
    ]);
  });

  it('does nothing for a candidate whose stored flags already match (boundary day before birthday)', async () => {
    const { service, prisma } = build([
      { id: 'u3', dateOfBirth: new Date('2010-09-21'), isMinor: true, isUnder16: true },
    ]);
    const res = await service.sweepReclassifications(NOW);
    expect(res.reclassifiedUserIds).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('corrects the reverse direction (adult stored, actually a child)', async () => {
    const { service, updateMany } = build([
      { id: 'u4', dateOfBirth: new Date('2018-01-01'), isMinor: false, isUnder16: false },
    ]);
    await service.sweepReclassifications(NOW);
    expect(updateMany.mock.calls[0][0].data).toEqual({ isMinor: true, isUnder16: true });
  });

  it('skips a row changed concurrently (guarded update matches 0) and logs nothing', async () => {
    const { service, createMany } = build(
      [{ id: 'u5', dateOfBirth: new Date('2008-09-19'), isMinor: true, isUnder16: false }],
      0,
    );
    const res = await service.sweepReclassifications(NOW);
    expect(res.reclassifiedUserIds).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('one failing row does not abort the rest', async () => {
    const { service, prisma } = build([
      { id: 'bad', dateOfBirth: new Date('2008-09-19'), isMinor: true, isUnder16: false },
      { id: 'good', dateOfBirth: new Date('2008-09-19'), isMinor: true, isUnder16: false },
    ]);
    prisma.$transaction
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
        fn({
          user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          ageReclassificationLog: { createMany: jest.fn() },
        }),
      );
    const res = await service.sweepReclassifications(NOW);
    expect(res.reclassifiedUserIds).toEqual(['good']);
  });
});
