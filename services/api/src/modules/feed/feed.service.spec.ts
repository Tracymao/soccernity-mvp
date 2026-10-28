import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeFeedSequenceCursor } from './cursor.util';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE } from './dto/feed-query.dto';
import {
  awardEngagementPoints,
  revokeEngagementPoints,
  revokeEngagementPointsForPost,
} from '../points/engagement-points.util';
import { FeedService, visibleToViewer } from './feed.service';
import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';

// backend/w12-points (B-093): the baseline points engine has its own unit spec (engagement-points.util.spec.ts)
// and a real-Postgres e2e. FeedService is tested here for WHEN it calls the engine, so the engine is mocked.
jest.mock('../points/engagement-points.util', () => ({
  awardEngagementPoints: jest.fn().mockResolvedValue({ giver: 'awarded', receiver: 'awarded' }),
  revokeEngagementPoints: jest.fn().mockResolvedValue(undefined),
  revokeEngagementPointsForPost: jest.fn().mockResolvedValue(0),
}));

beforeEach(() => {
  (awardEngagementPoints as jest.Mock).mockClear();
  (revokeEngagementPoints as jest.Mock).mockClear();
  (revokeEngagementPointsForPost as jest.Mock).mockClear();
});

// B-039: every post/comment/saved-post read is additionally scoped to authors
// with no block (either direction) against the viewer.
function notBlockedWith(viewerId: string) {
  return {
    blockedBy: { none: { blockerId: viewerId } },
    blocksMade: { none: { blockedId: viewerId } },
  };
}
const notBlockedAuthor = (viewerId: string) => ({ author: { is: notBlockedWith(viewerId) } });

// backend/w7-contest (B-091): the service reads time through an injectable clock, so the contest's
// read gates have an exact instant to assert against.
const FIXED_NOW = new Date('2026-08-15T12:00:00.000Z');
const FIXED_CLOCK = { now: () => new Date(FIXED_NOW) };
// A final contest entry is a 404 to everyone but its author until the reveal (Post.visibleFrom).
// ...and (backend/w14-post-media-pipeline) to everyone but its author while any of its uploaded media is unapproved.
const visibleTo = (viewerId: string) => ({
  AND: [
    { OR: [{ visibleFrom: null }, { visibleFrom: { lte: FIXED_NOW } }, { authorId: viewerId }] },
    { OR: [{ authorId: viewerId }, POST_MEDIA_ALL_APPROVED] },
  ],
});
// GET /posts/feed omits a final entry until the pin is removed (Post.communityFeedFrom).
const inCommunityFeed = { OR: [{ communityFeedFrom: null }, { communityFeedFrom: { lte: FIXED_NOW } }] };

