import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import {
  PROFILE_IMAGE_REJECTED_NOTIFICATION_TYPE,
  PROFILE_IMAGE_REJECTION_REASON_MAX_LENGTH,
  UserImageReviewService,
} from './user-image-review.service';

// B-214 (Decision Log #412 item 2): the storage half of the profile-image rejection reason.

function build(updateCount = 1, row: Record<string, unknown> | null = { avatarStatus: 'pending', coverStatus: 'pending' }) {
  const tx = {
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      findUnique: jest.fn().mockResolvedValue(row),
    },
    notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    // B-037: the live key is read first (when the caller has no expected key) to see whether it is published.
    user: { findUnique: jest.fn().mockResolvedValue({ avatarKey: 'private-profile/u1/a.jpg', coverKey: 'private-profile/u1/c.jpg' }) },
  } as unknown as PrismaService;
  const guardianNotices = { notifyInBackground: jest.fn() };
  return { tx, prisma, guardianNotices, service: new UserImageReviewService(prisma, guardianNotices as never) };
}

describe('UserImageReviewService.rejectProfileImage (B-214)', () => {
  it('rejects an AVATAR: status, reason and the notification are written in ONE transaction', async () => {
    const { prisma, tx, service } = build();
    await expect(service.rejectProfileImage('u1', 'avatar', 'Not a clear photo of you')).resolves.toEqual({
      userId: 'u1',
      kind: 'avatar',
      status: 'rejected',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', avatarUrl: { not: null }, avatarStatus: { in: ['pending', 'approved'] } },
      data: { avatarStatus: 'rejected', avatarRejectionReason: 'Not a clear photo of you' },
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: PROFILE_IMAGE_REJECTED_NOTIFICATION_TYPE, payloadRefId: 'avatar' },
      select: { id: true },
    });
  });

  it('rejects a COVER and touches only the cover columns', async () => {
    const { tx, service } = build();
    await service.rejectProfileImage('u1', 'cover', 'Contains text');
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', coverUrl: { not: null }, coverStatus: { in: ['pending', 'approved'] } },
      data: { coverStatus: 'rejected', coverRejectionReason: 'Contains text' },
    });
    expect(tx.notification.create.mock.calls[0][0].data.payloadRefId).toBe('cover');
  });

  // B-036: the automatic check passes the key it checked, so a re-upload during the check is never rejected by it.
  it.each([
    ['avatar', 'avatarKey'],
    ['cover', 'coverKey'],
  ] as const)('with an expected key the %s rejection is written ONLY while the row still points at that file', async (kind, keyCol) => {
    const { tx, service } = build();
    await service.rejectProfileImage('u1', kind, 'Too dark to see', 'private-profile/u1/checked.jpg');
    expect(tx.user.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'u1', [keyCol]: 'private-profile/u1/checked.jpg' });
  });

  it('without an expected key the rejection is not tied to a file (a moderator decision)', async () => {
    const { tx, service } = build();
    await service.rejectProfileImage('u1', 'avatar', 'Too dark to see');
    expect(tx.user.updateMany.mock.calls[0][0].where).not.toHaveProperty('avatarKey');
  });

  it('a picture replaced under the check (key no longer matches) is a 404, writes no notification and notifies no guardian', async () => {
    const { tx, guardianNotices, service } = build(0, { avatarStatus: 'pending', coverStatus: null });
    await expect(service.rejectProfileImage('u1', 'avatar', 'Too dark to see', 'private-profile/u1/old.jpg')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('trims the reason before storing it', async () => {
    const { tx, service } = build();
    await service.rejectProfileImage('u1', 'avatar', '   Too dark to see   \n');
    expect(tx.user.updateMany.mock.calls[0][0].data.avatarRejectionReason).toBe('Too dark to see');
  });

  it('the Notification does NOT copy the reason (it lives on the owner record only)', async () => {
    const { tx, service } = build();
    await service.rejectProfileImage('u1', 'avatar', 'A private moderator explanation');
    expect(JSON.stringify(tx.notification.create.mock.calls[0][0])).not.toContain('private moderator explanation');
  });

  it('accepts a reason of exactly the maximum length', async () => {
    const { service } = build();
    await expect(
      service.rejectProfileImage('u1', 'avatar', 'x'.repeat(PROFILE_IMAGE_REJECTION_REASON_MAX_LENGTH)),
    ).resolves.toBeDefined();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace only', '  \n\t '],
    ['a number', 5],
    ['too long', 'x'.repeat(PROFILE_IMAGE_REJECTION_REASON_MAX_LENGTH + 1)],
  ])('refuses %s with 400 before any database work', async (_n, reason) => {
    const { prisma, service } = build();
    await expect(service.rejectProfileImage('u1', 'avatar', reason)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an already-rejected image is a 409 and writes NO second notification', async () => {
    const { tx, service } = build(0, { avatarStatus: 'rejected', coverStatus: 'pending' });
    await expect(service.rejectProfileImage('u1', 'avatar', 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('a user with no such image is a 404 and writes no notification', async () => {
    const { tx, service } = build(0, { avatarStatus: null, coverStatus: null });
    await expect(service.rejectProfileImage('u1', 'cover', 'r')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('an unknown user is a 404', async () => {
    const { service } = build(0, null);
    await expect(service.rejectProfileImage('nobody', 'avatar', 'r')).rejects.toThrow('User not found');
  });

  it('a notification failure fails the whole call (the transaction rolls both writes back)', async () => {
    const { tx, service } = build();
    tx.notification.create.mockRejectedValue(new Error('db'));
    await expect(service.rejectProfileImage('u1', 'avatar', 'r')).rejects.toThrow('db');
  });
});

// B-279 (Decision Log #456 A): rejecting a profile picture or cover is a platform action on the user's profile,
// so the guardian of a minor is told the kind of action, never the reason.
describe('UserImageReviewService: guardian notice (B-279)', () => {
  it.each(['avatar', 'cover'] as const)('rejecting a %s asks for ONE profile_image_not_approved notice, without the reason', async (kind) => {
    const { service, guardianNotices } = build();
    await service.rejectProfileImage('u1', kind, 'Not a clear photo of you');
    expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
    expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('u1', 'profile_image_not_approved');
  });

  it('sends nothing when the rejection did not happen (no reason, already rejected, nothing to reject)', async () => {
    const empty = build();
    await expect(empty.service.rejectProfileImage('u1', 'avatar', '   ')).rejects.toBeDefined();
    const already = build(0, { avatarStatus: 'rejected', coverStatus: 'pending' });
    await expect(already.service.rejectProfileImage('u1', 'avatar', 'a reason')).rejects.toBeDefined();
    const none = build(0, null);
    await expect(none.service.rejectProfileImage('u1', 'avatar', 'a reason')).rejects.toBeDefined();
    for (const b of [empty, already, none]) expect(b.guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });
});

// backend/b037-profile-image-review (B-037): rejecting a picture that is already APPROVED (published in the public
// prefix) must leave no fetchable file behind. Order: copy to private + verify, delete the public object, THEN one
// transaction points the row at the private key and marks it rejected. Any failure before the transaction throws and
// rejects nothing. test/profile-image-review.e2e-spec.ts proves the same against real Postgres and storage.
describe('UserImageReviewService: withdrawing a published picture (B-037)', () => {
  const PUBLIC = 'profile-media/u1/f1.jpg';
  const PRIVATE = 'private-profile/u1/f1.jpg';

  function buildPublished(over: { updateCount?: number; liveKeyAfter?: string | null } = {}) {
    const tx = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: over.updateCount ?? 1 }),
        findUnique: jest.fn().mockResolvedValue({ avatarStatus: 'approved', coverStatus: null }),
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      user: {
        findUnique: jest.fn().mockImplementation(async () =>
          // the first read (before the transaction) sees the published key; a later one sees what is live afterwards
          prisma.user.findUnique.mock.calls.length === 1
            ? { avatarKey: PUBLIC, coverKey: null }
            : { avatarKey: over.liveKeyAfter === undefined ? PUBLIC : over.liveKeyAfter, coverKey: null },
        ),
      },
    };
    const objects = new Map<string, { size: number; contentType: string }>([[PUBLIC, { size: 100, contentType: 'image/jpeg' }]]);
    const storage = {
      head: jest.fn(async (key: string) => objects.get(key) ?? null),
      copyObject: jest.fn(async (from: string, to: string, contentType: string) => {
        objects.set(to, { size: objects.get(from)!.size, contentType });
      }),
      delete: jest.fn(async (key: string) => {
        objects.delete(key);
      }),
    };
    const guardianNotices = { notifyInBackground: jest.fn() };
    const service = new UserImageReviewService(
      prisma as unknown as PrismaService,
      guardianNotices as never,
      storage as unknown as DirectUploadStorageService,
    );
    return { service, prisma, tx, storage, objects, guardianNotices };
  }

  it('copies to the private prefix, verifies, deletes the public object, THEN rejects and points the row at the private key', async () => {
    const { service, tx, storage, objects } = buildPublished();
    await service.rejectProfileImage('u1', 'avatar', 'Taken down');
    expect(storage.copyObject).toHaveBeenCalledWith(PUBLIC, PRIVATE, 'image/jpeg');
    expect(storage.delete).toHaveBeenCalledWith(PUBLIC);
    expect(objects.has(PUBLIC)).toBe(false);
    expect(objects.has(PRIVATE)).toBe(true);
    // the row write is guarded on the published key and moves the key to the private one in the same write
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', avatarUrl: { not: null }, avatarStatus: { in: ['pending', 'approved'] }, avatarKey: PUBLIC },
      data: { avatarStatus: 'rejected', avatarRejectionReason: 'Taken down', avatarKey: PRIVATE },
    });
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(tx.user.updateMany.mock.invocationCallOrder[0]);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
  });

  it('uses the expected key when given (no extra read) and still withdraws a published one', async () => {
    const { service, prisma, storage } = buildPublished();
    await service.rejectProfileImage('u1', 'avatar', 'Taken down', PUBLIC);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith(PUBLIC);
  });

  it('a picture that was never published (private key) needs no file work at all', async () => {
    const { service, storage, tx } = buildPublished();
    await service.rejectProfileImage('u1', 'avatar', 'Taken down', PRIVATE);
    expect(storage.head).not.toHaveBeenCalled();
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(tx.user.updateMany.mock.calls[0][0].data).toEqual({ avatarStatus: 'rejected', avatarRejectionReason: 'Taken down' });
  });

  it('if the copy fails nothing is rejected, nothing is deleted, no notification', async () => {
    const { service, storage, prisma, tx, guardianNotices } = buildPublished();
    storage.copyObject.mockRejectedValue(new Error('copy failed'));
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.delete).not.toHaveBeenCalledWith(PUBLIC);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('a copy that does not match the original is discarded and nothing is rejected or deleted publicly', async () => {
    const { service, storage, objects, prisma } = buildPublished();
    storage.copyObject.mockImplementation(async (_from: string, to: string) => {
      objects.set(to, { size: 999, contentType: 'image/jpeg' });
    });
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(objects.has(PRIVATE)).toBe(false);
    expect(objects.has(PUBLIC)).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('if the public object cannot be deleted nothing is rejected', async () => {
    const { service, storage, prisma } = buildPublished();
    storage.delete.mockRejectedValue(new Error('delete failed'));
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent: the public object already gone but the private copy present is simply finished', async () => {
    const { service, storage, objects, tx } = buildPublished();
    objects.delete(PUBLIC);
    objects.set(PRIVATE, { size: 100, contentType: 'image/jpeg' });
    await service.rejectProfileImage('u1', 'avatar', 'x');
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it('neither object existing is an error, nothing is rejected', async () => {
    const { service, objects, prisma } = buildPublished();
    objects.clear();
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('with no object store available a published picture cannot be taken down (503), and nothing is rejected', async () => {
    const tx = { user: { updateMany: jest.fn(), findUnique: jest.fn() }, notification: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn(), user: { findUnique: jest.fn().mockResolvedValue({ avatarKey: PUBLIC, coverKey: null }) } };
    const service = new UserImageReviewService(prisma as unknown as PrismaService, { notifyInBackground: jest.fn() } as never);
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('if the row was replaced meanwhile the stray private copy is removed, and the new picture is left alone', async () => {
    const { service, storage, objects } = buildPublished({ updateCount: 0, liveKeyAfter: 'private-profile/u1/NEW.jpg' });
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(objects.has(PRIVATE)).toBe(false);
    expect(storage.delete).toHaveBeenCalledWith(PRIVATE);
  });

  it('if another rejection of the same picture won the race its private file is KEPT', async () => {
    const { service, objects } = buildPublished({ updateCount: 0, liveKeyAfter: PRIVATE });
    await expect(service.rejectProfileImage('u1', 'avatar', 'x')).rejects.toBeDefined();
    expect(objects.has(PRIVATE)).toBe(true);
  });
});
