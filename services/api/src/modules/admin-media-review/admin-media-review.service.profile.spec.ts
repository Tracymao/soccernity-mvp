import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { PostMediaConfig } from '../post-media/post-media.config';
import { PostMediaDecisionService } from '../post-media/post-media-decision.service';
import { AdminMediaReviewService } from './admin-media-review.service';
import { decodeMediaReviewPosition, encodeMediaReviewPosition } from './media-review.cursor';
import { ProfileImageReviewService, ProfileQueueRow } from './profile-image-review.service';

// B-037: the merge of post media and profile pictures into one list with one cursor, and the routing of get / approve /
// reject by id. (admin-media-review.service.spec.ts is the unchanged post-media spec: it builds the service WITHOUT a
// profile queue, which must behave exactly as before.)

const NOW = new Date('2026-11-05T10:00:00Z');
const t = (minute: number) => new Date(Date.UTC(2026, 10, 5, 9, minute));
const USER = '9c776b8d-c69f-4862-b8cc-ae7c660cf951';

const postRow = (id: string, sequence: number, at: Date) => ({
  id,
  sequence,
  kind: 'image',
  contentType: 'image/jpeg',
  byteSize: 10,
  durationSeconds: null,
  status: 'pending',
  decisionSource: null,
  decidedAt: null,
  rejectionReason: null,
  checkLabels: [],
  privateKey: `private-media/u/${id}.jpg`,
  publishedAt: null,
  publicKey: `post-media/u/${id}.jpg`,
  postId: null,
  confirmedAt: at,
  createdAt: at,
  reviewEnteredAt: at,
  reviewEntrySource: 'auto_check',
  reportCount: 0,
  hiddenPendingReview: false,
  uploader: { id: 'u', username: 'ada_l', displayName: 'Ada' },
  _count: { reports: 0 },
  reports: [],
});

const profileRow = (kind: 'avatar' | 'cover', userId: string, at: Date | null): ProfileQueueRow => ({
  kind,
  userId,
  key: `private-profile/${userId}/f-${kind}.jpg`,
  uploadedAt: at,
});

function build(opts: { posts?: unknown[]; profiles?: ProfileQueueRow[]; vetted?: boolean } = {}) {
  const prisma = {
    postMedia: { findMany: jest.fn().mockResolvedValue(opts.posts ?? []), findFirst: jest.fn() },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? true }) },
  };
  const profileImages = {
    listCandidates: jest.fn().mockResolvedValue(opts.profiles ?? []),
    toItems: jest.fn(async (rows: ProfileQueueRow[]) =>
      rows.map((r) => ({ id: `${r.kind}:${r.userId}:f-${r.kind}.jpg`, type: r.kind === 'avatar' ? 'profile_avatar' : 'profile_cover' })),
    ),
    get: jest.fn().mockResolvedValue({ id: 'profile-item' }),
    approve: jest.fn().mockResolvedValue({ id: 'x', outcome: 'approved', status: 'approved' }),
    reject: jest
      .fn()
      .mockResolvedValue({ id: 'x', outcome: 'rejected', status: 'rejected', userId: USER, kind: 'avatar' }),
  };
  const decisions = { approve: jest.fn(), reject: jest.fn() };
  const actionLog = { record: jest.fn().mockResolvedValue({}) };
  const service = new AdminMediaReviewService(
    prisma as unknown as PrismaService,
    { createDownloadUrl: jest.fn(async () => 'https://view.test/x') } as unknown as DirectUploadStorageService,
    decisions as unknown as PostMediaDecisionService,
    actionLog as unknown as AdminActionLogService,
    new PostMediaConfig(new ConfigService({})),
    { now: () => NOW },
    profileImages as unknown as ProfileImageReviewService,
  );
  return { service, prisma, profileImages, decisions, actionLog };
}

const ids = (page: { items: Array<{ id: string }> }) => page.items.map((i) => i.id);

