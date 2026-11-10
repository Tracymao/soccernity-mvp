import { removedMediaDeletableNow } from './rejected-media-evidence.util';

// backend/b290-removed-post-media (B-290; Decision Log #484). The ONE function that decides whether the private
// copy kept of a removed post's media may be deleted now: the removing report must be closed, and then the
// existing protection rule applies unchanged (uploader under an active hold, or another unclosed report on the post).

const NOW = new Date('2026-12-15T04:00:00Z');
const item = (over: Record<string, unknown> = {}) => ({
  mediaId: 'm1',
  uploaderId: 'u1',
  postId: 'p1',
  key: 'private-media/u1/m1.jpg',
  removingReportId: 'rem',
  ...over,
});

const report = (over: Record<string, unknown> = {}) => ({
  id: 'rem',
  targetId: 'p1',
  status: 'actioned',
  appealStatus: null,
  reviewedAt: new Date('2026-11-01T00:00:00Z'), // + 30 days = 2026-12-01, before NOW
  appealReviewedAt: null,
  ...over,
});

function db(opts: { reports?: Record<string, unknown>[]; held?: boolean } = {}) {
  const reports = opts.reports ?? [report()];
  return {
    report: {
      findMany: jest.fn(async (args: { where: { id?: { in: string[] }; targetType?: string } }) =>
        args.where.id ? reports.filter((r) => args.where.id!.in.includes(r.id as string)) : reports.filter(() => args.where.targetType === 'post'),
      ),
    },
    accountHold: {
      findMany: jest.fn().mockResolvedValue(opts.held ? [{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }] : []),
    },
  };
}

describe('removedMediaDeletableNow', () => {
  it('is free once the removing report is closed (appeal window lapsed) and nothing else protects it', async () => {
    const r = await removedMediaDeletableNow(db() as never, [item()], NOW, 30);
    expect(r.free.map((i) => i.mediaId)).toEqual(['m1']);
    expect(r.waiting).toEqual([]);
  });

  it('waits while the removing report is inside its appeal window, at the first lapsed instant it is free', async () => {
    const inWindow = db({ reports: [report({ reviewedAt: new Date('2026-12-10T00:00:00Z') })] });
    expect((await removedMediaDeletableNow(inWindow as never, [item()], NOW, 30)).waiting).toHaveLength(1);
    const exactly = db({ reports: [report({ reviewedAt: new Date(NOW.getTime() - 30 * 24 * 3600 * 1000) })] });
    expect((await removedMediaDeletableNow(exactly as never, [item()], NOW, 30)).free).toHaveLength(1);
  });

  it('waits while an appeal is pending, however old the report is', async () => {
    const pending = db({ reports: [report({ appealStatus: 'pending', reviewedAt: new Date('2025-01-01T00:00:00Z') })] });
    expect((await removedMediaDeletableNow(pending as never, [item()], NOW, 30)).waiting).toHaveLength(1);
  });

  it('is free the moment an appeal is upheld (closure = the appeal decision)', async () => {
    const upheld = db({ reports: [report({ appealStatus: 'upheld', appealReviewedAt: new Date('2026-12-14T00:00:00Z'), reviewedAt: new Date('2026-12-12T00:00:00Z') })] });
    expect((await removedMediaDeletableNow(upheld as never, [item()], NOW, 30)).free).toHaveLength(1);
  });

  it('waits when the report is open again (an overturned appeal reopens it), and when the report cannot be found (fail safe)', async () => {
    const reopened = db({ reports: [report({ status: 'open', reviewedAt: null, appealStatus: 'overturned' })] });
    expect((await removedMediaDeletableNow(reopened as never, [item()], NOW, 30)).waiting).toHaveLength(1);
    const missing = db({ reports: [] });
    expect((await removedMediaDeletableNow(missing as never, [item()], NOW, 30)).waiting).toHaveLength(1);
  });

  it('an uploader under an active admin hold keeps the file even though the removing report is closed', async () => {
    const r = await removedMediaDeletableNow(db({ held: true }) as never, [item()], NOW, 30);
    expect(r.free).toEqual([]);
    expect(r.waiting.map((i) => i.mediaId)).toEqual(['m1']);
  });

  it('another report on the same post that is still open also keeps it', async () => {
    const other = { id: 'other', targetId: 'p1', status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null };
    const r = await removedMediaDeletableNow(db({ reports: [report(), other] }) as never, [item()], NOW, 30);
    expect(r.free).toEqual([]);
    expect(r.waiting).toHaveLength(1);
  });

  it('splits a mixed batch item by item, and an empty batch makes no query', async () => {
    const d = db({ reports: [report(), report({ id: 'young', reviewedAt: new Date('2026-12-14T00:00:00Z'), targetId: 'p2' })] });
    const r = await removedMediaDeletableNow(
      d as never,
      [item(), item({ mediaId: 'm2', postId: 'p2', key: 'private-media/u1/m2.jpg', removingReportId: 'young' })],
      NOW,
      30,
    );
    expect(r.free.map((i) => i.mediaId)).toEqual(['m1']);
    expect(r.waiting.map((i) => i.mediaId)).toEqual(['m2']);

    const empty = db();
    expect(await removedMediaDeletableNow(empty as never, [], NOW, 30)).toEqual({ free: [], waiting: [] });
    expect(empty.report.findMany).not.toHaveBeenCalled();
  });
});
