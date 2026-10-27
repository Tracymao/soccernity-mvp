import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { PostMediaConfig } from '../post-media/post-media.config';
import { PostMediaDecisionService } from '../post-media/post-media-decision.service';
import { AdminMediaReviewService } from './admin-media-review.service';
import { encodeMediaReviewCursor } from './media-review.cursor';

const NOW = new Date('2026-11-05T10:00:00Z');

const dbRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  sequence: 10,
  kind: 'image',
  contentType: 'image/jpeg',
  byteSize: 1234,
  durationSeconds: null,
  status: 'pending',
  decisionSource: null,
  decidedAt: null,
  rejectionReason: null,
  checkLabels: ['Suggestive'],
  publicKey: 'post-media/u1/m1.jpg',
  postId: 'p1',
  confirmedAt: new Date('2026-11-05T09:00:00Z'),
  createdAt: new Date('2026-11-05T08:59:00Z'),
  reviewEnteredAt: new Date('2026-11-05T09:05:00Z'),
  reviewEntrySource: 'auto_check',
  reportCount: 0,
  hiddenPendingReview: false,
  uploader: { id: 'u1', username: 'ada_l', displayName: 'Ada Lovelace', email: 'must-not-leak@example.com' },
  _count: { reports: 0 },
  ...over,
});

function build() {
  const prisma = {
    postMedia: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    postMediaReport: { groupBy: jest.fn().mockResolvedValue([]) },
    adminActionLog: { count: jest.fn().mockResolvedValue(0) },
  };
  const storage = { createDownloadUrl: jest.fn(async (key: string, ttl: number) => `https://view.test/${key}?ttl=${ttl}`) };
  const decisions = { approve: jest.fn(), reject: jest.fn() };
  const actionLog = { record: jest.fn().mockResolvedValue({}) };
  const service = new AdminMediaReviewService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    decisions as unknown as PostMediaDecisionService,
    actionLog as unknown as AdminActionLogService,
    new PostMediaConfig(new ConfigService({})),
    { now: () => NOW },
  );
  return { service, prisma, storage, decisions, actionLog };
}

describe('AdminMediaReviewService.list', () => {
  it('defaults to the "waiting for a decision" queue, newest first, 20 per page', async () => {
    const { service, prisma } = build();
    await service.list({});
    const args = prisma.postMedia.findMany.mock.calls[0][0];
    expect(args.take).toBe(21);
    expect(args.orderBy).toEqual({ sequence: 'desc' });
    expect(args.where.AND).toEqual([
      { uploadState: 'ready' },
      { OR: [{ status: 'pending', reviewEnteredAt: { not: null } }, { reportCount: { gt: 0 } }] },
    ]);
  });

  it('applies source, status, order and cursor filters', async () => {
    const { service, prisma } = build();
    await service.list({ order: 'oldest', source: 'user_report', status: 'rejected', cursor: encodeMediaReviewCursor(7), limit: 5 });
    const args = prisma.postMedia.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ sequence: 'asc' });
    expect(args.take).toBe(6);
    expect(args.where.AND).toEqual([
      { uploadState: 'ready' },
      { status: 'rejected', reviewEnteredAt: { not: null }, reportCount: 0 },
      { OR: [{ reviewEntrySource: 'user_report' }, { reports: { some: {} } }] },
      { sequence: { gt: 7 } },
    ]);
    await service.list({ source: 'auto_check', cursor: encodeMediaReviewCursor(7) });
    const second = prisma.postMedia.findMany.mock.calls[1][0].where.AND;
    expect(second).toContainEqual({ reviewEntrySource: 'auto_check' });
    expect(second).toContainEqual({ sequence: { lt: 7 } });
  });

  it('rejects a malformed cursor with 400', async () => {
    await expect(build().service.list({ cursor: 'not-a-cursor' })).rejects.toMatchObject({ status: 400 });
  });

  it('pages: returns a cursor only when there is more, built from the last returned row', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findMany.mockResolvedValue([dbRow({ sequence: 9 }), dbRow({ id: 'm2', sequence: 8 }), dbRow({ id: 'm3', sequence: 7 })]);
    const page = await service.list({ limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(['m1', 'm2']);
    expect(page.nextCursor).toBe(encodeMediaReviewCursor(8));
    prisma.postMedia.findMany.mockResolvedValue([dbRow()]);
    expect((await service.list({ limit: 2 })).nextCursor).toBeNull();
  });

  it('shapes an item: public name and id only (no email, no real name), labels, age, sources, and a short-lived view link', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValue([dbRow({ reportCount: 2, status: 'approved', _count: { reports: 2 } })]);
    const [item] = (await service.list({})).items;
    expect(item).toMatchObject({
      id: 'm1',
      kind: 'image',
      sizeBytes: 1234,
      status: 'approved',
      awaitingDecision: true,
      sources: ['auto_check', 'user_report'],
      reportCount: 2,
      checkLabels: ['Suggestive'],
      uploader: { id: 'u1', publicName: 'ada_l' },
      ageSeconds: 3600,
      viewUrl: 'https://view.test/post-media/u1/m1.jpg?ttl=300',
      viewUrlExpiresAt: new Date(NOW.getTime() + 300_000),
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('post-media/u1/m1.jpg', 300);
    const text = JSON.stringify(item);
    expect(text).not.toContain('must-not-leak');
    expect(text).not.toContain('Ada Lovelace');
    expect(text).not.toContain('email');
  });

  it('a storage outage gives the item no link instead of failing the whole list', async () => {
    const { service, prisma, storage } = build();
    storage.createDownloadUrl.mockRejectedValue(new ServiceUnavailableException('no store'));
    prisma.postMedia.findMany.mockResolvedValue([dbRow()]);
    const [item] = (await service.list({})).items;
    expect(item.viewUrl).toBeNull();
    expect(item.viewUrlExpiresAt).toBeNull();
  });

  it('an item the check never labelled has an empty label list', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findMany.mockResolvedValue([dbRow({ checkLabels: null })]);
    expect((await service.list({})).items[0].checkLabels).toEqual([]);
  });
});