describe('AdminMediaReviewService.list with profile pictures', () => {
  it('merges the two streams by upload time, newest first; ties go to post media', async () => {
    const { service } = build({
      posts: [postRow('p2', 20, t(5)), postRow('p1', 10, t(1))],
      profiles: [profileRow('avatar', 'ua', t(5)), profileRow('cover', 'uc', t(3)), profileRow('avatar', 'ub', null)],
    });
    const page = await service.list({ limit: 20 }, 'a1');
    expect(ids(page)).toEqual(['p2', 'avatar:ua:f-avatar.jpg', 'cover:uc:f-cover.jpg', 'p1', 'avatar:ub:f-avatar.jpg']);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({ type: 'post_media' });
  });

  it('oldest first is the mirror image, with the unknown age first', async () => {
    const { service } = build({
      posts: [postRow('p1', 10, t(1)), postRow('p2', 20, t(5))],
      profiles: [profileRow('avatar', 'ub', null), profileRow('cover', 'uc', t(3))],
    });
    const page = await service.list({ limit: 20, order: 'oldest' }, 'a1');
    expect(ids(page)).toEqual(['avatar:ub:f-avatar.jpg', 'p1', 'cover:uc:f-cover.jpg', 'p2']);
  });

  it('asks each stream for limit+1 and builds a cursor holding BOTH positions when there is more', async () => {
    const { service, profileImages, prisma } = build({
      posts: [postRow('p3', 30, t(9)), postRow('p2', 20, t(7)), postRow('p1', 10, t(1))],
      profiles: [profileRow('avatar', 'ua', t(8)), profileRow('cover', 'uc', t(2))],
    });
    const page = await service.list({ limit: 3 }, 'a1');
    expect(ids(page)).toEqual(['p3', 'avatar:ua:f-avatar.jpg', 'p2']);
    expect(prisma.postMedia.findMany.mock.calls[0][0].take).toBe(4);
    expect(profileImages.listCandidates).toHaveBeenCalledWith({ order: 'newest', after: undefined, limit: 4, vetted: true });
    expect(decodeMediaReviewPosition(page.nextCursor as string)).toEqual({
      sequence: 20,
      profile: { at: t(8).getTime(), id: 'avatar:ua' },
    });
  });

  it('resumes each stream from its own position; a stream not reached yet keeps no position', async () => {
    const { service, profileImages, prisma } = build({ posts: [postRow('p1', 10, t(1))] });
    const cursor = encodeMediaReviewPosition({ sequence: 20, profile: { at: t(8).getTime(), id: 'avatar:ua' } });
    await service.list({ limit: 5, cursor }, 'a1');
    expect(prisma.postMedia.findMany.mock.calls[0][0].where.AND).toContainEqual({ sequence: { lt: 20 } });
    expect(profileImages.listCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ after: { at: t(8).getTime(), id: 'avatar:ua' } }),
    );

    // a page taken only from the profile stream keeps the post position it started with (none) -> no `sequence`
    const onlyProfile = build({ profiles: [profileRow('avatar', 'ua', t(8)), profileRow('cover', 'uc', t(7))] });
    const page = await onlyProfile.service.list({ limit: 1 }, 'a1');
    expect(decodeMediaReviewPosition(page.nextCursor as string)).toEqual({ profile: { at: t(8).getTime(), id: 'avatar:ua' } });
  });

  it('leaves profile pictures out unless the status is pending and the source is the automatic check (or any)', async () => {
    for (const query of [{ status: 'approved' }, { status: 'rejected' }, { source: 'user_report' }] as const) {
      const { service, profileImages } = build();
      await service.list({ ...query }, 'a1');
      expect(profileImages.listCandidates).not.toHaveBeenCalled();
    }
    for (const query of [{}, { status: 'pending' }, { source: 'auto_check' }] as const) {
      const { service, profileImages } = build();
      await service.list({ ...query }, 'a1');
      expect(profileImages.listCandidates).toHaveBeenCalledTimes(1);
    }
  });

  it('passes the vetting result down so an unvetted admin never gets a minor\'s picture', async () => {
    const { service, profileImages } = build({ vetted: false });
    await service.list({}, 'a1');
    expect(profileImages.listCandidates).toHaveBeenCalledWith(expect.objectContaining({ vetted: false }));
  });
});

describe('AdminMediaReviewService by id with profile pictures', () => {
  const ID = `avatar:${USER}:f-avatar.jpg`;
  const POST = '3b241101-e2bb-4255-8caf-4136c566a962';

  it('routes a profile id to the profile queue and a UUID to post media', async () => {
    const { service, profileImages, prisma } = build({ vetted: false });
    await service.get(ID, 'a1');
    expect(profileImages.get).toHaveBeenCalledWith(ID, false, NOW);
    expect(prisma.postMedia.findFirst).not.toHaveBeenCalled();

    prisma.postMedia.findFirst.mockResolvedValue(null);
    await expect(service.get(POST, 'a1')).rejects.toMatchObject({ status: 404 });
    expect(profileImages.get).toHaveBeenCalledTimes(1);
  });

  it('approve writes ONE audit row: media.approved, target type profile_image, target the PERSON, the kind in the note', async () => {
    const { service, profileImages, actionLog, decisions } = build({ vetted: true });
    await service.approve(ID, 'a1');
    expect(profileImages.approve).toHaveBeenCalledWith(ID, true);
    expect(actionLog.record).toHaveBeenCalledTimes(1);
    expect(actionLog.record).toHaveBeenCalledWith('a1', 'media.approved', 'profile_image', USER, 'avatar');
    expect(decisions.approve).not.toHaveBeenCalled();
  });

  it('reject writes ONE audit row with the reason, and returns the plain decision result', async () => {
    const { service, profileImages, actionLog } = build();
    const result = await service.reject(ID, 'a1', 'Too dark to see');
    expect(profileImages.reject).toHaveBeenCalledWith(ID, true, 'Too dark to see');
    expect(result).toEqual({ id: 'x', outcome: 'rejected', status: 'rejected' });
    expect(actionLog.record).toHaveBeenCalledTimes(1);
    expect(actionLog.record).toHaveBeenCalledWith('a1', 'media.rejected', 'profile_image', USER, 'avatar: Too dark to see');
  });

  it('writes NO audit row when the decision failed', async () => {
    const { service, profileImages, actionLog } = build();
    profileImages.approve.mockRejectedValue(new Error('409'));
    profileImages.reject.mockRejectedValue(new Error('404'));
    await expect(service.approve(ID, 'a1')).rejects.toThrow('409');
    await expect(service.reject(ID, 'a1', 'x')).rejects.toThrow('404');
    expect(actionLog.record).not.toHaveBeenCalled();
  });

  it('post media decisions are untouched: a UUID still goes through the post-media decision service', async () => {
    const { service, decisions, actionLog, prisma } = build();
    prisma.postMedia.findFirst.mockResolvedValue(null);
    decisions.approve.mockResolvedValue({ id: POST, outcome: 'approved', status: 'approved' });
    await service.approve(POST, 'a1');
    expect(decisions.approve).toHaveBeenCalledWith(POST, 'a1');
    expect(actionLog.record).toHaveBeenCalledWith('a1', 'media.approved', 'post_media', POST, undefined);
  });
});
