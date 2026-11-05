import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaCheckService } from '../post-media/media-check.service';
import { MediaModerationClient } from '../post-media/media-moderation-client';
import { PostMediaConfig } from '../post-media/post-media.config';
import { ProfileImageCheckService, ProfileImageCheckSweepService } from './profile-image-check.service';
import { UserImageReviewService } from './user-image-review.service';

// backend/b036-avatar-cover-check (B-036). Unit level: each outcome, the claim, the race, the failure path and the
// "unconfigured means nothing runs" rule, with in-memory fakes. test/profile-image-check.e2e-spec.ts proves the same
// against real Postgres.

const NOW = new Date('2026-11-05T10:00:00Z');
const KEY = 'private-profile/u1/f1.jpg';
const PUBLIC_KEY = 'profile-media/u1/f1.jpg';
const image = (over: Record<string, unknown> = {}) => ({ userId: 'u1', kind: 'avatar' as const, key: KEY, ...over });

function build(opts: { configured?: boolean; env?: Record<string, string> } = {}) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    profileImageCheck: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', kind: 'avatar', objectKey: KEY, attempts: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ isMinor: false, avatarKey: KEY, avatarStatus: 'pending', coverKey: null, coverStatus: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = {
    head: jest.fn(async (key: string) => ({ size: 100, contentType: key.endsWith('.jpg') ? 'image/jpeg' : null })),
    copyObject: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    publicUrlFor: jest.fn((key: string) => `https://cdn.test/${key}`),
  };
  const checks = { checkStoredImage: jest.fn().mockResolvedValue({ outcome: 'approved', categories: [] }) };
  const moderation = { isConfigured: opts.configured ?? true };
  const review = { rejectProfileImage: jest.fn().mockResolvedValue({}) };
  const service = new ProfileImageCheckService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    checks as unknown as MediaCheckService,
    moderation as unknown as MediaModerationClient,
    new PostMediaConfig(new ConfigService(opts.env ?? {})),
    review as unknown as UserImageReviewService,
    { now: () => NOW },
  );
  return { service, prisma, storage, checks, moderation, review };
}

// Claim succeeds via path 3 (no row yet) in most tests.
const claimable = (prisma: ReturnType<typeof build>['prisma']) => prisma.profileImageCheck.create.mockResolvedValue({});

describe('ProfileImageCheckService.runDueChecks', () => {
  it('with Rekognition unconfigured it does NOTHING: no query, no write, no storage call', async () => {
    const { service, prisma, storage, checks } = build({ configured: false });
    expect(await service.runDueChecks(NOW)).toEqual({ checked: 0, outcomes: {} });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.profileImageCheck.updateMany).not.toHaveBeenCalled();
    expect(prisma.profileImageCheck.create).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(checks.checkStoredImage).not.toHaveBeenCalled();
  });

  it('cleans up stale bookkeeping, finds the due avatars and covers, and checks each', async () => {
    const { service, prisma, checks } = build();
    claimable(prisma);
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: 'u1', key: KEY }]).mockResolvedValueOnce([{ userId: 'u2', key: 'private-profile/u2/c.jpg' }]);
    prisma.user.findUnique
      .mockResolvedValueOnce({ isMinor: false, avatarKey: KEY, avatarStatus: 'pending', coverKey: null, coverStatus: null })
      .mockResolvedValueOnce({ isMinor: true, avatarKey: null, avatarStatus: null, coverKey: 'private-profile/u2/c.jpg', coverStatus: 'pending' });
    prisma.profileImageCheck.findUnique.mockResolvedValue({ attempts: 0, objectKey: KEY });

    const result = await service.runDueChecks(NOW);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1); // the stale-bookkeeping delete
    expect(result).toEqual({ checked: 2, outcomes: { approved: 2 } });
    expect(checks.checkStoredImage).toHaveBeenNthCalledWith(1, KEY, false);
    expect(checks.checkStoredImage).toHaveBeenNthCalledWith(2, 'private-profile/u2/c.jpg', true); // a minor: stricter thresholds
  });
});