function buildPrismaMock() {
  const prisma = {
    post: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      // getPostById uses findFirst (not findUnique) so the active-author
      // relation filter can apply — Decision Log #221.
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    like: {
      create: jest.fn(),
      // findUnique / findMany default to "no row" / "no rows" so every
      // existing getFeed / getPostById test keeps passing without having
      // to stub the viewer-state lookups added for Decision Log #153 —
      // tests that DO care about isLiked override these.
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      // backend/w12-points: syncCommentPoints counts the author's remaining visible comments.
      count: jest.fn().mockResolvedValue(0),
    },
    // backend/w14-post-media-pipeline: createPost loads the media it attaches; deletePost reads the keys
    // of the files to remove. Both default to "none".
    postMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    savedPost: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    // sprint-4/post-view-tracking: recordView() creates a PostView row.
    // Only `create` is exercised (there's no findUnique/delete path — see
    // recordView()'s own comment for why P2002 is caught rather than
    // pre-checked).
    postView: {
      create: jest.fn(),
    },
    // Decision Log #153: getFeed / getPostById now resolve
    // author.isFollowing from the caller's Follow rows. Same default-to-
    // empty rationale as `like` above.
    follow: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    // Added for notification wiring (sprint-2/follow-and-notifications):
    // likePost/addComment now call tx.notification.create(...) inside
    // their existing transactional callbacks. Every test in this file
    // that exercises either method runs through this same mock, whether
    // or not it cares about notifications — so this must exist
    // unconditionally, not just in the tests added for this PR.
    // B-197 (Decision Log #411 item 5): the notification triggers check for a Block
    // between actor and recipient inside their transaction.
    block: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    notification: {
      create: jest.fn(),
    },
    // sprint-2/contest-data-model-backend (Decision Log #219): createPost
    // and likePost now write a baseline-engagement PointsLedgerEntry
    // inside their transaction callbacks (via awardPoints). Every test
    // that exercises either runs through this mock whether or not it
    // asserts on points, so it must exist unconditionally.
    pointsLedgerEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Decision Log #128: awardPoints snapshots the caller's represented club
    // from the user row inside the same transaction.
    user: {
      findUnique: jest.fn().mockResolvedValue({ representedClubId: null }),
    },
    // sprint-4/trending-topics-backend: createPost also extracts and
    // records hashtags inside the same transaction (via
    // recordPostHashtags, search/hashtag.util.ts). Every createPost test
    // runs through this mock whether or not it asserts on hashtags, so
    // both must exist unconditionally, same as pointsLedgerEntry above.
    hashtag: {
      upsert: jest.fn().mockResolvedValue({ id: 'hashtag-1' }),
      // DELETE /posts/:id decrements Hashtag.postCount per linked tag.
      updateMany: jest.fn(),
    },
    // backend/w7-contest (B-091): likes / comments / comment removals look up whether the post is a
    // contest entry (loadContestEntryForPost) and, if so, write the contest's engagement row. Every
    // existing test is about an ordinary post, so the default is 'not an entry'.
    contestEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    contestEngagement: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    postHashtag: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  // FeedService uses interactive transactions ($transaction(async (tx)
  // => ...)), not the array form — see likePost()'s own comment for why.
  // The mock simply invokes the callback with the same top-level mock
  // object standing in for `tx` (this module's tests don't need a
  // distinct transaction-scoped client), so normal await/throw control
  // flow inside the callback behaves exactly as it would against a real
  // interactive transaction: a rejection from an earlier statement
  // prevents any later statement in the same callback from ever running.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );

  return prisma;
}

const AUTHOR = { id: 'author-1', username: null as string | null, displayName: 'Author One' };

// What the API returns for a row: the embedded author is { id, publicName } only.
function asView<T extends { author: { id: string; username: string | null; displayName: string } }>(row: T) {
  return {
    ...row,
    author: { id: row.author.id, publicName: row.author.username ?? 'Soccernity member' },
    // backend/w7-contest: an ordinary post carries no contest label.
    contest: null,
    // backend/media-privacy-vetting-followups (B-259): { id, kind } per attached file; the raw publicUrl used
    // to order them is not part of the payload.
    // Only POST rows carry files (a comment row has no mediaUrls and no media).
    ...('mediaUrls' in row
      ? { media: ((row as { media?: Array<{ id: string; kind: string }> }).media ?? []).map((m) => ({ id: m.id, kind: m.kind })) }
      : {}),
  };
}

function buildPostRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    // Default sequence for a single-row fixture — irrelevant unless a
    // test builds multiple rows to exercise ordering/cursor behavior, in
    // which case each row overrides it explicitly (see the getFeed /
    // getClubFeed pagination tests below).
    sequence: 1,
    authorId: 'author-1',
    author: AUTHOR,
    contentText: 'Great match today',
    mediaUrls: [],
    media: [] as Array<{ id: string; kind: string; publicUrl: string | null }>,
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('FeedService', () => {
  describe('createPost', () => {
    it('creates a post scoped to the given authorId, never trusting a body-supplied one', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow();
      (prisma.post.create as jest.Mock).mockResolvedValue(row);

      const service = new FeedService(prisma, FIXED_CLOCK);
      const result = await service.createPost('author-1', { contentText: 'Great match today' });

      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          authorId: 'author-1',
          contentText: 'Great match today',
          mediaUrls: [],
          clubPageId: undefined,
          banterRoomId: undefined,
        },
        select: expect.objectContaining({ contentText: true, author: expect.anything() }),
      });
      expect(result).toEqual(asView(row));
    });

    // backend/w14-post-media-pipeline (Decision Log #419): media comes only from the caller's own uploads.
    describe('with uploaded media (mediaIds)', () => {
      const MEDIA = [
        { id: 'm1', kind: 'image', publicUrl: 'https://cdn.test/post-media/author-1/m1.jpg' },
        { id: 'm2', kind: 'image', publicUrl: 'https://cdn.test/post-media/author-1/m2.jpg' },
      ];

      it("stores the uploads' public URLs on the post (in the caller's order) and attaches the files inside the same transaction", async () => {
        const prisma = buildPrismaMock();
        (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([MEDIA[1], MEDIA[0]]);
        (prisma.postMedia.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
        (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow({ id: 'post-9' }));
        // The create runs BEFORE the attach, so a post with files is re-read afterwards to carry them.
        (prisma.post as unknown as { findUniqueOrThrow: jest.Mock }).findUniqueOrThrow = jest.fn().mockResolvedValue(
          buildPostRow({ id: 'post-9', mediaUrls: [MEDIA[0].publicUrl, MEDIA[1].publicUrl], media: [MEDIA[1], MEDIA[0]] }),
        );

        const created = await new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'two pics', mediaIds: ['m1', 'm2'] });
        // B-259: the payload lists the files as { id, kind }, in the order of mediaUrls (the caller's order).
        expect(created.media).toEqual([
          { id: 'm1', kind: 'image' },
          { id: 'm2', kind: 'image' },
        ]);

        expect((prisma.post.create as jest.Mock).mock.calls[0][0].data.mediaUrls).toEqual([MEDIA[0].publicUrl, MEDIA[1].publicUrl]);
        expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['m1', 'm2'] }, uploaderId: 'author-1', postId: null, uploadState: 'ready', status: { not: 'rejected' } },
          data: { postId: 'post-9' },
        });
        // loaded for THIS author only
        expect((prisma.postMedia.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({ uploaderId: 'author-1', postId: null });
      });

      it('refuses (400) before any write when a file is not attachable', async () => {
        const prisma = buildPrismaMock();
        (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([MEDIA[0]]); // m2 missing
        await expect(
          new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'x', mediaIds: ['m1', 'm2'] }),
        ).rejects.toMatchObject({ status: 400, response: { code: 'media_not_attachable' } });
        expect(prisma.post.create).not.toHaveBeenCalled();
      });

      it('rolls the post back (throws) when a concurrent post took a file first', async () => {
        const prisma = buildPrismaMock();
        (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(MEDIA);
        (prisma.postMedia.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow());
        await expect(
          new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'x', mediaIds: ['m1', 'm2'] }),
        ).rejects.toMatchObject({ status: 400, response: { code: 'media_not_attachable' } });
      });

      it('the contest final entry demands exactly one VIDEO', async () => {
        const prisma = buildPrismaMock();
        (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([MEDIA[0]]); // an image
        await expect(
          new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'x', mediaIds: ['m1'] }, { singleVideoOnly: true }),
        ).rejects.toMatchObject({ response: { code: 'final_entry_needs_one_video' } });
        expect(prisma.post.create).not.toHaveBeenCalled();
      });

      it('a post with no mediaIds never touches the media table', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow());
        await new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'plain' });
        expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
        expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
      });
    });

    it('awards no points for creating a post (B-094, Decision Log #382)', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow({ id: 'post-77', createdAt: new Date('2026-08-09T10:00:00.000Z') });
      (prisma.post.create as jest.Mock).mockResolvedValue(row);

      const service = new FeedService(prisma, FIXED_CLOCK);
      await service.createPost('author-1', { contentText: 'Great match today' });

      expect((prisma as unknown as { pointsLedgerEntry: { createMany: jest.Mock } }).pointsLedgerEntry.createMany).not.toHaveBeenCalled();
    });

    it('leaves likeCount and commentCount untouched (schema default 0) — this slice never creates a Like or Comment', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow({ likeCount: 0, commentCount: 0 });
      (prisma.post.create as jest.Mock).mockResolvedValue(row);

      const service = new FeedService(prisma, FIXED_CLOCK);
      const result = await service.createPost('author-1', { contentText: 'Hello' });

      const callArgs = (prisma.post.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('likeCount');
      expect(callArgs.data).not.toHaveProperty('commentCount');
      expect(result.likeCount).toBe(0);
      expect(result.commentCount).toBe(0);
    });

    it('rejects a post with both clubPageId and banterRoomId set, without calling Prisma', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(
        service.createPost('author-1', {
          contentText: 'Cross-posted',
          clubPageId: 'club-1',
          banterRoomId: 'room-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('allows a post with only clubPageId set', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow({ clubPageId: 'club-1' }));
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(
        service.createPost('author-1', { contentText: 'Club post', clubPageId: 'club-1' }),
      ).resolves.toMatchObject({ clubPageId: 'club-1' });
    });

    // sprint-4/trending-topics-backend — recordPostHashtags is called
    // from inside this same transaction (search/hashtag.util.ts). These
    // tests exercise that call through the real, unmocked util function
    // (only PrismaService is mocked) rather than mocking the util away,
    // matching this file's own established style of testing FeedService
    // end to end against a mocked Prisma client.
    describe('hashtag extraction', () => {
      it('extracts every distinct #hashtag from contentText, lowercased, and records one PostHashtag row per tag', async () => {
        const prisma = buildPrismaMock();
        const row = buildPostRow({
          id: 'post-42',
          contentText: 'Big win for #Chelsea today, #CHELSEA fans go wild! Also #epl news.',
          createdAt: new Date('2026-08-09T10:00:00.000Z'),
        });
        (prisma.post.create as jest.Mock).mockResolvedValue(row);
        (prisma.hashtag.upsert as jest.Mock)
          .mockResolvedValueOnce({ id: 'hashtag-chelsea' })
          .mockResolvedValueOnce({ id: 'hashtag-epl' });

        const service = new FeedService(prisma, FIXED_CLOCK);
        await service.createPost('author-1', { contentText: row.contentText });

        // "#Chelsea" and "#CHELSEA" both normalize to the same lowercase
        // tag and are de-duplicated to ONE upsert call — see
        // hashtag.util.ts's own extractHashtags() comment on why this
        // dedupe happens before any Prisma call, not via a P2002 catch.
        expect(prisma.hashtag.upsert).toHaveBeenCalledTimes(2);
        expect(prisma.hashtag.upsert).toHaveBeenNthCalledWith(1, {
          where: { tag: 'chelsea' },
          create: { tag: 'chelsea', postCount: 1 },
          update: { postCount: { increment: 1 } },
          select: { id: true },
        });
        expect(prisma.hashtag.upsert).toHaveBeenNthCalledWith(2, {
          where: { tag: 'epl' },
          create: { tag: 'epl', postCount: 1 },
          update: { postCount: { increment: 1 } },
          select: { id: true },
        });

        expect(prisma.postHashtag.create).toHaveBeenCalledTimes(2);
        expect(prisma.postHashtag.create).toHaveBeenNthCalledWith(1, {
          data: { postId: 'post-42', hashtagId: 'hashtag-chelsea', createdAt: row.createdAt },
        });
        expect(prisma.postHashtag.create).toHaveBeenNthCalledWith(2, {
          data: { postId: 'post-42', hashtagId: 'hashtag-epl', createdAt: row.createdAt },
        });
      });

      it('records the PostHashtag row at the POST\'s own createdAt, never at write time', async () => {
        const prisma = buildPrismaMock();
        const postCreatedAt = new Date('2020-01-01T00:00:00.000Z');
        (prisma.post.create as jest.Mock).mockResolvedValue(
          buildPostRow({ id: 'post-1', contentText: '#throwback', createdAt: postCreatedAt }),
        );

        const service = new FeedService(prisma, FIXED_CLOCK);
        await service.createPost('author-1', { contentText: '#throwback' });

        const callArgs = (prisma.postHashtag.create as jest.Mock).mock.calls[0][0];
        expect(callArgs.data.createdAt).toEqual(postCreatedAt);
      });

      it('is a correct, cheap no-op for a post with no hashtags at all', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.create as jest.Mock).mockResolvedValue(
          buildPostRow({ contentText: 'No tags here' }),
        );

        const service = new FeedService(prisma, FIXED_CLOCK);
        await service.createPost('author-1', { contentText: 'No tags here' });

        expect(prisma.hashtag.upsert).not.toHaveBeenCalled();
        expect(prisma.postHashtag.create).not.toHaveBeenCalled();
      });

      it('ignores a pathologically long "word" rather than recording it as a hashtag (HASHTAG_MAX_TAG_LENGTH)', async () => {
        const prisma = buildPrismaMock();
        const longTag = `#${'a'.repeat(51)}`;
        (prisma.post.create as jest.Mock).mockResolvedValue(
          buildPostRow({ contentText: `${longTag} #ok` }),
        );

        const service = new FeedService(prisma, FIXED_CLOCK);
        await service.createPost('author-1', { contentText: `${longTag} #ok` });

        expect(prisma.hashtag.upsert).toHaveBeenCalledTimes(1);
        expect(prisma.hashtag.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { tag: 'ok' } }),
        );
      });
    });

    it('maps a foreign-key violation (invalid clubPageId/banterRoomId) to a 400, not a 500', async () => {
      const prisma = buildPrismaMock();
      const fkError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      (prisma.post.create as jest.Mock).mockRejectedValue(fkError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(
        service.createPost('author-1', { contentText: 'Bad club', clubPageId: 'does-not-exist' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rethrows an unrelated Prisma error rather than swallowing it as a 400', async () => {
      const prisma = buildPrismaMock();
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.create as jest.Mock).mockRejectedValue(otherError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.createPost('author-1', { contentText: 'x' })).rejects.toBe(otherError);
    });

    it("never selects the author's passwordHash", async () => {
      const prisma = buildPrismaMock();
      (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow());
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.createPost('author-1', { contentText: 'x' });

      const callArgs = (prisma.post.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.author.select).not.toHaveProperty('isMinor');
    });
  });

  describe('getFeed', () => {
    it('scopes to the caller\'s own posts plus posts by users they follow, all AND-ed with an active-author filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      // Decision Log #221: deactivated/pending_deletion authors are
      // excluded — the scope filter is now
      // (active author) AND (own posts OR followed authors).
      // B-039: wrapped once more with the block filter (either direction).
      expect(callArgs.where).toEqual({
        AND: [
          {
            AND: [
              { author: { accountStatus: { in: ['active', 'deleted'] } } },
              {
                OR: [
                  { authorId: 'user-1' },
                  { author: { followedBy: { some: { followerId: 'user-1' } } } },
                ],
              },
              // backend/w7-contest: a final contest entry is not a normal Community-feed post.
              inCommunityFeed,
            ],
          },
          notBlockedAuthor('user-1'),
          visibleTo('user-1'),
        ],
      });
    });

    it('orders most-recent-first, keyed on (createdAt, sequence) — NOT id, a random UUID unrelated to insertion order', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { sequence: 'desc' }]);
      expect(callArgs.select).toHaveProperty('sequence', true);
    });

    it('defaults to a page size of FEED_DEFAULT_PAGE_SIZE, requesting one extra row', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.take).toBe(FEED_DEFAULT_PAGE_SIZE + 1);
    });

    it('clamps a limit above FEED_MAX_PAGE_SIZE even if the DTO boundary is bypassed', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('user-1', { limit: 9999 });

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.take).toBe(FEED_MAX_PAGE_SIZE + 1);
    });

    it('returns nextCursor: null and all rows when fewer rows than the limit exist', async () => {
      const prisma = buildPrismaMock();
      const rows = [buildPostRow({ id: 'post-1' }), buildPostRow({ id: 'post-2' })];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getFeed('user-1', { limit: 10 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra lookahead row when more rows exist than the limit', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'post-3', sequence: 3, createdAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildPostRow({ id: 'post-2', sequence: 2, createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildPostRow({ id: 'post-1', sequence: 1, createdAt: new Date('2026-08-01T00:00:00.000Z') }), // lookahead row
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getFeed('user-1', { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.items.map((p) => p.id)).toEqual(['post-3', 'post-2']);
      expect(page.nextCursor).toBe(
        encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 }),
      );
      // `sequence` exists purely to build the cursor above — it must
      // never leak into the actual response payload (see
      // POST_SELECT_WITH_SEQUENCE's own comment in feed.service.ts).
      expect(page.items[0]).not.toHaveProperty('sequence');
      expect(page.items[1]).not.toHaveProperty('sequence');
    });

    it('applies a cursor filter (createdAt < cursor OR createdAt = cursor AND sequence < cursor.sequence) when a cursor is given — NOT id, which was never monotonic', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);
      const cursor = encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 });

      await service.getFeed('user-1', { cursor });

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.AND).toHaveLength(3);
      expect(callArgs.where.AND[1]).toEqual(notBlockedAuthor('user-1'));
      expect(callArgs.where.AND[2]).toEqual(visibleTo('user-1'));
      expect(callArgs.where.AND[0].AND).toHaveLength(2);
      expect(callArgs.where.AND[0].AND[1]).toEqual({
        OR: [
          { createdAt: { lt: new Date('2026-08-02T00:00:00.000Z') } },
          { createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: { lt: 2 } },
        ],
      });
    });

    it('rejects a malformed cursor with a 400 rather than passing garbage to Prisma', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.getFeed('user-1', { cursor: 'not-valid-base64-json' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('never selects the author\'s passwordHash or isMinor in the list query', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.author.select).not.toHaveProperty('isMinor');
    });

    it('does not select comments or likes relations on the list payload (Section 5.5 leanness)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('comments');
      expect(callArgs.select).not.toHaveProperty('likes');
      expect(callArgs.select).not.toHaveProperty('savedBy');
    });

    // --- Decision Log #153: per-caller viewer state on GET /posts/feed ---

    it('attaches isLiked / isSaved / author.isFollowing per post for a mixed page', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'p-liked-followed', authorId: 'author-x' }),
        buildPostRow({ id: 'p-saved-unfollowed', authorId: 'author-y' }),
        buildPostRow({ id: 'p-nothing', authorId: 'author-z' }),
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([{ postId: 'p-liked-followed' }]);
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([{ postId: 'p-saved-unfollowed' }]);
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([{ followeeId: 'author-x' }]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getFeed('viewer-1', { limit: 10 });

      const byId = Object.fromEntries(page.items.map((p) => [p.id, p]));
      expect(byId['p-liked-followed']).toMatchObject({ isLiked: true, isSaved: false });
      expect(byId['p-liked-followed'].author.isFollowing).toBe(true);
      expect(byId['p-saved-unfollowed']).toMatchObject({ isLiked: false, isSaved: true });
      expect(byId['p-saved-unfollowed'].author.isFollowing).toBe(false);
      expect(byId['p-nothing']).toMatchObject({ isLiked: false, isSaved: false });
      expect(byId['p-nothing'].author.isFollowing).toBe(false);
    });

    it('batches the viewer-state lookups: exactly one findMany per relation, keyed on the page\'s ids (no N+1)', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'p1', authorId: 'author-a' }),
        buildPostRow({ id: 'p2', authorId: 'author-b' }),
        buildPostRow({ id: 'p3', authorId: 'author-a' }),
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('viewer-1', { limit: 10 });

      expect(prisma.like.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.savedPost.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.follow.findMany).toHaveBeenCalledTimes(1);
      expect((prisma.like.findMany as jest.Mock).mock.calls[0][0]).toEqual({
        where: { userId: 'viewer-1', postId: { in: ['p1', 'p2', 'p3'] } },
        select: { postId: true },
      });
      // authorIds deduped; the caller is never queried as a followee.
      expect((prisma.follow.findMany as jest.Mock).mock.calls[0][0]).toEqual({
        where: { followerId: 'viewer-1', followeeId: { in: ['author-a', 'author-b'] } },
        select: { followeeId: true },
      });
    });

    it('reports isFollowing: false for the caller\'s OWN posts and never puts the caller in the follow lookup', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'own-1', authorId: 'viewer-1' }),
        buildPostRow({ id: 'other-1', authorId: 'author-x' }),
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      // A bogus self-follow row that must NOT flip isFollowing true for own-1.
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([
        { followeeId: 'viewer-1' },
        { followeeId: 'author-x' },
      ]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getFeed('viewer-1', { limit: 10 });
      const byId = Object.fromEntries(page.items.map((p) => [p.id, p]));

      expect(byId['own-1'].author.isFollowing).toBe(false);
      expect(byId['other-1'].author.isFollowing).toBe(true);
      expect((prisma.follow.findMany as jest.Mock).mock.calls[0][0].where.followeeId.in).toEqual(['author-x']);
    });

    it('skips ALL three viewer-state lookups entirely when the page has zero posts', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getFeed('viewer-1', {});

      expect(page.items).toEqual([]);
      expect(prisma.like.findMany).not.toHaveBeenCalled();
      expect(prisma.savedPost.findMany).not.toHaveBeenCalled();
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('skips only the follow lookup when every post on the page is the caller\'s own', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([
        buildPostRow({ id: 'own-1', authorId: 'viewer-1' }),
        buildPostRow({ id: 'own-2', authorId: 'viewer-1' }),
      ]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getFeed('viewer-1', {});

      expect(prisma.like.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.savedPost.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });
  });

  // GET /clubs/:id/feed (sprint-2/club-fan-page-backend, Decision Log
  // #157) — delegates to the same paginate+attachViewerState pipeline as
  // getFeed, so these tests focus on the one real difference (the WHERE
  // clause is a flat `clubPageId` filter, not the own-posts-plus-follows
  // OR) plus confirming the shared shape/cursor/viewer-state behavior
  // still holds through this entry point.
  describe('getClubFeed', () => {
    it('scopes strictly to posts whose clubPageId matches — not the caller\'s follows', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getClubFeed('club-1', 'user-1', {});

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      // Decision Log #221: club feed also excludes deactivated authors.
      expect(callArgs.where).toEqual({
        AND: [
          { clubPageId: 'club-1', author: { accountStatus: { in: ['active', 'deleted'] } } },
          notBlockedAuthor('user-1'),
          visibleTo('user-1'),
        ],
      });
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { sequence: 'desc' }]);
      expect(callArgs.take).toBe(FEED_DEFAULT_PAGE_SIZE + 1);
    });

    it('clamps a limit above FEED_MAX_PAGE_SIZE', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getClubFeed('club-1', 'user-1', { limit: 9999 });

      expect((prisma.post.findMany as jest.Mock).mock.calls[0][0].take).toBe(FEED_MAX_PAGE_SIZE + 1);
    });

    it('ANDs a cursor filter with the clubPageId scope and builds a nextCursor from the last kept row', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'post-3', sequence: 3, clubPageId: 'club-1', createdAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildPostRow({ id: 'post-2', sequence: 2, clubPageId: 'club-1', createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildPostRow({ id: 'post-1', sequence: 1, clubPageId: 'club-1', createdAt: new Date('2026-08-01T00:00:00.000Z') }),
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma, FIXED_CLOCK);
      const cursor = encodeFeedSequenceCursor({ createdAt: new Date('2026-08-09T00:00:00.000Z'), sequence: 9 });

      const page = await service.getClubFeed('club-1', 'user-1', { cursor, limit: 2 });

      const callArgs = (prisma.post.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.AND[1]).toEqual(notBlockedAuthor('user-1'));
      expect(callArgs.where.AND[0].AND[0]).toEqual({
        clubPageId: 'club-1',
        author: { accountStatus: { in: ['active', 'deleted'] } },
      });
      expect(callArgs.where.AND[0].AND[1]).toEqual({
        OR: [
          { createdAt: { lt: new Date('2026-08-09T00:00:00.000Z') } },
          { createdAt: new Date('2026-08-09T00:00:00.000Z'), sequence: { lt: 9 } },
        ],
      });
      expect(page.items.map((p) => p.id)).toEqual(['post-3', 'post-2']);
      expect(page.nextCursor).toBe(
        encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 }),
      );
    });

    it('rejects a malformed cursor with a 400 before touching Prisma', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.getClubFeed('club-1', 'user-1', { cursor: 'garbage' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('attaches per-caller isLiked / isSaved / author.isFollowing exactly as getFeed does', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildPostRow({ id: 'p-a', authorId: 'author-x', clubPageId: 'club-1' }),
        buildPostRow({ id: 'p-b', authorId: 'viewer-1', clubPageId: 'club-1' }),
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(rows);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([{ postId: 'p-a' }]);
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([{ followeeId: 'author-x' }]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getClubFeed('club-1', 'viewer-1', { limit: 10 });
      const byId = Object.fromEntries(page.items.map((p) => [p.id, p]));

      expect(byId['p-a']).toMatchObject({ isLiked: true, isSaved: false });
      expect(byId['p-a'].author.isFollowing).toBe(true);
      // The caller's own post in the club feed: isFollowing false, never queried.
      expect(byId['p-b'].author.isFollowing).toBe(false);
      expect((prisma.follow.findMany as jest.Mock).mock.calls[0][0].where.followeeId.in).toEqual(['author-x']);
    });

    it('skips all viewer-state lookups when the club has no posts', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getClubFeed('club-1', 'viewer-1', {});

      expect(page).toEqual({ items: [], nextCursor: null });
      expect(prisma.like.findMany).not.toHaveBeenCalled();
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPostById', () => {
    it('returns the post, with default viewer state, when it exists and the caller has no like/save/follow rows', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow(); // authorId: 'author-1'
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(row);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.getPostById('post-1', 'viewer-1')).resolves.toEqual({
        ...asView(row),
        isLiked: false,
        isSaved: false,
        author: { ...asView(row).author, isFollowing: false },
      });
    });

    it('scopes the lookup to an active author (Decision Log #221) and 404s a post whose author is deactivated', async () => {
      const prisma = buildPrismaMock();
      // findFirst returns null because the active-author filter excluded it.
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.getPostById('post-1', 'viewer-1')).rejects.toBeInstanceOf(NotFoundException);
      const callArgs = (prisma.post.findFirst as jest.Mock).mock.calls[0][0];
      // B-039: also 404s when a block (either direction) stands between the viewer and the author.
      expect(callArgs.where).toEqual({
        AND: [
          { id: 'post-1' },
          { author: { accountStatus: { in: ['active', 'deleted'] } } },
          notBlockedAuthor('viewer-1'),
          visibleTo('viewer-1'),
        ],
      });
    });

    it('throws NotFoundException, not a silent null, for a non-existent id (before any viewer-state lookup)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.getPostById('does-not-exist', 'viewer-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.like.findUnique).not.toHaveBeenCalled();
      expect(prisma.savedPost.findUnique).not.toHaveBeenCalled();
      expect(prisma.follow.findUnique).not.toHaveBeenCalled();
    });

    // --- Decision Log #153: per-caller viewer state on GET /posts/:id ---
    it('reports isLiked / isSaved / author.isFollowing from the caller\'s own Like / SavedPost / Follow rows', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow({ authorId: 'author-1' });
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(row);
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.savedPost.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.follow.findUnique as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.getPostById('post-1', 'viewer-1');

      expect(result.isLiked).toBe(true);
      expect(result.isSaved).toBe(false);
      expect(result.author.isFollowing).toBe(true);
      expect(prisma.like.findUnique).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 'viewer-1', postId: 'post-1' } },
        select: { id: true },
      });
      expect(prisma.follow.findUnique).toHaveBeenCalledWith({
        where: { followerId_followeeId: { followerId: 'viewer-1', followeeId: 'author-1' } },
        select: { id: true },
      });
    });

    it('forces author.isFollowing to false for the caller\'s own post without issuing a follow lookup', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(buildPostRow({ authorId: 'viewer-1' }));
      // Even if a (bogus) self-follow row somehow existed, it must not be consulted.
      (prisma.follow.findUnique as jest.Mock).mockResolvedValue({ id: 'should-not-be-read' });
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.getPostById('post-1', 'viewer-1');

      expect(result.author.isFollowing).toBe(false);
      expect(prisma.follow.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('likePost / unlikePost', () => {
    function mockPostExists(prisma: PrismaService, exists = true) {
      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        if (!exists) return Promise.resolve(null);
        if (args?.select && (args.select as Record<string, unknown>).likeCount) {
          return Promise.resolve({ likeCount: 1 });
        }
        return Promise.resolve({ id: 'post-1' });
      });
    }

    it('throws NotFoundException when postId does not reference a real post (like)', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma, false);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.likePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.like.create).not.toHaveBeenCalled();
    });

    it('creates a Like row and increments likeCount transactionally', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma);
      (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        if ((args.select as Record<string, unknown>)?.likeCount) return Promise.resolve({ likeCount: 1 });
        return Promise.resolve({ id: 'post-1' });
      });
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.likePost('user-1', 'post-1');

      expect(prisma.like.create).toHaveBeenCalledWith({ data: { userId: 'user-1', postId: 'post-1' } });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { likeCount: { increment: 1 } },
      });
      expect(result).toEqual({ postId: 'post-1', liked: true, likeCount: 1 });
    });

    it('treats a duplicate like (P2002) as idempotent success without double-incrementing', async () => {
      const prisma = buildPrismaMock();
      const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 1 }); // currentLikeCount, unchanged by this call
      (prisma.like.create as jest.Mock).mockRejectedValue(dupError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.likePost('user-1', 'post-1');

      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(result).toEqual({ postId: 'post-1', liked: true, likeCount: 1 });
    });

    it('rethrows an unrelated Prisma error from likePost rather than swallowing it', async () => {
      const prisma = buildPrismaMock();
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.like.create as jest.Mock).mockRejectedValue(otherError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.likePost('user-1', 'post-1')).rejects.toBe(otherError);
    });

    it('throws NotFoundException when postId does not reference a real post (unlike)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.unlikePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.like.delete).not.toHaveBeenCalled();
    });

    it('deletes the Like row and decrements likeCount when one exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 0 }); // currentLikeCount after decrement
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.like.delete as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.unlikePost('user-1', 'post-1');

      expect(prisma.like.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 'user-1', postId: 'post-1' } },
      });
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-1', likeCount: { gt: 0 } },
        data: { likeCount: { decrement: 1 } },
      });
      expect(result).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
      // backend/w12-points (spec 9b): an unlike REVOKES the giver's point and the creator's quarter point
      // (and frees the day's cap); the ledger is never written to directly from here.
      expect(revokeEngagementPoints).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'like', postId: 'post-1', giverId: 'user-1', now: FIXED_NOW }),
      );
      expect(awardEngagementPoints).not.toHaveBeenCalled();
    });

    it('is idempotent (no-op, no error) when unliking a post that was never liked', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 0 }); // currentLikeCount
      (prisma.like.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.unlikePost('user-1', 'post-1');

      expect(prisma.like.delete).not.toHaveBeenCalled();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
    });

    it('treats a concurrent-delete race (P2025) as idempotent success rather than a 500', async () => {
      const prisma = buildPrismaMock();
      const raceError = new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ likeCount: 0 }); // currentLikeCount
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1' });
      (prisma.like.delete as jest.Mock).mockRejectedValue(raceError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.unlikePost('user-1', 'post-1');

      expect(result).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
    });

    it('nets to 0 across like, like again, unlike, unlike again (full integer-correctness sequence, not just 200s)', async () => {
      const prisma = buildPrismaMock();
      let likeCount = 0;
      let likeRow: { id: string } | null = null;

      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        const select = args.select as Record<string, unknown> | undefined;
        if (select?.likeCount) return Promise.resolve({ likeCount });
        return Promise.resolve({ id: 'post-1' });
      });
      (prisma.like.create as jest.Mock).mockImplementation(() => {
        if (likeRow) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '5.0.0',
            }),
          );
        }
        likeRow = { id: 'like-1' };
        return Promise.resolve(likeRow);
      });
      (prisma.post.update as jest.Mock).mockImplementation(() => {
        likeCount += 1;
        return Promise.resolve({});
      });
      (prisma.like.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(likeRow));
      (prisma.like.delete as jest.Mock).mockImplementation(() => {
        likeRow = null;
        return Promise.resolve({});
      });
      (prisma.post.updateMany as jest.Mock).mockImplementation(() => {
        if (likeCount > 0) likeCount -= 1;
        return Promise.resolve({ count: 1 });
      });

      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.likePost('user-1', 'post-1'); // 0 -> 1
      const second = await service.likePost('user-1', 'post-1'); // already liked -> stays 1
      const third = await service.unlikePost('user-1', 'post-1'); // 1 -> 0
      const fourth = await service.unlikePost('user-1', 'post-1'); // already unliked -> stays 0

      expect(second.likeCount).toBe(1);
      expect(third.likeCount).toBe(0);
      expect(fourth.likeCount).toBe(0);
      expect(likeCount).toBe(0);
    });

    // Notification wiring, added by sprint-2/follow-and-notifications.
    // likePost/unlikePost pre-date this describe block; only likePost
    // gets Notification coverage here (unlikePost never creates one —
    // see feed/README.md's "removing an action isn't performing one").
    describe('notification wiring', () => {
      it('creates a Notification row for the POST AUTHOR (recipient), never the liker (actor)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: 1 });
          return Promise.resolve({ id: 'post-1', authorId: 'post-author-1' });
        });
        (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.likePost('liker-1', 'post-1');

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: { userId: 'post-author-1', type: 'like', payloadRefId: 'post-1', actorId: 'liker-1' },
        });
        // Explicit recipient-identity assertion, not just "a row exists"
        // — getting this backwards would silently notify the wrong
        // person.
        const callArgs = (prisma.notification.create as jest.Mock).mock.calls[0][0];
        expect(callArgs.data.userId).toBe('post-author-1');
        expect(callArgs.data.userId).not.toBe('liker-1');
      });

      it('creates no Notification row when a user likes their own post (no self-notification)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: 1 });
          return Promise.resolve({ id: 'post-1', authorId: 'self-1' });
        });
        (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.likePost('self-1', 'post-1');

        expect(prisma.notification.create).not.toHaveBeenCalled();
        // The engine is asked (it, not the caller, applies the self-engagement exemption of spec 9b), and
        // it is asked with the liker and the post's creator being the same account.
        expect(awardEngagementPoints).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ kind: 'like', postId: 'post-1', giverId: 'self-1', postAuthorId: 'self-1' }),
        );
      });

      it('B-197: creates no Notification row when a Block stands between liker and post author, but still records the like', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: 1 });
          return Promise.resolve({ id: 'post-1', authorId: 'post-author-1' });
        });
        (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'like-1' });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        (prisma.block.findFirst as jest.Mock).mockResolvedValue({ id: 'block-1' });
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.likePost('liker-1', 'post-1');

        expect(prisma.like.create).toHaveBeenCalled();
        expect(prisma.notification.create).not.toHaveBeenCalled();
      });

      it('creates exactly one Notification row across a like followed by a duplicate (idempotent) like', async () => {
        const prisma = buildPrismaMock();
        let liked = false;
        (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (select?.likeCount) return Promise.resolve({ likeCount: liked ? 1 : 0 });
          return Promise.resolve({ id: 'post-1', authorId: 'post-author-1' });
        });
        (prisma.like.create as jest.Mock).mockImplementation(() => {
          if (liked) {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                code: 'P2002',
                clientVersion: '5.0.0',
              }),
            );
          }
          liked = true;
          return Promise.resolve({ id: 'like-1' });
        });
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.likePost('liker-1', 'post-1');
        await service.likePost('liker-1', 'post-1'); // duplicate — P2002, idempotent

        expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('addComment / getComments', () => {
    const AUTHOR2 = { id: 'author-1', username: null as string | null, displayName: 'Author One' };

    function buildCommentRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'comment-1',
        // See buildPostRow's own comment — irrelevant unless a test
        // builds multiple rows to exercise getComments' ordering/cursor
        // behavior, in which case each row overrides it explicitly.
        sequence: 1,
        postId: 'post-1',
        authorId: 'author-1',
        author: AUTHOR2,
        contentText: 'Nice goal',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        ...overrides,
      };
    }

    it('throws NotFoundException when postId does not reference a real post', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.addComment('missing-post', 'author-1', { contentText: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('creates the Comment row and increments commentCount in the same transaction', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const row = buildCommentRow();
      (prisma.comment.create as jest.Mock).mockResolvedValue(row);
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.addComment('post-1', 'author-1', { contentText: 'Nice goal' });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', authorId: 'author-1', contentText: 'Nice goal' },
        select: expect.objectContaining({ contentText: true, author: expect.anything() }),
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { commentCount: { increment: 1 } },
      });
      expect(result).toEqual({ ...asView(row), contest: undefined }); // a comment row carries no contest label
    });

    it("never selects the comment author's passwordHash or isMinor", async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow());
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.addComment('post-1', 'author-1', { contentText: 'x' });

      const callArgs = (prisma.comment.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.author.select).not.toHaveProperty('isMinor');
    });

    it('throws NotFoundException from getComments when postId does not reference a real post', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.getComments('missing-post', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
    });

    it('orders comments oldest-first (createdAt asc, sequence asc) — NOT id, a random UUID unrelated to insertion order', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getComments('post-1', {});

      const callArgs = (prisma.comment.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ createdAt: 'asc' }, { sequence: 'asc' }]);
      expect(callArgs.where).toEqual({ AND: [{ postId: 'post-1' }, { hidden: false }, {}] });
      expect(callArgs.select).toHaveProperty('sequence', true);
    });

    it('applies an ascending cursor filter (createdAt > cursor OR createdAt = cursor AND sequence > cursor.sequence)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);
      const cursor = encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 });

      await service.getComments('post-1', { cursor });

      const callArgs = (prisma.comment.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        AND: [
          { postId: 'post-1' },
          { hidden: false },
          {},
          {
            OR: [
              { createdAt: { gt: new Date('2026-08-02T00:00:00.000Z') } },
              { createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: { gt: 2 } },
            ],
          },
        ],
      });
    });

    it('paginates with a nextCursor when more comments exist than the limit', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const rows = [
        buildCommentRow({ id: 'comment-1', sequence: 1, createdAt: new Date('2026-08-01T00:00:00.000Z') }),
        buildCommentRow({ id: 'comment-2', sequence: 2, createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildCommentRow({ id: 'comment-3', sequence: 3, createdAt: new Date('2026-08-03T00:00:00.000Z') }), // lookahead row
      ];
      (prisma.comment.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getComments('post-1', { limit: 2 });

      expect(page.items.map((c) => c.id)).toEqual(['comment-1', 'comment-2']);
      expect(page.nextCursor).toBe(
        encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 }),
      );
      expect(page.items[0]).not.toHaveProperty('sequence');
      expect(page.items[1]).not.toHaveProperty('sequence');
    });

    // Notification wiring, added by sprint-2/follow-and-notifications.
    describe('notification wiring', () => {
      it('creates a Notification row for the POST AUTHOR (recipient), never the commenter (actor)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'post-author-1' });
        (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow({ authorId: 'commenter-1' }));
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.addComment('post-1', 'commenter-1', { contentText: 'Nice goal' });

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: { userId: 'post-author-1', type: 'comment', payloadRefId: 'post-1', actorId: 'commenter-1' },
        });
        const callArgs = (prisma.notification.create as jest.Mock).mock.calls[0][0];
        expect(callArgs.data.userId).toBe('post-author-1');
        expect(callArgs.data.userId).not.toBe('commenter-1');
      });

      it('B-197: creates no Notification row when a Block stands between commenter and post author, but still records the comment', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'post-author-1' });
        (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow({ authorId: 'commenter-1' }));
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        (prisma.block.findFirst as jest.Mock).mockResolvedValue({ id: 'block-1' });
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.addComment('post-1', 'commenter-1', { contentText: 'Nice goal' });

        expect(prisma.comment.create).toHaveBeenCalled();
        expect(prisma.notification.create).not.toHaveBeenCalled();
        expect((prisma.block.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
          OR: [
            { blockerId: 'commenter-1', blockedId: 'post-author-1' },
            { blockerId: 'post-author-1', blockedId: 'commenter-1' },
          ],
        });
      });

      it('creates no Notification row when a user comments on their own post (no self-notification)', async () => {
        const prisma = buildPrismaMock();
        (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'self-1' });
        (prisma.comment.create as jest.Mock).mockResolvedValue(buildCommentRow({ authorId: 'self-1' }));
        (prisma.post.update as jest.Mock).mockResolvedValue({});
        const service = new FeedService(prisma, FIXED_CLOCK);

        await service.addComment('post-1', 'self-1', { contentText: 'Nice goal' });

        expect(prisma.notification.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteComment', () => {
    function mockComment(overrides: Partial<{ id: string; postId: string; authorId: string; postAuthorId: string }> = {}) {
      const row = {
        id: overrides.id ?? 'comment-1',
        postId: overrides.postId ?? 'post-1',
        authorId: overrides.authorId ?? 'commenter-1',
        post: { authorId: overrides.postAuthorId ?? 'post-author-1' },
      };
      return row;
    }

    it('throws NotFoundException when commentId does not reference a real comment', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.deleteComment('post-1', 'missing-comment', 'commenter-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (not ForbiddenException) when the comment exists but belongs to a different post than the URL', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ postId: 'a-different-post', authorId: 'commenter-1' }),
      );
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(
        service.deleteComment('post-1', 'comment-1', 'commenter-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the requester is neither the comment author nor the post author', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(
        service.deleteComment('post-1', 'comment-1', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('allows the comment author to delete their own comment', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.deleteComment('post-1', 'comment-1', 'commenter-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
    });

    it('allows the POST AUTHOR to delete someone else\'s comment on their own post', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.deleteComment('post-1', 'comment-1', 'post-author-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
    });

    it('decrements commentCount transactionally, using the same floor-guarded updateMany pattern as unlikePost', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(
        mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }),
      );
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.deleteComment('post-1', 'comment-1', 'commenter-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-1', commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });
    });

    it('is NOT idempotent: deleting the same comment a second time is a 404, not a 200 (unlike like/save/follow/join)', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockComment({ authorId: 'commenter-1', postAuthorId: 'post-author-1' }))
        .mockResolvedValueOnce(null); // gone after the first delete
      (prisma.comment.delete as jest.Mock).mockResolvedValue({ id: 'comment-1' });
      (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.deleteComment('post-1', 'comment-1', 'commenter-1');
      await expect(service.deleteComment('post-1', 'comment-1', 'commenter-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deletePost', () => {
    it('404s for a missing post, 403s for a non-author, and deletes nothing in either case', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma, FIXED_CLOCK);
      (prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.deletePost('p', 'u')).rejects.toBeInstanceOf(NotFoundException);
      (prisma.post.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'p', authorId: 'owner' });
      await expect(service.deletePost('p', 'someone-else')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.post.delete).not.toHaveBeenCalled();
    });

    it('deletes the Post row (children cascade in Postgres) and decrements each linked hashtag floor-guarded', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      (prisma.postHashtag.findMany as jest.Mock).mockResolvedValue([{ hashtagId: 'h1' }, { hashtagId: 'h2' }]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.deletePost('p', 'owner');

      expect(prisma.hashtag.updateMany).toHaveBeenCalledWith({
        where: { id: 'h1', postCount: { gt: 0 } },
        data: { postCount: { decrement: 1 } },
      });
      expect(prisma.hashtag.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    });
  });

  // backend/w14-post-media-pipeline (Decision Log #419 item 9): the post's stored files go with it.
  describe('deletePost removes the stored media objects', () => {
    const storage = () => ({ upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) });

    it('reads the keys BEFORE the post (and its rows) is deleted, then deletes the objects after the transaction', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      const NOW_PUBLISHED = new Date('2026-08-01T00:00:00Z');
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([
        { status: 'approved', publishedAt: NOW_PUBLISHED, publicKey: 'post-media/owner/a.jpg', privateKey: null, quarantineKey: null },
        { status: 'approved', publishedAt: NOW_PUBLISHED, publicKey: 'post-media/owner/b.mp4', privateKey: null, quarantineKey: 'quarantine/owner/b' },
      ]);
      const st = storage();

      await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, st).deletePost('p', 'owner');

      expect(prisma.postMedia.findMany).toHaveBeenCalledWith({
        where: { postId: 'p' },
        select: { status: true, publishedAt: true, publicKey: true, privateKey: true, quarantineKey: true },
      });
      expect(st.delete.mock.calls.map((c) => c[0])).toEqual(['post-media/owner/a.jpg', 'post-media/owner/b.mp4', 'quarantine/owner/b']);
      const del = (prisma.post.delete as jest.Mock).mock.invocationCallOrder[0];
      expect((prisma.postMedia.findMany as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(del);
      expect(st.delete.mock.invocationCallOrder[0]).toBeGreaterThan(del);
    });

    it('a storage failure never fails or undoes the deletion', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([
        { status: 'approved', publishedAt: new Date('2026-08-01T00:00:00Z'), publicKey: 'post-media/owner/a.jpg', privateKey: null, quarantineKey: null },
      ]);
      const st = { upload: jest.fn(), delete: jest.fn().mockRejectedValue(new Error('503')) };
      await expect(new FeedService(prisma, FIXED_CLOCK, undefined, undefined, st).deletePost('p', 'owner')).resolves.toBeUndefined();
      expect(prisma.post.delete).toHaveBeenCalled();
    });

    // B-257 (Decision Log #430 item 2): a pending file's private object goes with the post; a REJECTED file's
    // never does (evidence handling is OPEN under counsel, B-206).
    it('deletes a pending file\'s private object but NEVER a rejected file\'s', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([
        { status: 'pending', publishedAt: null, publicKey: 'post-media/owner/p.jpg', privateKey: 'private-media/owner/p.jpg', quarantineKey: null },
        { status: 'rejected', publishedAt: null, publicKey: 'post-media/owner/r.jpg', privateKey: 'private-media/owner/r.jpg', quarantineKey: null },
      ]);
      const st = storage();
      await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, st).deletePost('p', 'owner');
      expect(st.delete.mock.calls.map((c) => c[0])).toEqual(['private-media/owner/p.jpg']);
      expect(st.delete).not.toHaveBeenCalledWith('private-media/owner/r.jpg');
    });

    it('a post with no media touches no object', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      const st = storage();
      await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, st).deletePost('p', 'owner');
      expect(st.delete).not.toHaveBeenCalled();
    });
  });

  // ---- B-259 / B-257 (Decision Log #430 items 2 and 4): the post's `media` field and the author's view link ----
  describe('post payload: media [{ id, kind }] and the author-only viewUrl', () => {
    const files = [
      { id: 'a', kind: 'image', publicUrl: 'https://cdn.test/post-media/author-1/a.jpg' },
      { id: 'b', kind: 'video', publicUrl: 'https://cdn.test/post-media/author-1/b.mp4' },
    ];
    const withFiles = () =>
      buildPostRow({ mediaUrls: [files[1].publicUrl, files[0].publicUrl], media: [files[0], files[1]] });
    const directStorage = () => ({ createDownloadUrl: jest.fn(async (key: string, ttl: number) => `https://view.test/${key}?ttl=${ttl}`) });
    const mediaRows = (over: Record<string, unknown> = {}) => [
      { id: 'a', status: 'pending', hiddenPendingReview: false, publishedAt: null, publicKey: 'post-media/author-1/a.jpg', privateKey: 'private-media/author-1/a.jpg', ...over },
      { id: 'b', status: 'approved', hiddenPendingReview: false, publishedAt: new Date('2026-08-01T00:00:00Z'), publicKey: 'post-media/author-1/b.mp4', privateKey: null },
    ];

    it('lists each attached file as { id, kind } only, in the order of mediaUrls, and never the raw url or keys', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      const post = await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'viewer-9');
      expect(post.media).toEqual([
        { id: 'b', kind: 'video' },
        { id: 'a', kind: 'image' },
      ]);
      expect(JSON.stringify(post.media)).not.toMatch(/publicUrl|privateKey|publicKey|cdn\.test/);
    });

    it('selects the files through the post, so a viewer who may see the post (the existing visibility rules) sees exactly its files', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'viewer-9');
      const call = (prisma.post.findFirst as jest.Mock).mock.calls[0][0];
      expect(call.select.media).toEqual({ select: { id: true, kind: true, publicUrl: true } });
      // The media gate itself is the unchanged existing fragment: the post is invisible to a non-author
      // unless every attached file is approved.
      expect(JSON.stringify(call.where)).toContain('"hiddenPendingReview":true');
    });

    it('a post with no files has an empty media list', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(buildPostRow());
      expect((await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'viewer-9')).media).toEqual([]);
    });

    it('the AUTHOR gets a short-lived signed viewUrl for a file that is not public yet (the private object), not for an approved one', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(mediaRows());
      const ds = directStorage();
      const post = await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, undefined, ds as never).getPostById('post-1', 'author-1');
      expect(post.media).toEqual([
        { id: 'b', kind: 'video' },
        { id: 'a', kind: 'image', viewUrl: 'https://view.test/private-media/author-1/a.jpg?ttl=300' },
      ]);
      expect(ds.createDownloadUrl).toHaveBeenCalledTimes(1);
      expect(ds.createDownloadUrl).toHaveBeenCalledWith('private-media/author-1/a.jpg', 300);
      // looked up for THIS uploader only
      expect((prisma.postMedia.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({ uploaderId: 'author-1' });
    });

    it('a REJECTED file is viewable by its author too (private object); a held one as well', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(mediaRows({ status: 'rejected' }));
      const ds = directStorage();
      const post = await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, undefined, ds as never).getPostById('post-1', 'author-1');
      expect(post.media.find((m) => m.id === 'a')?.viewUrl).toContain('private-media/author-1/a.jpg');
    });

    it('NOBODY ELSE gets a viewUrl, and no signing or media lookup happens for another viewer', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      const ds = directStorage();
      const post = await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, undefined, ds as never).getPostById('post-1', 'viewer-9');
      expect(post.media.every((m) => !('viewUrl' in m))).toBe(true);
      expect(ds.createDownloadUrl).not.toHaveBeenCalled();
      expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
    });

    it('is signed once for a whole page of the author\'s own posts, and skipped for a page with no media', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([
        { ...withFiles(), sequence: 2 },
        { ...buildPostRow({ id: 'post-2' }), sequence: 1 },
      ]);
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(mediaRows());
      const ds = directStorage();
      const page = await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, undefined, ds as never).getFeed('author-1', {});
      expect(prisma.postMedia.findMany).toHaveBeenCalledTimes(1);
      expect(page.items[0].media.find((m) => m.id === 'a')?.viewUrl).toBeDefined();
      expect(page.items[1].media).toEqual([]);
    });

    it('a storage outage just leaves the link off; it never fails the read', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(mediaRows());
      const { ServiceUnavailableException } = jest.requireActual('@nestjs/common');
      const ds = { createDownloadUrl: jest.fn().mockRejectedValue(new ServiceUnavailableException('no store')) };
      const post = await new FeedService(prisma, FIXED_CLOCK, undefined, undefined, undefined, ds as never).getPostById('post-1', 'author-1');
      expect(post.media.every((m) => !('viewUrl' in m))).toBe(true);
    });

    it('is optional: without an object store the author still gets { id, kind }', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(withFiles());
      const post = await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'author-1');
      expect(post.media).toEqual([
        { id: 'b', kind: 'video' },
        { id: 'a', kind: 'image' },
      ]);
      expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
    });
  });

  describe('comment settings', () => {
    // A realistic comment row (embedded author included) -- the service maps it
    // to the public shape, so a bare { id } is not a valid mock.
    const commentRow = () => ({
      id: 'c',
      postId: 'p',
      authorId: 'owner',
      author: AUTHOR,
      contentText: 'hi',
      hidden: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    it('addComment: off blocks a non-author, still lets the author comment', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'p', authorId: 'owner', commentPermission: 'off',
      });
      (prisma.comment.create as jest.Mock).mockResolvedValue(commentRow());
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.addComment('p', 'other', { contentText: 'hi' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.comment.create).not.toHaveBeenCalled();
      await service.addComment('p', 'owner', { contentText: 'hi' });
      expect(prisma.comment.create).toHaveBeenCalledTimes(1);
    });

    it('addComment: followers rejects a non-follower, accepts a follower (commenter = followerId, author = followeeId)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'p', authorId: 'owner', commentPermission: 'followers',
      });
      (prisma.comment.create as jest.Mock).mockResolvedValue(commentRow());
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.addComment('p', 'other', { contentText: 'hi' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      (prisma.follow.findUnique as jest.Mock).mockResolvedValue({ id: 'f' });
      await service.addComment('p', 'other', { contentText: 'hi' });
      expect(prisma.follow.findUnique).toHaveBeenLastCalledWith({
        where: { followerId_followeeId: { followerId: 'other', followeeId: 'owner' } },
        select: { id: true },
      });
      expect(prisma.comment.create).toHaveBeenCalledTimes(1);
    });

    it('addComment: everyone accepts anyone with no follow lookup', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'p', authorId: 'owner', commentPermission: 'everyone',
      });
      (prisma.comment.create as jest.Mock).mockResolvedValue(commentRow());
      await new FeedService(prisma, FIXED_CLOCK).addComment('p', 'other', { contentText: 'hi' });
      expect(prisma.follow.findUnique).not.toHaveBeenCalled();
    });

    it('updateCommentSettings: 404 / 403 / success, and never touches existing comments', async () => {
      const prisma = buildPrismaMock();
      const service = new FeedService(prisma, FIXED_CLOCK);
      (prisma.post.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.updateCommentSettings('p', 'u', { commentPermission: 'off' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      await expect(
        service.updateCommentSettings('p', 'other', { commentPermission: 'off' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      (prisma.post.update as jest.Mock).mockResolvedValue({ id: 'p', commentPermission: 'off' });
      await service.updateCommentSettings('p', 'owner', { commentPermission: 'off' });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p' },
        data: { commentPermission: 'off' },
        select: { id: true, commentPermission: true },
      });
      expect(prisma.comment.updateMany).not.toHaveBeenCalled();
    });

    it('setCommentHidden: only the post author; hide decrements, unhide increments, repeat is a no-op', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({ id: 'c', postId: 'p' });
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.setCommentHidden('p', 'c', 'other', true)).rejects.toBeInstanceOf(ForbiddenException);
      (prisma.comment.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'c', postId: 'other-post' });
      await expect(service.setCommentHidden('p', 'c', 'owner', true)).rejects.toBeInstanceOf(NotFoundException);

      (prisma.comment.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      await service.setCommentHidden('p', 'c', 'owner', true);
      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'p', commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });

      (prisma.post.updateMany as jest.Mock).mockClear();
      (prisma.comment.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      await service.setCommentHidden('p', 'c', 'owner', true);
      expect(prisma.post.updateMany).not.toHaveBeenCalled();

      (prisma.comment.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      await service.setCommentHidden('p', 'c', 'owner', false);
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p' },
        data: { commentCount: { increment: 1 } },
      });
    });

    it('getComments visibility: post author sees all, comment author sees own hidden, others see none hidden', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'p', authorId: 'owner' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);
      const whereFor = async (viewer: string) => {
        (prisma.comment.findMany as jest.Mock).mockClear();
        await service.getComments('p', {}, viewer);
        return (prisma.comment.findMany as jest.Mock).mock.calls[0][0].where;
      };
      // B-039: a third clause hides comments by anyone blocked (either direction) with the viewer.
      expect(await whereFor('owner')).toEqual({ AND: [{ postId: 'p' }, {}, notBlockedAuthor('owner')] });
      expect(await whereFor('viewer')).toEqual({
        AND: [{ postId: 'p' }, { OR: [{ hidden: false }, { authorId: 'viewer' }] }, notBlockedAuthor('viewer')],
      });
    });

    it('deleteComment does not decrement commentCount again for an already-hidden comment', async () => {
      const prisma = buildPrismaMock();
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
        id: 'c', postId: 'p', authorId: 'me', hidden: true, post: { authorId: 'owner' },
      });
      await new FeedService(prisma, FIXED_CLOCK).deleteComment('p', 'c', 'me');
      expect(prisma.comment.delete).toHaveBeenCalled();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('savePost / unsavePost', () => {
    it('throws NotFoundException when postId does not reference a real post (save)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.savePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savedPost.create).not.toHaveBeenCalled();
    });

    it('creates a SavedPost row (no counter to touch — SavedPost has none)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.savedPost.create as jest.Mock).mockResolvedValue({ id: 'saved-1' });
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.savePost('user-1', 'post-1');

      expect(prisma.savedPost.create).toHaveBeenCalledWith({ data: { userId: 'user-1', postId: 'post-1' } });
      expect(result).toEqual({ postId: 'post-1', saved: true });
    });

    it('treats a duplicate save (P2002) as idempotent success', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.savedPost.create as jest.Mock).mockRejectedValue(dupError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.savePost('user-1', 'post-1')).resolves.toEqual({ postId: 'post-1', saved: true });
    });

    it('throws NotFoundException when postId does not reference a real post (unsave)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.unsavePost('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savedPost.delete).not.toHaveBeenCalled();
    });

    it('is idempotent (no error) when unsaving a post that was never saved (P2025)', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.savedPost.delete as jest.Mock).mockRejectedValue(notFoundError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.unsavePost('user-1', 'post-1')).resolves.toEqual({ postId: 'post-1', saved: false });
    });

    it('deletes an existing SavedPost row on unsave', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.savedPost.delete as jest.Mock).mockResolvedValue({ id: 'saved-1' });
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.unsavePost('user-1', 'post-1');

      expect(prisma.savedPost.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 'user-1', postId: 'post-1' } },
      });
      expect(result).toEqual({ postId: 'post-1', saved: false });
    });
  });

  describe('recordView', () => {
    function mockPostExists(prisma: PrismaService, exists = true) {
      (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: unknown }) => {
        if (!exists) return Promise.resolve(null);
        if (args?.select && (args.select as Record<string, unknown>).viewCount) {
          return Promise.resolve({ viewCount: 1 });
        }
        return Promise.resolve({ id: 'post-1' });
      });
    }

    it('throws NotFoundException when postId does not reference a real post', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma, false);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.recordView('user-1', 'missing-post')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.postView.create).not.toHaveBeenCalled();
    });

    it('creates a PostView row and increments viewCount transactionally for a logged-in caller', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma);
      (prisma.postView.create as jest.Mock).mockResolvedValue({ id: 'view-1' });
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.recordView('user-1', 'post-1');

      expect(prisma.postView.create).toHaveBeenCalledWith({
        data: { viewerId: 'user-1', postId: 'post-1' },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { viewCount: { increment: 1 } },
      });
      expect(result).toEqual({ postId: 'post-1', viewCount: 1 });
    });

    it('records an anonymous view with viewerId null', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma);
      (prisma.postView.create as jest.Mock).mockResolvedValue({ id: 'view-1' });
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.recordView(undefined, 'post-1');

      expect(prisma.postView.create).toHaveBeenCalledWith({
        data: { viewerId: null, postId: 'post-1' },
      });
      expect(result).toEqual({ postId: 'post-1', viewCount: 1 });
    });

    it('treats a duplicate logged-in view (P2002) as idempotent success without double-incrementing', async () => {
      const prisma = buildPrismaMock();
      const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'post-1' }) // assertPostExists
        .mockResolvedValueOnce({ viewCount: 1 }); // currentViewCount, unchanged by this call
      (prisma.postView.create as jest.Mock).mockRejectedValue(dupError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const result = await service.recordView('user-1', 'post-1');

      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(result).toEqual({ postId: 'post-1', viewCount: 1 });
    });

    it('rethrows an unrelated Prisma error rather than swallowing it', async () => {
      const prisma = buildPrismaMock();
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.postView.create as jest.Mock).mockRejectedValue(otherError);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await expect(service.recordView('user-1', 'post-1')).rejects.toBe(otherError);
    });

    it('does not send a notification or award points for a view', async () => {
      const prisma = buildPrismaMock();
      mockPostExists(prisma);
      (prisma.postView.create as jest.Mock).mockResolvedValue({ id: 'view-1' });
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.recordView('user-1', 'post-1');

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(awardEngagementPoints).not.toHaveBeenCalled();
    });
  });

  describe('getSavedPosts', () => {
    function buildSavedRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        postId: 'post-1',
        // See buildPostRow's own comment — irrelevant unless a test
        // builds multiple rows to exercise ordering/cursor behavior, in
        // which case each row overrides it explicitly. This is
        // SavedPost's OWN sequence, not the embedded post's.
        sequence: 1,
        savedAt: new Date('2026-08-01T00:00:00.000Z'),
        post: buildPostRow(),
        ...overrides,
      };
    }

    it('scopes the query to the given userId', async () => {
      const prisma = buildPrismaMock();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getSavedPosts('user-1', {});

      const callArgs = (prisma.savedPost.findMany as jest.Mock).mock.calls[0][0];
      // B-039: a saved post whose author is blocked (either direction) is hidden.
      expect(callArgs.where).toEqual({
        userId: 'user-1',
        post: { is: { AND: [notBlockedAuthor('user-1'), visibleTo('user-1')] } },
      });
      // NOT `postId` — that's a foreign key to Post.id (a random UUID)
      // with no relation to WHEN this row was saved. See
      // SAVED_POST_SELECT_WITH_SEQUENCE's own comment.
      expect(callArgs.orderBy).toEqual([{ savedAt: 'desc' }, { sequence: 'desc' }]);
      expect(callArgs.select).toHaveProperty('sequence', true);
    });

    it('paginates with a nextCursor when more saved posts exist than the limit', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildSavedRow({ postId: 'post-3', sequence: 3, savedAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildSavedRow({ postId: 'post-2', sequence: 2, savedAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildSavedRow({ postId: 'post-1', sequence: 1, savedAt: new Date('2026-08-01T00:00:00.000Z') }), // lookahead
      ];
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new FeedService(prisma, FIXED_CLOCK);

      const page = await service.getSavedPosts('user-1', { limit: 2 });

      expect(page.items.map((s) => s.postId)).toEqual(['post-3', 'post-2']);
      expect(page.nextCursor).toBe(
        encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 }),
      );
      expect(page.items[0]).not.toHaveProperty('sequence');
      expect(page.items[1]).not.toHaveProperty('sequence');
    });

    it('applies a descending cursor filter keyed on savedAt/sequence when a cursor is given', async () => {
      const prisma = buildPrismaMock();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);
      const cursor = encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 });

      await service.getSavedPosts('user-1', { cursor });

      const callArgs = (prisma.savedPost.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        userId: 'user-1',
        post: { is: { AND: [notBlockedAuthor('user-1'), visibleTo('user-1')] } },
        OR: [
          { savedAt: { lt: new Date('2026-08-02T00:00:00.000Z') } },
          { savedAt: new Date('2026-08-02T00:00:00.000Z'), sequence: { lt: 2 } },
        ],
      });
    });

    it('embeds the full post without leaking passwordHash/isMinor', async () => {
      const prisma = buildPrismaMock();
      (prisma.savedPost.findMany as jest.Mock).mockResolvedValue([]);
      const service = new FeedService(prisma, FIXED_CLOCK);

      await service.getSavedPosts('user-1', {});

      const callArgs = (prisma.savedPost.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.post.select.author.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.post.select.author.select).not.toHaveProperty('isMinor');
    });
  });

  describe('author public name (profile/username-column-and-display-convention)', () => {
    const withUsername = { id: 'author-1', username: 'goalie_9', displayName: 'Ada Obi' };

    it('getPostById shows the username as the author publicName and never forwards the real displayName', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(buildPostRow({ author: withUsername }));
      const result = await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'viewer-1');
      expect(result.author.publicName).toBe('goalie_9');
      expect(result.author).not.toHaveProperty('displayName');
      expect(JSON.stringify(result)).not.toContain('Ada Obi');
    });

    it('getPostById shows the placeholder, never the real name, when the author has no username', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(buildPostRow());
      const result = await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'viewer-1');
      expect(result.author.publicName).toBe('Soccernity member');
    });

    it('createPost and addComment resolve the author name the same way', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow({ author: withUsername }));
      const post = await new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'hi' });
      expect(post.author).toEqual({ id: 'author-1', publicName: 'goalie_9' });
    });

    it('the Prisma author select requests username + displayName (both needed to resolve), never isMinor', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(buildPostRow());
      await new FeedService(prisma, FIXED_CLOCK).getPostById('post-1', 'viewer-1');
      const sel = (prisma.post.findFirst as jest.Mock).mock.calls[0][0].select.author.select;
      expect(sel).toEqual({ id: true, username: true, displayName: true });
    });
  });

  // B-039 (Block, Decision Log #396, #402 item 4): a block in either direction between the
  // viewer and a post's author makes the post "not found"; counts are never adjusted.
  describe('Block (B-039)', () => {
    const notBlocked = notBlockedWith('viewer-1');

    it.each([
      ['likePost', (svc: FeedService) => svc.likePost('viewer-1', 'post-1')],
      ['addComment', (svc: FeedService) => svc.addComment('post-1', 'viewer-1', { contentText: 'hi' })],
      ['savePost', (svc: FeedService) => svc.savePost('viewer-1', 'post-1')],
      ['recordView', (svc: FeedService) => svc.recordView('viewer-1', 'post-1')],
      ['getComments', (svc: FeedService) => svc.getComments('post-1', {}, 'viewer-1')],
    ])('%s looks the post up WITH the block filter, so a blocked author is the plain 404', async (_n, call) => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null); // filtered out by the block clause
      await expect(call(new FeedService(prisma, FIXED_CLOCK))).rejects.toBeInstanceOf(NotFoundException);
      expect((prisma.post.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({
        id: 'post-1',
        author: { is: notBlocked },
        // backend/w7-contest: and a final contest entry is invisible to everyone but its author.
        AND: [visibleTo('viewer-1')],
      });
      expect(prisma.like.create).not.toHaveBeenCalled();
      expect(prisma.comment.create).not.toHaveBeenCalled();
      expect(prisma.savedPost.create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('anonymous getComments looks the post up with NO block clause, but a hidden final contest entry is still a 404', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'a' });
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      await new FeedService(prisma, FIXED_CLOCK).getComments('post-1', {});
      expect((prisma.post.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({
        id: 'post-1',
        // backend/w7-contest: an anonymous read cannot be the author, so it only sees revealed posts.
        AND: [{ OR: [{ visibleFrom: null }, { visibleFrom: { lte: FIXED_NOW } }] }, POST_MEDIA_ALL_APPROVED],
      });
    });

    it('an anonymous view (POST /posts/:id/view with no token) cannot reach a hidden final contest entry either', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(new FeedService(prisma, FIXED_CLOCK).recordView(undefined, 'post-1')).rejects.toBeInstanceOf(NotFoundException);
      expect((prisma.post.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({
        id: 'post-1',
        AND: [{ OR: [{ visibleFrom: null }, { visibleFrom: { lte: FIXED_NOW } }] }, POST_MEDIA_ALL_APPROVED],
      });
    });

    it('the undo form (unsave) stays open: no block clause', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.savedPost.delete as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: 'x' }),
      );
      await new FeedService(prisma, FIXED_CLOCK).unsavePost('viewer-1', 'post-1');
      expect((prisma.post.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({ id: 'post-1' });
    });

    it('every feed (own, club, Banter room) is scoped to authors with no block against the viewer', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      const svc = new FeedService(prisma, FIXED_CLOCK);
      await svc.getFeed('viewer-1', {});
      await svc.getClubFeed('club-1', 'viewer-1', {});
      await svc.getBanterRoomFeed('room-1', 'viewer-1', {});
      for (const call of (prisma.post.findMany as jest.Mock).mock.calls) {
        expect(call[0].where.AND).toContainEqual({ author: { is: notBlocked } });
      }
    });

    it('does not adjust any counter: reading a feed never updates likeCount / commentCount', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      await new FeedService(prisma, FIXED_CLOCK).getFeed('viewer-1', {});
      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });
  });
});

