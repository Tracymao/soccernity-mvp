import { PrismaService } from '../../prisma/prisma.service';
import { PostMediaDecisionService } from './post-media-decision.service';

const NOW = new Date('2026-11-05T10:00:00Z');

function build(row: Record<string, unknown> | null) {
  const prisma = {
    postMedia: {
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    postMediaReport: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const service = new PostMediaDecisionService(prisma as unknown as PrismaService, { now: () => NOW });
  return { service, prisma };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  uploaderId: 'u1',
  status: 'pending',
  reportCount: 0,
  reviewEnteredAt: NOW,
  ...over,
});

describe('PostMediaDecisionService.approve', () => {
  it('approves a pending item as a moderator, resolves reports, and tells the uploader "approved"', async () => {
    const { service, prisma } = build(row());
    expect(await service.approve('m1', 'admin-1')).toEqual({ id: 'm1', outcome: 'approved', status: 'approved' });
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'pending', decisionSource: null },
      data: { status: 'approved', decisionSource: 'moderator', decidedAt: NOW, decidedBy: 'admin-1', reportCount: 0, hiddenPendingReview: false },
    });
    expect(prisma.postMediaReport.updateMany).toHaveBeenCalledWith({ where: { mediaId: 'm1', resolvedAt: null }, data: { resolvedAt: NOW } });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'post_media_approved', payloadRefId: 'm1' },
      select: { id: true },
    });
  });

  it('KEEPS an approved item with open reports: lifts the hold, resolves reports, and does NOT notify the uploader', async () => {
    const { service, prisma } = build(row({ status: 'approved', reportCount: 3 }));
    expect(await service.approve('m1', 'admin-1')).toEqual({ id: 'm1', outcome: 'kept', status: 'approved' });
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'approved', reportCount: { gt: 0 } },
      data: { reportCount: 0, hiddenPendingReview: false },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it.each([
    ['an already approved item with no reports', { status: 'approved', reportCount: 0 }],
    ['an already rejected item', { status: 'rejected', reportCount: 0 }],
  ])('refuses %s with 409 already_decided and writes nothing', async (_n, over) => {
    const { service, prisma } = build(row(over));
    await expect(service.approve('m1', 'admin-1')).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('loses a race quietly as 409: the guarded write matches nothing, so no notification', async () => {
    const { service, prisma } = build(row());
    prisma.postMedia.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve('m1', 'admin-1')).rejects.toMatchObject({ status: 409 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('404s an unknown or not-ready item and 409s one that never entered the queue', async () => {
    await expect(build(null).service.approve('m1', 'a')).rejects.toMatchObject({ status: 404 });
    const { service, prisma } = build(row({ reviewEnteredAt: null }));
    await expect(service.approve('m1', 'a')).rejects.toMatchObject({ status: 409, response: { code: 'not_in_review_queue' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
  });
});

describe('PostMediaDecisionService.reject', () => {
  const rejected = {
    status: 'rejected',
    decisionSource: 'moderator',
    decidedAt: NOW,
    decidedBy: 'admin-1',
    rejectionReason: 'Shows a private address',
    reportCount: 0,
    hiddenPendingReview: false,
  };

  it('rejects a pending item with the reason and notifies the uploader "rejected" (the reason is not copied into the notification)', async () => {
    const { service, prisma } = build(row());
    expect(await service.reject('m1', 'admin-1', 'Shows a private address')).toEqual({ id: 'm1', outcome: 'rejected', status: 'rejected' });
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({ where: { id: 'm1', status: 'pending', decisionSource: null }, data: rejected });
    const created = prisma.notification.create.mock.calls[0][0];
    expect(created.data).toEqual({ userId: 'u1', type: 'post_media_rejected', payloadRefId: 'm1' });
    expect(JSON.stringify(created)).not.toContain('private address');
  });

  it('rejects an approved item that has open reports', async () => {
    const { service, prisma } = build(row({ status: 'approved', reportCount: 4 }));
    await service.reject('m1', 'admin-1', 'Shows a private address');
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({ where: { id: 'm1', status: 'approved', reportCount: { gt: 0 } }, data: rejected });
    expect(prisma.postMediaReport.updateMany).toHaveBeenCalled();
  });

  it.each([
    ['an already rejected item', { status: 'rejected' }],
    ['an approved item nobody reported', { status: 'approved', reportCount: 0 }],
  ])('refuses %s with 409 and writes neither a change nor a second notification', async (_n, over) => {
    const { service, prisma } = build(row(over));
    await expect(service.reject('m1', 'admin-1', 'x')).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
