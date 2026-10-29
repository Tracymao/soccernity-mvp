import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PostMediaConfig } from './post-media.config';
import { PostMediaObjectsService } from './post-media-objects.service';
import { PostMediaReportService } from './post-media-report.service';

const NOW = new Date('2026-11-05T10:00:00Z');

function build(
  opts: {
    env?: Record<string, string>;
    found?: boolean;
    uploaderId?: string;
    count?: number;
    entered?: Date | null;
    alreadyHidden?: boolean;
    filedToday?: number;
  } = {},
) {
  const prisma = {
    postMedia: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ uploaderId: opts.uploaderId ?? 'owner' })
        .mockResolvedValueOnce(opts.found === false ? null : { id: 'm1' }),
      update: jest.fn().mockResolvedValue({
        reportCount: opts.count ?? 1,
        reviewEnteredAt: opts.entered ?? null,
        hiddenPendingReview: opts.alreadyHidden ?? false,
      }),
    },
    postMediaReport: {
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      count: jest.fn().mockResolvedValue(opts.filedToday ?? 0),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const objects = { withdraw: jest.fn().mockResolvedValue('withdrawn') };
  const service = new PostMediaReportService(
    prisma as unknown as PrismaService,
    new PostMediaConfig(new ConfigService(opts.env ?? {})),
    objects as unknown as PostMediaObjectsService,
    { now: () => NOW },
  );
  return { service, prisma, objects };
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
    const { service, prisma, objects } = build({ count: 1, entered: null });
    expect(await service.report('me', 'm1')).toEqual({ reported: true, alreadyReported: false });
    expect(prisma.postMediaReport.create).toHaveBeenCalledWith({
      data: { mediaId: 'm1', reporterId: 'me', createdAt: NOW, reason: null },
      select: { id: true },
    });
    expect(prisma.postMedia.update.mock.calls[0][0].data).toEqual({ reportCount: { increment: 1 } });
    expect(prisma.postMedia.update.mock.calls[1][0].data).toEqual({ reviewEnteredAt: NOW, reviewEntrySource: 'user_report' });
    expect(objects.withdraw).not.toHaveBeenCalled(); // below the threshold the file stays where it is
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
    const { service, prisma, objects } = build();
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect(await service.report('me', 'm1')).toEqual({ reported: true, alreadyReported: true });
    expect(objects.withdraw).not.toHaveBeenCalled();
  });

  it('any other database error propagates', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(service.report('me', 'm1')).rejects.toThrow('db down');
  });

  // ---- B-257: a held item leaves the public prefix --------------------------------------------------

  it('when a report NEWLY holds the item, the file is moved to the private prefix; a failed move never fails the report', async () => {
    const { service, objects } = build({ count: 3, entered: NOW });
    objects.withdraw.mockRejectedValue(new Error('storage down'));
    await expect(service.report('me', 'm1')).resolves.toEqual({ reported: true, alreadyReported: false });
    expect(objects.withdraw).toHaveBeenCalledWith('m1');
  });

  it('a report on an item that was ALREADY held does not move it again', async () => {
    const { service, objects } = build({ count: 4, entered: NOW, alreadyHidden: true });
    await service.report('me', 'm1');
    expect(objects.withdraw).not.toHaveBeenCalled();
  });

  // ---- B-258: the per-account daily limit ------------------------------------------------------------

  describe('the per-account daily limit (default 20 in any rolling 24 hours, founder-veto-able)', () => {
    it('counts the account\'s own report records in the last 24 hours', async () => {
      const { service, prisma } = build();
      await service.report('me', 'm1');
      expect(prisma.postMediaReport.count).toHaveBeenCalledWith({
        where: { reporterId: 'me', createdAt: { gt: new Date(NOW.getTime() - 24 * 3600 * 1000) } },
      });
    });

    it('allows the 20th report in a rolling day (19 already filed)', async () => {
      const { service, prisma } = build({ filedToday: 19 });
      await expect(service.report('me', 'm1')).resolves.toMatchObject({ reported: true });
      expect(prisma.postMediaReport.create).toHaveBeenCalled();
    });

    it('refuses the 21st with a 429 carrying the stable code media_report_daily_limit, and records nothing', async () => {
      const { service, prisma, objects } = build({ filedToday: 20 });
      await expect(service.report('me', 'm1')).rejects.toMatchObject({
        status: 429,
        response: {
          statusCode: 429,
          error: 'Too Many Requests',
          code: 'media_report_daily_limit',
          message: 'Each person can send a limited number of reports in 24 hours. You can report again later.',
        },
      });
      expect(prisma.postMediaReport.create).not.toHaveBeenCalled();
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
      expect(objects.withdraw).not.toHaveBeenCalled();
    });

    it('is configurable (POST_MEDIA_REPORT_DAILY_LIMIT)', async () => {
      const three = build({ filedToday: 3, env: { POST_MEDIA_REPORT_DAILY_LIMIT: '3' } });
      await expect(three.service.report('me', 'm1')).rejects.toMatchObject({ status: 429 });
      const four = build({ filedToday: 3, env: { POST_MEDIA_REPORT_DAILY_LIMIT: '4' } });
      await expect(four.service.report('me', 'm1')).resolves.toMatchObject({ reported: true });
    });

    it('an unusable value falls back to 20', () => {
      expect(new PostMediaConfig(new ConfigService({ POST_MEDIA_REPORT_DAILY_LIMIT: 'lots' })).reportDailyLimit).toBe(20);
      expect(new PostMediaConfig(new ConfigService({ POST_MEDIA_REPORT_DAILY_LIMIT: '0' })).reportDailyLimit).toBe(20);
      expect(new PostMediaConfig(new ConfigService({})).reportDailyLimit).toBe(20);
    });

    it('the hold threshold is unchanged (3), whatever the daily limit is', () => {
      expect(new PostMediaConfig(new ConfigService({ POST_MEDIA_REPORT_DAILY_LIMIT: '5' })).reportHideThreshold).toBe(3);
    });
  });

  // ---- B-259: the optional reason --------------------------------------------------------------------

  describe('the optional reason (trimmed, at most 500 characters, reviewers only)', () => {
    it('is trimmed and stored on the report record', async () => {
      const { service, prisma } = build();
      await service.report('me', 'm1', '   this is a private address   ');
      expect(prisma.postMediaReport.create).toHaveBeenCalledWith({
        data: { mediaId: 'm1', reporterId: 'me', createdAt: NOW, reason: 'this is a private address' },
        select: { id: true },
      });
    });

    it('a blank reason is stored as none (null), never an empty string', async () => {
      const { service, prisma } = build();
      await service.report('me', 'm1', '    ');
      expect(prisma.postMediaReport.create.mock.calls[0][0].data.reason).toBeNull();
    });

    it('the report response never carries the reason (nothing about it is returned to the reporter or anyone else)', async () => {
      const { service } = build();
      expect(await service.report('me', 'm1', 'secret reason')).toEqual({ reported: true, alreadyReported: false });
    });
  });
});
