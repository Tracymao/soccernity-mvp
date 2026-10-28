import { PrismaService } from '../../prisma/prisma.service';
import { PostMediaDecisionService } from './post-media-decision.service';
import { PostMediaObjectsService } from './post-media-objects.service';

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
  const calls: string[] = [];
  const objects = {
    copyToPublic: jest.fn(async () => {
      calls.push('copyToPublic');
    }),
    discardUnrecordedCopy: jest.fn().mockResolvedValue(undefined),
    finishPublish: jest.fn(async () => {
      calls.push('finishPublish');
    }),
    withdraw: jest.fn(async () => {
      calls.push('withdraw');
      return 'withdrawn';
    }),
  };
  prisma.postMedia.updateMany.mockImplementation(async () => {
    calls.push('write');
    return { count: 1 };
  });
  const service = new PostMediaDecisionService(prisma as unknown as PrismaService, objects as unknown as PostMediaObjectsService, {
    now: () => NOW,
  });
  return { service, prisma, objects, calls };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  uploaderId: 'u1',
  status: 'pending',
  reportCount: 0,
  reviewEnteredAt: NOW,
  contentType: 'image/jpeg',
  privateKey: 'private-media/u1/m1.jpg',
  publicKey: 'post-media/u1/m1.jpg',
  publishedAt: null,
  ...over,
});

describe('PostMediaDecisionService.approve', () => {
  it('approves a pending item as a moderator, resolves reports, and tells the uploader "approved"', async () => {
    const { service, prisma } = build(row());
    expect(await service.approve('m1', 'admin-1')).toEqual({ id: 'm1', outcome: 'approved', status: 'approved' });
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'pending', decisionSource: null },
      data: {
        status: 'approved',
        decisionSource: 'moderator',
        decidedAt: NOW,
        decidedBy: 'admin-1',
        reportCount: 0,
        hiddenPendingReview: false,
        publishedAt: NOW,
      },
    });
    expect(prisma.postMediaReport.updateMany).toHaveBeenCalledWith({ where: { mediaId: 'm1', resolvedAt: null }, data: { resolvedAt: NOW } });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'post_media_approved', payloadRefId: 'm1' },
      select: { id: true },
    });
  });

  // B-257 (Decision Log #430 item 2): the file is copied to the PUBLIC prefix and the copy verified BEFORE
  // 'approved' is written, and the private original is removed only AFTER.
  it('publishes the file FIRST, then writes "approved", then removes the private original', async () => {
    const { service, objects, calls } = build(row());
    await service.approve('m1', 'admin-1');
    expect(objects.copyToPublic).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', privateKey: 'private-media/u1/m1.jpg', publicKey: 'post-media/u1/m1.jpg' }),
    );
    expect(calls).toEqual(['copyToPublic', 'write', 'finishPublish']);
  });

  it('FAILS CLOSED: if the copy fails nothing is approved, nothing is written, and the moderator gets a retryable 503', async () => {
    const { service, prisma, objects, calls } = build(row());
    objects.copyToPublic.mockRejectedValue(new Error('storage down'));
    await expect(service.approve('m1', 'admin-1')).rejects.toMatchObject({ status: 503, response: { code: 'media_publish_failed' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(calls).toEqual([]); // no write, no finishPublish
    expect(objects.finishPublish).not.toHaveBeenCalled();
  });

  it('KEEPS an approved item with open reports: lifts the hold, resolves reports, and does NOT notify the uploader', async () => {
    const { service, prisma } = build(row({ status: 'approved', reportCount: 3 }));
    expect(await service.approve('m1', 'admin-1')).toEqual({ id: 'm1', outcome: 'kept', status: 'approved' });
    expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'approved', reportCount: { gt: 0 } },
      data: { reportCount: 0, hiddenPendingReview: false, publishedAt: NOW },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('keeps a held item by publishing it again (it had been moved to the private prefix), but not one still public', async () => {
    const held = build(row({ status: 'approved', reportCount: 3, publishedAt: null }));
    await held.service.approve('m1', 'admin-1');
    expect(held.objects.copyToPublic).toHaveBeenCalledWith(expect.objectContaining({ publishedAt: null }));

    const stillPublic = new Date('2026-11-01T00:00:00Z');
    const visible = build(row({ status: 'approved', reportCount: 1, publishedAt: stillPublic }));
    await visible.service.approve('m1', 'admin-1');
    expect(visible.prisma.postMedia.updateMany.mock.calls[0][0].data.publishedAt).toEqual(stillPublic); // the original time is kept
  });

  it.each([
    ['an already approved item with no reports', { status: 'approved', reportCount: 0 }],
    ['an already rejected item', { status: 'rejected', reportCount: 0 }],
  ])('refuses %s with 409 already_decided and writes (and copies) nothing', async (_n, over) => {
    const { service, prisma, objects } = build(row(over));
    await expect(service.approve('m1', 'admin-1')).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(objects.copyToPublic).not.toHaveBeenCalled();
  });

  it('loses a race quietly as 409: the guarded write matches nothing, so no notification, and the unrecorded public copy is cleaned up', async () => {
    const { service, prisma, objects } = build(row());
    prisma.postMedia.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve('m1', 'admin-1')).rejects.toMatchObject({ status: 409 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(objects.discardUnrecordedCopy).toHaveBeenCalledWith('m1', 'post-media/u1/m1.jpg');
    expect(objects.finishPublish).not.toHaveBeenCalled();
  });

  it('404s an unknown or not-ready item and 409s one that never entered the queue', async () => {
    await expect(build(null).service.approve('m1', 'a')).rejects.toMatchObject({ status: 404 });
    const { service, prisma, objects } = build(row({ reviewEnteredAt: null }));
    await expect(service.approve('m1', 'a')).rejects.toMatchObject({ status: 409, response: { code: 'not_in_review_queue' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(objects.copyToPublic).not.toHaveBeenCalled();
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

  // B-257: the status is written FIRST (the database gate hides the file at once), THEN a published file is
  // moved back to the private prefix. The decision service has no way to delete an object at all: a rejected
  // file is kept (evidence handling is OPEN under counsel, B-206).
  it('writes "rejected" first and then moves a published file back to the private prefix; it never deletes anything', async () => {
    const { service, objects, calls } = build(row({ status: 'approved', reportCount: 4, publishedAt: NOW }));
    await service.reject('m1', 'admin-1', 'Shows a private address');
    expect(calls).toEqual(['write', 'withdraw']);
    expect(objects.withdraw).toHaveBeenCalledWith('m1');
    expect(objects.copyToPublic).not.toHaveBeenCalled();
    expect(Object.keys(objects)).not.toContain('delete');
  });

  it('a failed move-back never fails the rejection (it is retried by the reconciler)', async () => {
    const { service, objects } = build(row({ status: 'approved', reportCount: 4, publishedAt: NOW }));
    objects.withdraw.mockRejectedValue(new Error('storage down'));
    await expect(service.reject('m1', 'admin-1', 'x')).resolves.toMatchObject({ outcome: 'rejected' });
  });

  it.each([
    ['an already rejected item', { status: 'rejected' }],
    ['an approved item nobody reported', { status: 'approved', reportCount: 0 }],
  ])('refuses %s with 409 and writes neither a change nor a second notification', async (_n, over) => {
    const { service, prisma, objects } = build(row(over));
    await expect(service.reject('m1', 'admin-1', 'x')).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(objects.withdraw).not.toHaveBeenCalled();
  });
});