// backend/w7-contest (B-091). What FeedService does for a post that is a CONTEST ENTRY: the contest's
// engagement row lands in the same transaction as the Like / Comment, the final entry is locked
// before the reveal, and a final entry can be created hidden. The rest of the Contest is in
// src/modules/contest and test/contest.e2e-spec.ts.
describe('FeedService: contest entries (B-091)', () => {
  const entryRow = (weekNumber: number, over: Record<string, unknown> = {}) => ({
    id: 'entry-1',
    userId: 'author-1',
    submittedAt: new Date('2026-08-02T09:00:00.000Z'),
    round: { weekNumber },
    cycle: { monthKey: '2026-08' },
    ...over,
  });
  // August 2026 is BST. Phase 1 of week 1 ends 2026-08-04T23:00Z; the reveal is 2026-08-24T23:00Z.
  const clockAt = (iso: string) => ({ now: () => new Date(iso) });
  const postExists = (prisma: PrismaService) => {
    (prisma.post.findUnique as jest.Mock).mockImplementation((args: { select?: Record<string, unknown> }) =>
      Promise.resolve(args?.select?.likeCount ? { likeCount: 1 } : { id: 'post-1', authorId: 'author-1', commentPermission: 'everyone' }),
    );
    (prisma.post.update as jest.Mock).mockResolvedValue({});
  };
  const mocks = (prisma: PrismaService) =>
    prisma as unknown as { contestEntry: { findUnique: jest.Mock }; contestEngagement: { createMany: jest.Mock; deleteMany: jest.Mock } };

  describe('likePost', () => {
    it('records the contest engagement row in the same transaction when the post is an entry and the like is inside its window', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(1));
      const now = '2026-08-03T12:00:00.000Z';

      await new FeedService(prisma, clockAt(now)).likePost('fan-1', 'post-1');

      expect(mocks(prisma).contestEngagement.createMany).toHaveBeenCalledWith({
        data: [{ entryId: 'entry-1', userId: 'fan-1', kind: 'like', followedAtEngagement: false, occurredAt: new Date(now) }],
        skipDuplicates: true,
      });
    });

    it('records nothing for an ordinary post, nor for a like after Phase 1 has ended', async () => {
      const a = buildPrismaMock();
      postExists(a);
      await new FeedService(a, clockAt('2026-08-03T12:00:00.000Z')).likePost('fan-1', 'post-1');
      expect(mocks(a).contestEngagement.createMany).not.toHaveBeenCalled();

      const b = buildPrismaMock();
      postExists(b);
      mocks(b).contestEntry.findUnique.mockResolvedValue(entryRow(1));
      await new FeedService(b, clockAt('2026-08-04T23:00:00.000Z')).likePost('fan-1', 'post-1');
      expect(mocks(b).contestEngagement.createMany).not.toHaveBeenCalled();
      expect(b.like.create).toHaveBeenCalled(); // the like itself still happens
    });

    it('a duplicate like (P2002) rolls the contest row back with the Like: the sequence stops before it', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(1));
      (prisma.like.create as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await new FeedService(prisma, clockAt('2026-08-03T12:00:00.000Z')).likePost('fan-1', 'post-1');
      expect(mocks(prisma).contestEngagement.createMany).not.toHaveBeenCalled();
    });

    it('a FINAL entry refuses a like before the reveal with a coded 403, even from its author, and records nothing', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(4));
      const service = new FeedService(prisma, clockAt('2026-08-24T22:59:59.999Z'));

      await expect(service.likePost('author-1', 'post-1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.likePost('fan-1', 'post-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'contest_final_locked' }),
      });
      expect(prisma.like.create).not.toHaveBeenCalled();
      expect(mocks(prisma).contestEngagement.createMany).not.toHaveBeenCalled();
    });

    it('a FINAL entry accepts a like from the reveal on, and records it', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(4, { submittedAt: new Date('2026-08-23T10:00:00Z') }));
      await new FeedService(prisma, clockAt('2026-08-24T23:00:00.000Z')).likePost('fan-1', 'post-1');
      expect(mocks(prisma).contestEngagement.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('unlikePost', () => {
    it('removes that account\'s like from the contest tally in the same transaction', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1' });
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(1));

      await new FeedService(prisma, FIXED_CLOCK).unlikePost('fan-1', 'post-1');

      expect(prisma.like.delete).toHaveBeenCalled();
      expect(mocks(prisma).contestEngagement.deleteMany).toHaveBeenCalledWith({
        where: { entryId: 'entry-1', userId: 'fan-1', kind: 'like' },
      });
    });
  });

  describe('addComment / deleteComment', () => {
    it('records ONE comment engagement for the commenter (idempotent insert, so ten comments are one point)', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(1));
      (prisma.comment.create as jest.Mock).mockResolvedValue({ id: 'c', postId: 'post-1', authorId: 'fan-1', author: AUTHOR, contentText: 'x', hidden: false, createdAt: new Date() });
      const service = new FeedService(prisma, clockAt('2026-08-03T12:00:00.000Z'));

      await service.addComment('post-1', 'fan-1', { contentText: 'great' });
      await service.addComment('post-1', 'fan-1', { contentText: 'again' });

      const calls = mocks(prisma).contestEngagement.createMany.mock.calls;
      expect(calls).toHaveLength(2);
      for (const c of calls) {
        expect(c[0]).toMatchObject({ skipDuplicates: true });
        expect(c[0].data[0]).toMatchObject({ entryId: 'entry-1', userId: 'fan-1', kind: 'comment' });
      }
    });

    it('refuses a comment on a FINAL entry before the reveal', async () => {
      const prisma = buildPrismaMock();
      postExists(prisma);
      mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(4));
      await expect(
        new FeedService(prisma, clockAt('2026-08-24T12:00:00.000Z')).addComment('post-1', 'fan-1', { contentText: 'x' }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'contest_final_locked' }) });
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('deleting the last visible comment removes the commenter\'s point; deleting one of several keeps it', async () => {
      for (const [remaining, removed] of [[0, true], [2, false]] as const) {
        const prisma = buildPrismaMock();
        mocks(prisma).contestEntry.findUnique.mockResolvedValue(entryRow(1));
        (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
          id: 'c1', postId: 'post-1', authorId: 'fan-1', hidden: false, post: { authorId: 'author-1' },
        });
        (prisma.comment as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(remaining);
        await new FeedService(prisma, FIXED_CLOCK).deleteComment('post-1', 'c1', 'fan-1');
        expect(mocks(prisma).contestEngagement.deleteMany).toHaveBeenCalledTimes(removed ? 1 : 0);
      }
    });
  });

  describe('createPost for the final entry', () => {
    it('stores the reveal and community-feed gates on the post and runs the caller\'s step inside the same transaction', async () => {
      const prisma = buildPrismaMock();
      const row = buildPostRow({ id: 'post-final' });
      (prisma.post.create as jest.Mock).mockResolvedValue(row);
      (prisma.post as unknown as { findUniqueOrThrow: jest.Mock }).findUniqueOrThrow = jest.fn().mockResolvedValue({
        ...row,
        contestEntry: { id: 'entry-9', pinnedUntil: new Date('2026-09-01T00:00:00Z'), pinRemovedAt: null, round: { weekNumber: 4 } },
      });
      const visibleFrom = new Date('2026-08-24T23:00:00Z');
      const communityFeedFrom = new Date('2026-08-31T23:00:00Z');
      const inTransaction = jest.fn().mockResolvedValue(undefined);

      const result = await new FeedService(prisma, FIXED_CLOCK).createPost(
        'author-1',
        { contentText: 'final' },
        { visibleFrom, communityFeedFrom, inTransaction },
      );

      expect((prisma.post.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ visibleFrom, communityFeedFrom });
      expect(inTransaction).toHaveBeenCalledWith(prisma, { id: 'post-final', createdAt: row.createdAt });
      expect(result.contest).toEqual({ entryId: 'entry-9', kind: 'final', weekNumber: 4, pinned: true, label: 'Contest post' });
    });

    it('an ordinary post sets neither gate', async () => {
      const prisma = buildPrismaMock();
      (prisma.post.create as jest.Mock).mockResolvedValue(buildPostRow());
      await new FeedService(prisma, FIXED_CLOCK).createPost('author-1', { contentText: 'hi' });
      const data = (prisma.post.create as jest.Mock).mock.calls[0][0].data;
      expect(data.visibleFrom).toBeUndefined();
      expect(data.communityFeedFrom).toBeUndefined();
    });
  });

  describe('the contest label on a post', () => {
    it('is pinned until the pin is removed or the month ends, and the label never changes', async () => {
      const mk = (over: Record<string, unknown>) =>
        buildPostRow({
          contestEntry: { id: 'e', pinnedUntil: new Date('2026-09-01T00:00:00Z'), pinRemovedAt: null, round: { weekNumber: 1 }, ...over },
        });
      const prisma = buildPrismaMock();
      (prisma.post.findFirst as jest.Mock).mockResolvedValue(mk({}));
      const during = await new FeedService(prisma, clockAt('2026-08-20T00:00:00Z')).getPostById('post-1', 'viewer-1');
      expect(during.contest).toEqual({ entryId: 'e', kind: 'weekly', weekNumber: 1, pinned: true, label: 'Contest post' });

      (prisma.post.findFirst as jest.Mock).mockResolvedValue(mk({}));
      const after = await new FeedService(prisma, clockAt('2026-09-01T00:00:00Z')).getPostById('post-1', 'viewer-1');
      expect(after.contest).toMatchObject({ pinned: false, label: 'Contest post' });

      (prisma.post.findFirst as jest.Mock).mockResolvedValue(mk({ pinRemovedAt: new Date('2026-08-31T23:00:00Z') }));
      const removed = await new FeedService(prisma, clockAt('2026-08-31T23:30:00Z')).getPostById('post-1', 'viewer-1');
      expect(removed.contest).toMatchObject({ pinned: false });
    });
  });
});

