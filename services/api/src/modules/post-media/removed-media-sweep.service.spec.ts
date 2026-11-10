import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { PostMediaConfig } from './post-media.config';
import { RejectedMediaSweepService } from './rejected-media-sweep.service';

// backend/b290-removed-post-media (B-290; Decision Log #484). Step 4 of the daily sweep: the private copy kept of a
// removed post's media is deleted when the removing report closes. The real-database behaviour (and the whole
// remove / overturn / closure flow over HTTP) is in test/removed-post-media.e2e-spec.ts; this covers the loop:
// paging past waiting rows, the cap, a failed delete, the row update, and the no-storage case.

const NOW = new Date('2026-12-15T04:00:00Z');
const CLOSED = { id: 'closed', status: 'reviewed', appealStatus: null, reviewedAt: new Date('2026-01-01T00:00:00Z'), appealReviewedAt: null, targetId: 'p' };
const OPEN = { id: 'open', status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null, targetId: 'p' };

interface Row {
  id: string;
  sequence: number;
  uploaderId: string;
  postId: string;
  privateKey: string | null;
  deletedByModerationAt: Date | null;
  post: { removedByReportId: string };
}

function build(env: Record<string, string> = {}, withStorage = true) {
  const rows: Row[] = [];
  const held = new Set<string>();
  const failDeleteFor = new Set<string>();
  const deletedKeys: string[] = [];
  const reportsById: Record<string, Record<string, unknown>> = { closed: CLOSED, open: OPEN };
  const prisma = {
    postMedia: {
      findMany: jest.fn(async (args: { where: { sequence: { gt: number } }; take: number }) =>
        rows
          .filter((r) => r.privateKey && r.sequence > args.where.sequence.gt)
          .sort((a, b) => a.sequence - b.sequence)
          .slice(0, args.take),
      ),
      updateMany: jest.fn(async (args: { where: { id: string; privateKey: string }; data: { privateKey: null; deletedByModerationAt: Date } }) => {
        const r = rows.find((x) => x.id === args.where.id && x.privateKey === args.where.privateKey);
        if (!r) return { count: 0 };
        r.privateKey = args.data.privateKey;
        r.deletedByModerationAt = args.data.deletedByModerationAt;
        return { count: 1 };
      }),
    },
    report: {
      findMany: jest.fn(async (args: { where: { id?: { in: string[] }; targetType?: string } }) =>
        args.where.id ? args.where.id.in.map((id) => reportsById[id]).filter(Boolean) : [], // no OTHER report on the post
      ),
    },
    accountHold: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        held.has(where.userId) ? [{ id: 'h', type: 'legal_hold', reportId: null, expiresAt: null }] : [],
      ),
    },
  };
  const store = {
    delete: jest.fn(async (key: string) => {
      if (failDeleteFor.has(key)) throw new Error('delete failed');
      deletedKeys.push(key);
    }),
  };
  const service = new RejectedMediaSweepService(
    prisma as unknown as PrismaService,
    new PostMediaConfig(new ConfigService(env)),
    (withStorage ? store : undefined) as unknown as DirectUploadStorageService,
    { now: () => NOW },
  );
  const add = (n: number, over: Partial<Row> = {}) => {
    const row: Row = {
      id: `m${n}`,
      sequence: n,
      uploaderId: 'u1',
      postId: 'p',
      privateKey: `private-media/u1/m${n}.jpg`,
      deletedByModerationAt: null,
      post: { removedByReportId: 'closed' },
      ...over,
    };
    rows.push(row);
    return row;
  };
  return { service, prisma, store, rows, add, held, failDeleteFor, deletedKeys };
}

describe('RejectedMediaSweepService.confirmModerationRemovals', () => {
  it('deletes the private object of a file whose removing report is closed, then records it on the row', async () => {
    const t = build();
    const r = t.add(1);
    expect(await t.service.confirmModerationRemovals(NOW)).toEqual({ deleted: 1, waiting: 0, failed: 0, capped: false });
    expect(t.deletedKeys).toEqual(['private-media/u1/m1.jpg']);
    expect(r).toMatchObject({ privateKey: null, deletedByModerationAt: NOW });
    // a second run finds nothing to do
    expect(await t.service.confirmModerationRemovals(NOW)).toEqual({ deleted: 0, waiting: 0, failed: 0, capped: false });
  });

  it('leaves a file whose removing report is still open, counts it as waiting, and touches nothing', async () => {
    const t = build();
    const r = t.add(1, { post: { removedByReportId: 'open' } });
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 0, waiting: 1 });
    expect(t.store.delete).not.toHaveBeenCalled();
    expect(r).toMatchObject({ privateKey: 'private-media/u1/m1.jpg', deletedByModerationAt: null });
  });

  it('keeps the file of an uploader under an active admin hold, and deletes it on a later run once the hold ends', async () => {
    const t = build();
    t.add(1);
    t.held.add('u1');
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 0, waiting: 1 });
    t.held.clear();
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 1, waiting: 0 });
  });

  it('a failed delete leaves the row untouched and is retried on the next run', async () => {
    const t = build();
    const r = t.add(1);
    t.failDeleteFor.add('private-media/u1/m1.jpg');
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 0, failed: 1 });
    expect(r.privateKey).toBe('private-media/u1/m1.jpg');
    t.failDeleteFor.clear();
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 1, failed: 0 });
    expect(r.deletedByModerationAt).toEqual(NOW);
  });

  it('is capped like the other steps (deletions plus failures per run) and the rest is done on the next run', async () => {
    const t = build({ POST_MEDIA_STRAY_SWEEP_MAX_DELETES: '2' });
    for (let i = 1; i <= 5; i += 1) t.add(i);
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 2, capped: true });
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 2, capped: true });
    expect(await t.service.confirmModerationRemovals(NOW)).toMatchObject({ deleted: 1, capped: false });
    expect(t.rows.every((r) => r.privateKey === null)).toBe(true);
  });

  it('waiting rows do not starve the ones behind them (it pages past them)', async () => {
    const t = build({ POST_MEDIA_STRAY_SWEEP_MAX_DELETES: '1' });
    for (let i = 1; i <= 450; i += 1) t.add(i, { post: { removedByReportId: 'open' } }); // two full pages of waiting rows
    t.add(451);
    const r = await t.service.confirmModerationRemovals(NOW);
    expect(r).toMatchObject({ deleted: 1, waiting: 450 });
    expect(t.deletedKeys).toEqual(['private-media/u1/m451.jpg']);
  });

  it('does nothing and does not throw when no object store is wired', async () => {
    const t = build({}, false);
    t.add(1);
    expect(await t.service.confirmModerationRemovals(NOW)).toEqual({ deleted: 0, waiting: 0, failed: 0, capped: false });
    expect(t.prisma.postMedia.findMany).not.toHaveBeenCalled();
  });

  it('asks only for files that are withdrawn, whose post is removed by a report, with a private copy and not yet deleted', async () => {
    const t = build();
    await t.service.confirmModerationRemovals(NOW);
    expect(t.prisma.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sequence: { gt: 0 },
          deletedByModerationAt: null,
          privateKey: { not: null },
          publishedAt: null,
          post: { is: { removedByModerationAt: { not: null }, removedByReportId: { not: null } } },
        },
      }),
    );
  });
});
