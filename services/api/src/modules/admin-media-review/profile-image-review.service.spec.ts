import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaModerationClient } from '../post-media/media-moderation-client';
import { ProfileImagePublishService } from '../users/profile-image-publish.service';
import { ProfileImageViewService } from '../users/profile-image-view.service';
import { UserImageReviewService } from '../users/user-image-review.service';
import { ProfileImageReviewService } from './profile-image-review.service';

// Unit level: id handling, the vetting rule, the "is it waiting for a person" rule, and that Approve / Reject reuse the
// shared publish and reject code. test/profile-image-review.e2e-spec.ts proves the SQL, the paging and the storage
// effects against real Postgres.

const NOW = new Date('2026-11-05T10:00:00Z');
const USER = '9c776b8d-c69f-4862-b8cc-ae7c660cf951';
const FILE = '437ebb39-071c-4d1d-a235-7e7e9f462b77.jpg';
const KEY = `private-profile/${USER}/${FILE}`;
const ID = `avatar:${USER}:${FILE}`;

const userRow = (over: Record<string, unknown> = {}) => ({
  id: USER,
  isMinor: false,
  avatarKey: KEY,
  avatarStatus: 'pending',
  avatarUploadedAt: new Date('2026-11-05T09:58:30Z'),
  coverKey: null,
  coverStatus: null,
  coverUploadedAt: null,
  ...over,
});

function build(opts: { configured?: boolean; user?: Record<string, unknown> | null; check?: Record<string, unknown> | null } = {}) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? userRow() : opts.user),
      findMany: jest.fn().mockResolvedValue([{ id: USER, username: 'ada_l', displayName: 'Ada Lovelace', email: 'must-not-leak@example.com' }]),
    },
    profileImageCheck: {
      findUnique: jest.fn().mockResolvedValue(opts.check === undefined ? { objectKey: KEY, state: 'review' } : opts.check),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const moderation = { isConfigured: opts.configured ?? true };
  const publisher = { publish: jest.fn().mockResolvedValue(true) };
  const review = { rejectProfileImage: jest.fn().mockResolvedValue({}) };
  const view = { signedLink: jest.fn(async (key: string) => `https://view.test/${key}`) };
  const service = new ProfileImageReviewService(
    prisma as unknown as PrismaService,
    moderation as unknown as MediaModerationClient,
    publisher as unknown as ProfileImagePublishService,
    review as unknown as UserImageReviewService,
    view as unknown as ProfileImageViewService,
  );
  return { service, prisma, publisher, review, view };
}