describe('ProfileImageCheckService.checkOne', () => {
  it('loses the claim race quietly: another worker holds it or it is settled, so nothing is read or sent', async () => {
    const { service, prisma, checks } = build();
    prisma.profileImageCheck.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.checkOne(image(), NOW)).toBe('skipped');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(checks.checkStoredImage).not.toHaveBeenCalled();
  });

  it('claims with a lease: the row is written with nextAttemptAt = now + the lease, so no second sweep takes it', async () => {
    const { service, prisma } = build();
    claimable(prisma);
    await service.checkOne(image(), NOW);
    expect(prisma.profileImageCheck.create).toHaveBeenCalledWith({
      data: { userId: 'u1', kind: 'avatar', objectKey: KEY, state: 'retry', attempts: 0, nextAttemptAt: new Date(NOW.getTime() + 600_000) },
    });
  });

  it('a row for an OLDER file is taken over and restarted (attempts back to 0)', async () => {
    const { service, prisma } = build();
    prisma.profileImageCheck.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.checkOne(image(), NOW);
    expect(prisma.profileImageCheck.updateMany.mock.calls[0][0]).toEqual({
      where: { userId: 'u1', kind: 'avatar', NOT: { objectKey: KEY } },
      data: { objectKey: KEY, state: 'retry', attempts: 0, nextAttemptAt: new Date(NOW.getTime() + 600_000) },
    });
    expect(prisma.profileImageCheck.create).not.toHaveBeenCalled();
  });

  it('a retry that is due is re-claimed only while it is still due', async () => {
    const { service, prisma } = build();
    prisma.profileImageCheck.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await service.checkOne(image(), NOW);
    expect(prisma.profileImageCheck.updateMany.mock.calls[1][0].where).toEqual({
      userId: 'u1',
      kind: 'avatar',
      objectKey: KEY,
      state: 'retry',
      nextAttemptAt: { lte: NOW },
    });
  });

  it.each([
    ['replaced under the sweep', { avatarKey: 'private-profile/u1/other.jpg', avatarStatus: 'pending' }],
    ['already decided', { avatarKey: KEY, avatarStatus: 'rejected' }],
    ['removed', { avatarKey: null, avatarStatus: null }],
  ])('a picture %s between the query and the claim is skipped without a check', async (_n, over) => {
    const { service, prisma, checks } = build();
    claimable(prisma);
    prisma.user.findUnique.mockResolvedValue({ isMinor: false, coverKey: null, coverStatus: null, ...over });
    expect(await service.checkOne(image(), NOW)).toBe('skipped');
    expect(checks.checkStoredImage).not.toHaveBeenCalled();
  });

  it('an account that is gone is skipped', async () => {
    const { service, prisma } = build();
    claimable(prisma);
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.checkOne(image(), NOW)).toBe('skipped');
  });

  describe('approved', () => {
    it('copies to the PUBLIC key, verifies the copy, then flips the row ONLY while it still points at the checked file', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      expect(await service.checkOne(image(), NOW)).toBe('approved');

      expect(storage.copyObject).toHaveBeenCalledWith(KEY, PUBLIC_KEY, 'image/jpeg');
      expect(storage.head).toHaveBeenCalledWith(PUBLIC_KEY); // the copy is verified
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', avatarKey: KEY, avatarStatus: 'pending' },
        data: { avatarKey: PUBLIC_KEY, avatarStatus: 'approved', avatarUrl: `https://cdn.test/${PUBLIC_KEY}` },
      });
      // Order: copy first, write second.
      expect(storage.copyObject.mock.invocationCallOrder[0]).toBeLessThan(prisma.user.updateMany.mock.invocationCallOrder[0]);
      expect(storage.delete).toHaveBeenCalledWith(KEY); // the private original goes after the flip
      expect(prisma.profileImageCheck.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', kind: 'avatar' } });
    });

    it('a cover writes the cover columns and never the avatar ones', async () => {
      const { service, prisma } = build();
      claimable(prisma);
      const key = 'private-profile/u1/c1.jpg';
      prisma.user.findUnique.mockResolvedValue({ isMinor: false, avatarKey: null, avatarStatus: null, coverKey: key, coverStatus: 'pending' });
      expect(await service.checkOne(image({ kind: 'cover', key }), NOW)).toBe('approved');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', coverKey: key, coverStatus: 'pending' },
        data: { coverKey: 'profile-media/u1/c1.jpg', coverStatus: 'approved', coverUrl: 'https://cdn.test/profile-media/u1/c1.jpg' },
      });
    });

    it('RACE: if the write finds the picture replaced, nothing is approved, the stray public copy is removed and the old private file is kept', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      // The re-read after the lost write: the row now points at a different file.
      prisma.user.findUnique
        .mockResolvedValueOnce({ isMinor: false, avatarKey: KEY, avatarStatus: 'pending', coverKey: null, coverStatus: null })
        .mockResolvedValueOnce({ avatarKey: 'private-profile/u1/new.jpg', coverKey: null });

      expect(await service.checkOne(image(), NOW)).toBe('skipped');

      expect(storage.delete).toHaveBeenCalledWith(PUBLIC_KEY);
      expect(storage.delete).not.toHaveBeenCalledWith(KEY);
      expect(prisma.profileImageCheck.deleteMany).not.toHaveBeenCalled();
    });

    it('RACE: if the live file turns out to BE the public copy (decided elsewhere), the copy is left alone', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      prisma.user.findUnique
        .mockResolvedValueOnce({ isMinor: false, avatarKey: KEY, avatarStatus: 'pending', coverKey: null, coverStatus: null })
        .mockResolvedValueOnce({ avatarKey: PUBLIC_KEY, coverKey: null });
      await service.checkOne(image(), NOW);
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('FAIL CLOSED: a copy that fails is a check failure; nothing is written to the user', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      storage.copyObject.mockRejectedValue(new Error('copy failed'));
      expect(await service.checkOne(image(), NOW)).toBe('retry');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('FAIL CLOSED: a copy whose size does not match is deleted and is a check failure', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      storage.head.mockImplementation(async (key: string) => ({ size: key === PUBLIC_KEY ? 101 : 100, contentType: 'image/jpeg' }));
      expect(await service.checkOne(image(), NOW)).toBe('retry');
      expect(storage.delete).toHaveBeenCalledWith(PUBLIC_KEY);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('FAIL CLOSED: a missing private file is a check failure', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      storage.head.mockResolvedValue(null as never);
      expect(await service.checkOne(image(), NOW)).toBe('retry');
      expect(storage.copyObject).not.toHaveBeenCalled();
    });

    it('a database error after the copy removes the unrecorded public copy and is a check failure', async () => {
      const { service, prisma, storage } = build();
      claimable(prisma);
      prisma.user.updateMany.mockRejectedValue(new Error('db'));
      expect(await service.checkOne(image(), NOW)).toBe('retry');
      expect(storage.delete).toHaveBeenCalledWith(PUBLIC_KEY);
    });
  });

  describe('rejected', () => {
    it('uses the existing rejection path with the generic reason AND the checked key, and drops the bookkeeping', async () => {
      const { service, prisma, checks, review, storage } = build();
      claimable(prisma);
      checks.checkStoredImage.mockResolvedValue({ outcome: 'rejected', categories: ['Explicit'] });

      expect(await service.checkOne(image(), NOW)).toBe('rejected');

      expect(review.rejectProfileImage).toHaveBeenCalledWith('u1', 'avatar', "This file didn't meet our rules", KEY);
      expect(storage.copyObject).not.toHaveBeenCalled(); // a rejected file is never made public
      expect(storage.delete).not.toHaveBeenCalled(); // and stays where it is (private)
      expect(prisma.profileImageCheck.deleteMany).toHaveBeenCalled();
    });

    it.each([
      ['replaced (404)', new NotFoundException('gone')],
      ['already decided (409)', new ConflictException('done')],
    ])('a picture %s under the check is skipped, not an error and not a retry', async (_n, error) => {
      const { service, prisma, checks, review } = build();
      claimable(prisma);
      checks.checkStoredImage.mockResolvedValue({ outcome: 'rejected', categories: ['Explicit'] });
      review.rejectProfileImage.mockRejectedValue(error);
      expect(await service.checkOne(image(), NOW)).toBe('skipped');
    });

    it('an unexpected error while rejecting is a check failure (retried)', async () => {
      const { service, prisma, checks, review } = build();
      claimable(prisma);
      checks.checkStoredImage.mockResolvedValue({ outcome: 'rejected', categories: ['Explicit'] });
      review.rejectProfileImage.mockRejectedValue(new Error('db'));
      expect(await service.checkOne(image(), NOW)).toBe('retry');
    });
  });

  describe('between the thresholds', () => {
    it('stays pending: nothing on the user changes, and the bookkeeping records that it waits for the moderator queue', async () => {
      const { service, prisma, checks, storage } = build();
      claimable(prisma);
      checks.checkStoredImage.mockResolvedValue({ outcome: 'pending', categories: ['Suggestive'] });

      expect(await service.checkOne(image(), NOW)).toBe('pending');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(storage.copyObject).not.toHaveBeenCalled();
      expect(prisma.profileImageCheck.updateMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1', kind: 'avatar', objectKey: KEY },
        data: { state: 'review', nextAttemptAt: null },
      });
    });
  });

  describe('a failing check', () => {
    it('retries with back-off (60 s, then doubling)', async () => {
      const { service, prisma, checks } = build();
      claimable(prisma);
      checks.checkStoredImage.mockRejectedValue(new Error('Rekognition is down'));

      prisma.profileImageCheck.findUnique.mockResolvedValue({ attempts: 0, objectKey: KEY });
      expect(await service.checkOne(image(), NOW)).toBe('retry');
      expect(prisma.profileImageCheck.updateMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1', kind: 'avatar', objectKey: KEY },
        data: { state: 'retry', attempts: 1, nextAttemptAt: new Date(NOW.getTime() + 60_000) },
      });

      prisma.profileImageCheck.findUnique.mockResolvedValue({ attempts: 2, objectKey: KEY });
      await service.checkOne(image(), NOW);
      expect(prisma.profileImageCheck.updateMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1', kind: 'avatar', objectKey: KEY },
        data: { state: 'retry', attempts: 3, nextAttemptAt: new Date(NOW.getTime() + 240_000) },
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('after the configured number of failures it gives up: the picture stays pending, never approved', async () => {
      const { service, prisma, checks } = build();
      claimable(prisma);
      checks.checkStoredImage.mockRejectedValue(new Error('Rekognition is down'));
      prisma.profileImageCheck.findUnique.mockResolvedValue({ attempts: 4, objectKey: KEY });

      expect(await service.checkOne(image(), NOW)).toBe('gave_up');

      expect(prisma.profileImageCheck.updateMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1', kind: 'avatar', objectKey: KEY },
        data: { state: 'gave_up', attempts: 5, nextAttemptAt: null },
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('the attempt limit and the batch size are the post-media settings (MEDIA_CHECK_MAX_ATTEMPTS / MEDIA_CHECK_BATCH_SIZE)', async () => {
      const { service, prisma, checks } = build({ env: { MEDIA_CHECK_MAX_ATTEMPTS: '2' } });
      claimable(prisma);
      checks.checkStoredImage.mockRejectedValue(new Error('down'));
      prisma.profileImageCheck.findUnique.mockResolvedValue({ attempts: 1, objectKey: KEY });
      expect(await service.checkOne(image(), NOW)).toBe('gave_up'); // 2nd failure of a limit of 2

      const batch = build({ env: { MEDIA_CHECK_BATCH_SIZE: '3' } });
      await batch.service.runDueChecks(NOW);
      const sqlParams = batch.prisma.$queryRaw.mock.calls.map((c) => (c[0] as { values: unknown[] }).values);
      expect(sqlParams.every((v) => v.includes(3))).toBe(true);
    });

    it('a failure never touches a bookkeeping row that belongs to a different (newer) file', async () => {
      const { service, prisma, checks } = build();
      claimable(prisma);
      checks.checkStoredImage.mockRejectedValue(new Error('down'));
      prisma.profileImageCheck.findUnique.mockResolvedValue({ attempts: 0, objectKey: 'private-profile/u1/newer.jpg' });
      expect(await service.checkOne(image(), NOW)).toBe('skipped');
      // The only writes are the claim's own (attempts 0 / lease); no failure state was written for the newer file.
      const writes = prisma.profileImageCheck.updateMany.mock.calls.map((c) => c[0].data);
      expect(writes.filter((d: Record<string, unknown>) => d.state === 'gave_up' || Number(d.attempts) > 0)).toEqual([]);
    });
  });
});

describe('ProfileImageCheckSweepService', () => {
  it('runs a pass and never throws, even if the pass fails', async () => {
    const runDueChecks = jest.fn().mockRejectedValue(new Error('boom'));
    const sweep = new ProfileImageCheckSweepService({ runDueChecks } as unknown as ProfileImageCheckService);
    await expect(sweep.run()).resolves.toBeUndefined();
    expect(runDueChecks).toHaveBeenCalledTimes(1);
  });
});
