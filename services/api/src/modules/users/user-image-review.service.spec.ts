import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