describe('ProfileImageReviewService.get', () => {
  it('shows a waiting picture: public name only, age, a signed link to the private file', async () => {
    const { service, view } = build();
    const item = await service.get(ID, true, NOW);
    expect(item).toMatchObject({
      id: ID,
      type: 'profile_avatar',
      status: 'pending',
      awaitingDecision: true,
      sources: ['auto_check'],
      checkLabels: [],
      sizeBytes: null,
      ageSeconds: 90,
      viewUrl: `https://view.test/${KEY}`,
      uploader: { id: USER, publicName: 'ada_l' },
    });
    expect(view.signedLink).toHaveBeenCalledWith(KEY);
    expect(JSON.stringify(item)).not.toContain('must-not-leak');
  });

  it.each([
    ['a malformed id', 'avatar:nonsense', userRow()],
    ['an unknown user', ID, null],
    ['a replaced picture (the stored file is a different one)', ID, userRow({ avatarKey: `private-profile/${USER}/other.jpg` })],
    ['a kind the user has no picture for', `cover:${USER}:${FILE}`, userRow()],
    ['a picture that is not pending', ID, userRow({ avatarStatus: 'approved', avatarKey: `profile-media/${USER}/${FILE}` })],
  ])('is a 404 for %s', async (_name, id, user) => {
    const { service } = build({ user });
    await expect(service.get(id, true, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it('is a 404 when the check is configured and has not left the picture undecided', async () => {
    for (const check of [null, { objectKey: KEY, state: 'retry' }, { objectKey: 'private-profile/x/old.jpg', state: 'review' }]) {
      await expect(build({ check }).service.get(ID, true, NOW)).rejects.toMatchObject({ status: 404 });
    }
    for (const state of ['review', 'gave_up']) {
      await expect(build({ check: { objectKey: KEY, state } }).service.get(ID, true, NOW)).resolves.toMatchObject({ id: ID });
    }
  });

  it('with the check not configured every pending picture is in the queue, with or without bookkeeping', async () => {
    const { service, prisma } = build({ configured: false, check: null });
    await expect(service.get(ID, true, NOW)).resolves.toMatchObject({ id: ID });
    expect(prisma.profileImageCheck.findUnique).not.toHaveBeenCalled();
  });

  it('a minor\'s picture is a 404 for an admin who is not vetted, the same as a missing one', async () => {
    const hidden = build({ user: userRow({ isMinor: true }) });
    await expect(hidden.service.get(ID, false, NOW)).rejects.toMatchObject({ status: 404, response: { code: 'media_not_found' } });
    await expect(hidden.service.get(ID, true, NOW)).resolves.toMatchObject({ id: ID });
  });
});

describe('ProfileImageReviewService.approve', () => {
  it('publishes with the shared publish code, on the key the moderator was shown, then clears the bookkeeping', async () => {
    const { service, publisher, prisma } = build();
    await expect(service.approve(ID, true)).resolves.toEqual({ id: ID, outcome: 'approved', status: 'approved' });
    expect(publisher.publish).toHaveBeenCalledWith({ userId: USER, kind: 'avatar', key: KEY });
    expect(prisma.profileImageCheck.deleteMany).toHaveBeenCalledWith({ where: { userId: USER, kind: 'avatar' } });
  });

  it('fails closed with a retryable 503 when publishing throws, and records nothing', async () => {
    const { service, publisher, prisma } = build();
    publisher.publish.mockRejectedValue(new Error('copy failed'));
    await expect(service.approve(ID, true)).rejects.toMatchObject({ status: 503, response: { code: 'media_publish_failed' } });
    expect(prisma.profileImageCheck.deleteMany).not.toHaveBeenCalled();
  });

  it('a picture replaced or decided while the copy was made (publish returns false) is a 409', async () => {
    const { service, publisher } = build();
    publisher.publish.mockResolvedValue(false);
    await expect(service.approve(ID, true)).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
  });

  it('a decided picture is a 409 and is never published again', async () => {
    const { service, publisher } = build({ user: userRow({ avatarStatus: 'rejected' }) });
    await expect(service.approve(ID, true)).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('a picture the check is still handling is a 409 not_in_review_queue and is not published', async () => {
    const { service, publisher } = build({ check: { objectKey: KEY, state: 'retry' } });
    await expect(service.approve(ID, true)).rejects.toMatchObject({ status: 409, response: { code: 'not_in_review_queue' } });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('a minor\'s picture is a 404 for an admin who is not vetted and is not published', async () => {
    const { service, publisher } = build({ user: userRow({ isMinor: true }) });
    await expect(service.approve(ID, false)).rejects.toMatchObject({ status: 404 });
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

describe('ProfileImageReviewService.reject', () => {
  it('rejects through the shared reject code, passing the key the moderator was shown', async () => {
    const { service, review, prisma } = build();
    await expect(service.reject(ID, true, 'Too dark to see')).resolves.toEqual({
      id: ID,
      outcome: 'rejected',
      status: 'rejected',
      userId: USER,
      kind: 'avatar',
    });
    expect(review.rejectProfileImage).toHaveBeenCalledWith(USER, 'avatar', 'Too dark to see', KEY);
    expect(prisma.profileImageCheck.deleteMany).toHaveBeenCalled();
  });

  it('maps "already rejected" to 409 and "replaced under the call" to 404', async () => {
    const conflict = build();
    conflict.review.rejectProfileImage.mockRejectedValue(new ConflictException('This avatar has already been rejected'));
    await expect(conflict.service.reject(ID, true, 'x')).rejects.toMatchObject({ status: 409, response: { code: 'already_decided' } });
    expect(conflict.prisma.profileImageCheck.deleteMany).not.toHaveBeenCalled();

    const gone = build();
    gone.review.rejectProfileImage.mockRejectedValue(new NotFoundException('This user has no avatar to reject'));
    await expect(gone.service.reject(ID, true, 'x')).rejects.toMatchObject({ status: 404 });
  });

  it('passes any other failure through (for example a take-down that could not be done)', async () => {
    const { service, review } = build();
    const failure = new Error('storage down');
    review.rejectProfileImage.mockRejectedValue(failure);
    await expect(service.reject(ID, true, 'x')).rejects.toBe(failure);
  });

  it('a decided picture is a 409 and the reject code is never called', async () => {
    const { service, review } = build({ user: userRow({ avatarStatus: 'rejected' }) });
    await expect(service.reject(ID, true, 'x')).rejects.toMatchObject({ status: 409 });
    expect(review.rejectProfileImage).not.toHaveBeenCalled();
  });
});

describe('ProfileImageReviewService.listCandidates', () => {
  const sqlOf = (prisma: ReturnType<typeof build>['prisma']) => prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };

  it('selects pending avatars and covers the check left undecided, or all pending ones when the check is off', async () => {
    const on = build({ configured: true });
    await on.service.listCandidates({ order: 'newest', limit: 21, vetted: true });
    const q = sqlOf(on.prisma);
    expect(q.sql).toContain(`"avatarStatus" = 'pending'`);
    expect(q.sql).toContain(`"coverStatus" = 'pending'`);
    expect(q.sql).toContain(`c."state" IN ('review', 'gave_up')`);
    expect(q.sql).toContain('DESC');
    expect(q.values).toContain(false); // unconfigured = false
    expect(q.values).toContain(21);

    const off = build({ configured: false });
    await off.service.listCandidates({ order: 'oldest', limit: 5, vetted: false });
    const o = sqlOf(off.prisma);
    expect(o.values).toContain(true); // unconfigured = true
    expect(o.sql).toContain('ASC');
    expect(o.sql).toContain(`"isMinor" = false`);
  });

  it('adds the position condition only when it is given', async () => {
    const none = build();
    await none.service.listCandidates({ order: 'newest', limit: 3, vetted: true });
    expect(sqlOf(none.prisma).sql).not.toContain(`t."sortAt" <`);
    const some = build();
    await some.service.listCandidates({ order: 'newest', limit: 3, vetted: true, after: { at: 1762336800000, id: `avatar:${USER}` } });
    expect(sqlOf(some.prisma).sql).toContain(`t."sortAt" <`);
    expect(sqlOf(some.prisma).values).toContainEqual(new Date(1762336800000));
  });

  it('positionOf maps an unknown age to the epoch', () => {
    expect(ProfileImageReviewService.positionOf({ kind: 'cover', userId: USER, key: KEY, uploadedAt: null })).toEqual({ at: 0, id: `cover:${USER}` });
    expect(ProfileImageReviewService.positionOf({ kind: 'avatar', userId: USER, key: KEY, uploadedAt: new Date(5000) })).toEqual({
      at: 5000,
      id: `avatar:${USER}`,
    });
  });
});