describe('AdminMediaReviewService.get', () => {
  it('returns an item that has been in the queue, and 404s anything else', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findFirst.mockResolvedValue(dbRow());
    expect((await service.get('m1')).id).toBe('m1');
    expect(prisma.postMedia.findFirst.mock.calls[0][0].where).toEqual({
      id: 'm1',
      uploadState: 'ready',
      OR: [{ reviewEnteredAt: { not: null } }, { reportCount: { gt: 0 } }],
    });
    prisma.postMedia.findFirst.mockResolvedValue(null);
    await expect(service.get('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('AdminMediaReviewService decisions', () => {
  it('approve and reject delegate to the decision service and write the admin action log AFTER the decision', async () => {
    const { service, decisions, actionLog } = build();
    decisions.approve.mockResolvedValue({ id: 'm1', outcome: 'approved', status: 'approved' });
    await service.approve('m1', 'admin-1');
    expect(actionLog.record).toHaveBeenCalledWith('admin-1', 'media.approved', 'post_media', 'm1', undefined);

    decisions.approve.mockResolvedValue({ id: 'm1', outcome: 'kept', status: 'approved' });
    await service.approve('m1', 'admin-1');
    expect(actionLog.record).toHaveBeenLastCalledWith('admin-1', 'media.approved', 'post_media', 'm1', 'kept after user reports');

    decisions.reject.mockResolvedValue({ id: 'm1', outcome: 'rejected', status: 'rejected' });
    await service.reject('m1', 'admin-1', 'Shows a private address');
    expect(decisions.reject).toHaveBeenCalledWith('m1', 'admin-1', 'Shows a private address');
    expect(actionLog.record).toHaveBeenLastCalledWith('admin-1', 'media.rejected', 'post_media', 'm1', 'Shows a private address');
  });

  it('a refused decision (409) writes no audit row', async () => {
    const { service, decisions, actionLog } = build();
    decisions.reject.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
    await expect(service.reject('m1', 'admin-1', 'r')).rejects.toThrow();
    expect(actionLog.record).not.toHaveBeenCalled();
  });
});

describe('AdminMediaReviewService.stats', () => {
  it('returns aggregates only over a window ending now (default 7 days)', async () => {
    const { service, prisma } = build();
    prisma.postMedia.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(4);
    prisma.postMediaReport.groupBy.mockResolvedValue([{ mediaId: 'a' }, { mediaId: 'b' }]);
    prisma.adminActionLog.count.mockResolvedValue(3);
    const stats = await service.stats();
    const from = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(stats).toEqual({ windowDays: 7, from, to: NOW, autoApproved: 5, autoRejected: 2, sentToReview: 4, reported: 2, decidedByModerator: 3 });
    expect(prisma.postMedia.count.mock.calls[0][0].where).toEqual({ decisionSource: 'auto', status: 'approved', decidedAt: { gte: from, lte: NOW } });
    expect(prisma.postMedia.count.mock.calls[2][0].where).toEqual({ reviewEntrySource: 'auto_check', reviewEnteredAt: { gte: from, lte: NOW } });
    expect(prisma.adminActionLog.count.mock.calls[0][0].where).toMatchObject({ action: { in: ['media.approved', 'media.rejected'] } });
  });

  it('honours a custom window', async () => {
    const { service } = build();
    expect((await service.stats(30)).windowDays).toBe(30);
  });
});