// backend/w12-points (B-093; Decision Log #382, #383; spec 9b): WHEN FeedService hands an engagement to the
// baseline points engine, and when it revokes it. The engine's own rules (caps, eligibility, quarter
// units) are in engagement-points.util.spec.ts and the real-Postgres e2e.
describe('FeedService: baseline points wiring (B-093)', () => {
  const caps = { givenQuarters: 160, receivedQuarters: 80 };
  const buildService = (prisma: PrismaService) =>
    new FeedService(prisma, FIXED_CLOCK, { caps } as unknown as import('../points/points-config.service').PointsConfig);

  function postRow(prisma: PrismaService, authorId = 'author-1') {
    (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId, commentPermission: 'everyone' });
  }

  it('a like hands the engine the liker, the creator, the post, the clock and the configured caps', async () => {
    const prisma = buildPrismaMock();
    postRow(prisma);
    (prisma.like.create as jest.Mock).mockResolvedValue({ id: 'l' });
    (prisma.post.update as jest.Mock).mockResolvedValue({});
    await buildService(prisma).likePost('liker-1', 'post-1');
    expect(awardEngagementPoints).toHaveBeenCalledWith(expect.anything(), {
      kind: 'like',
      postId: 'post-1',
      postAuthorId: 'author-1',
      giverId: 'liker-1',
      now: FIXED_NOW,
      caps,
    });
  });

  it('a duplicate like (P2002) rolls the transaction back and awards nothing', async () => {
    const prisma = buildPrismaMock();
    postRow(prisma);
    (prisma.like.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );
    await buildService(prisma).likePost('liker-1', 'post-1');
    expect(awardEngagementPoints).not.toHaveBeenCalled();
  });

  it('a comment awards the commenter and the creator once per call (the engine dedupes ten comments to one)', async () => {
    const prisma = buildPrismaMock();
    postRow(prisma);
    (prisma.comment.create as jest.Mock).mockResolvedValue({
      id: 'c',
      postId: 'post-1',
      contentText: 'nice',
      createdAt: new Date(),
      author: { id: 'commenter-1', displayName: 'X', username: null },
    });
    (prisma.post.update as jest.Mock).mockResolvedValue({});
    await buildService(prisma).addComment('post-1', 'commenter-1', { contentText: 'nice' });
    expect(awardEngagementPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'comment', postId: 'post-1', postAuthorId: 'author-1', giverId: 'commenter-1' }),
    );
  });

  it('deleting a comment revokes the comment points only when it was the account\'s LAST visible comment', async () => {
    const prisma = buildPrismaMock();
    (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
      id: 'c',
      postId: 'post-1',
      authorId: 'commenter-1',
      hidden: false,
      post: { authorId: 'author-1' },
    });
    (prisma.comment.delete as jest.Mock).mockResolvedValue({});
    (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const service = buildService(prisma);

    (prisma.comment.count as jest.Mock).mockResolvedValue(2); // two other visible comments remain
    await service.deleteComment('post-1', 'c', 'commenter-1');
    expect(revokeEngagementPoints).not.toHaveBeenCalled();

    (prisma.comment.count as jest.Mock).mockResolvedValue(0);
    await service.deleteComment('post-1', 'c', 'commenter-1');
    expect(revokeEngagementPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'comment', postId: 'post-1', postAuthorId: 'author-1', giverId: 'commenter-1' }),
    );
  });

  it('hiding the last visible comment revokes the points; unhiding restores them through the engine', async () => {
    const prisma = buildPrismaMock();
    postRow(prisma, 'owner');
    (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
      id: 'c',
      postId: 'post-1',
      authorId: 'commenter-1',
      contentText: 'hi',
    });
    (prisma.comment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.post.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.post.update as jest.Mock).mockResolvedValue({});
    (prisma.comment.count as jest.Mock).mockResolvedValue(0);
    const service = buildService(prisma);

    await service.setCommentHidden('post-1', 'c', 'owner', true);
    expect(revokeEngagementPoints).toHaveBeenCalledTimes(1);

    await service.setCommentHidden('post-1', 'c', 'owner', false);
    expect(awardEngagementPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'comment', giverId: 'commenter-1', postAuthorId: 'owner' }),
    );
  });

  it('a hide/unhide that changes nothing (repeat call) touches no points', async () => {
    const prisma = buildPrismaMock();
    postRow(prisma, 'owner');
    (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
      id: 'c',
      postId: 'post-1',
      authorId: 'commenter-1',
      contentText: 'hi',
    });
    (prisma.comment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await buildService(prisma).setCommentHidden('post-1', 'c', 'owner', true);
    expect(revokeEngagementPoints).not.toHaveBeenCalled();
    expect(awardEngagementPoints).not.toHaveBeenCalled();
  });

  it('deleting a post revokes every baseline row earned on it, inside the same transaction', async () => {
    const prisma = buildPrismaMock();
    postRow(prisma, 'owner');
    (prisma.postHashtag.findMany as jest.Mock).mockResolvedValue([]);
    await buildService(prisma).deletePost('post-1', 'owner');
    expect(revokeEngagementPointsForPost).toHaveBeenCalledWith(expect.anything(), 'post-1', FIXED_NOW);
    expect(prisma.post.delete).toHaveBeenCalled();
  });

  it('creating a post earns nothing (B-094): the engine is not called', async () => {
    const prisma = buildPrismaMock();
    (prisma.post.create as jest.Mock).mockResolvedValue({
      id: 'p',
      contentText: 'x',
      mediaUrls: [],
      media: [],
      createdAt: new Date(),
      author: { id: 'a', displayName: 'A', username: null },
    });
    await buildService(prisma).createPost('a', { contentText: 'x' });
    expect(awardEngagementPoints).not.toHaveBeenCalled();
  });
});

// backend/w14-post-media-pipeline (Decision Log #419 item 5): the one gate every post read path inherits.
describe('visibleToViewer (post media gate)', () => {
  const NOW = new Date('2026-11-05T10:00:00Z');

  it("ANDs the existing reveal gate with the media gate, so a post with unapproved media is the author's alone", () => {
    expect(visibleToViewer('me', NOW)).toEqual({
      AND: [
        { OR: [{ visibleFrom: null }, { visibleFrom: { lte: NOW } }, { authorId: 'me' }] },
        { OR: [{ authorId: 'me' }, POST_MEDIA_ALL_APPROVED] },
      ],
    });
  });
});
