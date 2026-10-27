import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PostMediaConfig } from './post-media.config';
import { PostMediaReportService } from './post-media-report.service';

const NOW = new Date('2026-11-05T10:00:00Z');

function build(opts: { env?: Record<string, string>; found?: boolean; uploaderId?: string; count?: number; entered?: Date | null } = {}) {
  const prisma = {
    postMedia: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ uploaderId: opts.uploaderId ?? 'owner' })
        .mockResolvedValueOnce(opts.found === false ? null : { id: 'm1' }),
      update: jest.fn().mockResolvedValue({ reportCount: opts.count ?? 1, reviewEnteredAt: opts.entered ?? null }),
    },
    postMediaReport: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const service = new PostMediaReportService(
    prisma as unknown as PrismaService,
    new PostMediaConfig(new ConfigService(opts.env ?? {})),
    { now: () => NOW },
  );
  return { service, prisma };
}

describe('PostMediaReportService.report', () => {
  it('refuses reporting your own file with 400 and touches nothing', async () => {
    const { service, prisma } = build({ uploaderId: 'me' });
    await expect(service.report('me', 'm1')).rejects.toMatchObject({ status: 400, response: { code: 'cannot_report_own_media' } });
    expect(prisma.postMediaReport.create).not.toHaveBeenCalled();
  });

  it('is the same 404 when the item is not visible to the reporter (pending, rejected, hidden, blocked pair, unattached, not found)', async () => {
    const { service, prisma } = build({ found: false });
    await expect(service.report('me', 'm1')).rejects.toMatchObject({ status: 404 });
    expect(prisma.postMediaReport.create).not.toHaveBeenCalled();
  });

  it('looks the item up as: ready, approved, not already hidden, no block either way, attached to a post this viewer can see', async () => {
    const { service, prisma } = build();
    await service.report('me', 'm1');
    const where = prisma.postMedia.findFirst.mock.calls[1][0].where;
    expect(where).toMatchObject({
      id: 'm1',
      uploadState: 'ready',
      status: 'approved',
      hiddenPendingReview: false,
      postId: { not: null },
      uploader: { is: { blockedBy: { none: { blockerId: 'me' } }, blocksMade: { none: { blockedId: 'me' } } } },
    });
    expect(where.post.is.AND).toHaveLength(3);
  });

  it('records the report, counts it, and puts the item in the queue the first time (below the threshold it stays visible)', async () => {
    const { service, prisma } = build({ count: 1, entered: null });
    expect(await service.report('me', 'm1')).toEqual({ reported: true, alreadyReported: false });
    expect(prisma.postMediaReport.create).toHaveBeenCalledWith({ data: { mediaId: 'm1', reporterId: 'me', createdAt: NOW }, select: { id: true } });
    expect(prisma.postMedia.update.mock.calls[0][0].data).toEqual({ reportCount: { increment: 1 } });
    expect(prisma.postMedia.update.mock.calls[1][0].data).toEqual({ reviewEnteredAt: NOW, reviewEntrySource: 'user_report' });
  });

  it('hides the item when the open report count reaches the threshold (default 3), and keeps the original queue entry time', async () => {
    const entered = new Date('2026-11-04T00:00:00Z');
    const { service, prisma } = build({ count: 3, entered });
    await service.report('me', 'm1');
    expect(prisma.postMedia.update.mock.calls[1][0].data).toEqual({ hiddenPendingReview: true });
  });

  it('the threshold is configurable, and 0 never hides automatically', async () => {
    const two = build({ count: 2, entered: NOW, env: { MEDIA_REPORT_HIDE_THRESHOLD: '2' } });
    await two.service.report('me', 'm1');
    expect(two.prisma.postMedia.update.mock.calls[1][0].data).toEqual({ hiddenPendingReview: true });

    const zero = build({ count: 50, entered: NOW, env: { MEDIA_REPORT_HIDE_THRESHOLD: '0' } });
    await zero.service.report('me', 'm1');
    expect(zero.prisma.postMedia.update).toHaveBeenCalledTimes(1); // only the increment
  });

  it('a second report by the same user is a 200 no-op (P2002), not an error and not a second count', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect(await service.report('me', 'm1')).toEqual({ reported: true, alreadyReported: true });
  });

  it('any other database error propagates', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(service.report('me', 'm1')).rejects.toThrow('db down');
  });
});
