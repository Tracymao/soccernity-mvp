import { evidenceKeysToDeleteNow, partitionEvidence, removedMediaDeletableNow, suspectedMediaUnderProtection } from './rejected-media-evidence.util';

// backend/suspected-illegal-imagery-path (B-206). The set-aside protection lives in the ONE evidence rule: a file with
// a SuspectedIllegalMedia record is protected while status = 'set_aside' OR now < preserveUntil, whoever the uploader is.

const NOW = new Date('2026-12-15T04:00:00Z');
const DAY = 24 * 3600 * 1000;
const item = (over: Record<string, unknown> = {}) => ({
  mediaId: 'm1',
  uploaderId: 'u1',
  postId: 'p1',
  key: 'private-media/u1/m1.jpg',
  ...over,
});

type Rec = { mediaId: string; status: string; preserveUntil: Date };

function db(records: Rec[] = []) {
  const findMany = jest.fn(async (args: { where: { mediaId: { in: string[] }; OR: Array<Record<string, unknown>> } }) =>
    records.filter(
      (r) =>
        args.where.mediaId.in.includes(r.mediaId) &&
        (r.status === 'set_aside' || r.preserveUntil.getTime() > (args.where.OR[1] as { preserveUntil: { gt: Date } }).preserveUntil.gt.getTime()),
    ),
  );
  return {
    suspectedIllegalMedia: { findMany },
    accountHold: { findMany: jest.fn().mockResolvedValue([]) },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    postMediaDeferredDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe('suspectedMediaUnderProtection', () => {
  it('protects a set_aside record whatever its preserveUntil says', async () => {
    const d = db([{ mediaId: 'm1', status: 'set_aside', preserveUntil: new Date(NOW.getTime() - DAY) }]);
    expect([...(await suspectedMediaUnderProtection(d as never, ['m1'], NOW))]).toEqual(['m1']);
  });

  it('protects a decided record until preserveUntil, and not after it', async () => {
    const live = db([{ mediaId: 'm1', status: 'filed', preserveUntil: new Date(NOW.getTime() + DAY) }]);
    expect((await suspectedMediaUnderProtection(live as never, ['m1'], NOW)).has('m1')).toBe(true);
    const lapsed = db([{ mediaId: 'm1', status: 'not_filed', preserveUntil: new Date(NOW.getTime() - DAY) }]);
    expect((await suspectedMediaUnderProtection(lapsed as never, ['m1'], NOW)).size).toBe(0);
    // exactly now: the period has ended (strictly greater is protected)
    const edge = db([{ mediaId: 'm1', status: 'filed', preserveUntil: NOW }]);
    expect((await suspectedMediaUnderProtection(edge as never, ['m1'], NOW)).size).toBe(0);
  });

  it('asks nothing for an empty list, and only for the ids given', async () => {
    const d = db();
    expect((await suspectedMediaUnderProtection(d as never, [], NOW)).size).toBe(0);
    expect(d.suspectedIllegalMedia.findMany).not.toHaveBeenCalled();
    await suspectedMediaUnderProtection(d as never, ['a', 'a', 'b'], NOW);
    expect(d.suspectedIllegalMedia.findMany).toHaveBeenCalledWith({
      where: { mediaId: { in: ['a', 'b'] }, OR: [{ status: 'set_aside' }, { preserveUntil: { gt: NOW } }] },
      select: { mediaId: true },
    });
  });
});

describe('partitionEvidence with a suspected-illegal record', () => {
  it('holds back the set-aside file and frees the other, with no hold and no open report involved', async () => {
    const d = db([{ mediaId: 'm1', status: 'set_aside', preserveUntil: new Date(NOW.getTime() + DAY) }]);
    const r = await partitionEvidence(d as never, [item(), item({ mediaId: 'm2', key: 'private-media/u1/m2.jpg' })], NOW);
    expect(r.protectedItems.map((i) => i.mediaId)).toEqual(['m1']);
    expect(r.free.map((i) => i.mediaId)).toEqual(['m2']);
  });
});

describe('evidenceKeysToDeleteNow', () => {
  it('returns no key for a set-aside file and records a deferral for it so the daily sweep finishes the job later', async () => {
    const d = db([{ mediaId: 'm1', status: 'set_aside', preserveUntil: new Date(NOW.getTime() + DAY) }]);
    const keys = await evidenceKeysToDeleteNow(d as never, [item()], NOW);
    expect(keys).toEqual([]);
    expect(d.postMediaDeferredDeletion.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns the key once the record is decided and its preservation period has ended', async () => {
    const d = db([{ mediaId: 'm1', status: 'filed', preserveUntil: new Date(NOW.getTime() - DAY) }]);
    expect(await evidenceKeysToDeleteNow(d as never, [item()], NOW)).toEqual(['private-media/u1/m1.jpg']);
  });
});

describe('removedMediaDeletableNow (B-290 closure deletion) honours the same rule', () => {
  it('keeps a set-aside file of a removed post even when the removing report is long closed', async () => {
    const d = {
      ...db([{ mediaId: 'm1', status: 'set_aside', preserveUntil: new Date(NOW.getTime() + DAY) }]),
      report: {
        findMany: jest.fn(async (args: { where: { id?: unknown } }) =>
          args.where.id
            ? [{ id: 'rem', targetId: 'p1', status: 'actioned', appealStatus: null, reviewedAt: new Date('2025-01-01T00:00:00Z'), appealReviewedAt: null }]
            : [],
        ),
      },
    };
    const r = await removedMediaDeletableNow(d as never, [{ ...item(), removingReportId: 'rem' }], NOW, 30);
    expect(r.free).toEqual([]);
    expect(r.waiting.map((i) => i.mediaId)).toEqual(['m1']);
  });
});
