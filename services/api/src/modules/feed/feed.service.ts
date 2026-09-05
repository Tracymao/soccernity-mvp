import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ENGAGEMENT_POINTS } from '../points/points.constants';
import { awardPoints } from '../points/points.util';
import { decodeFeedCursor, encodeFeedCursor } from './cursor.util';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE, FeedQueryDto } from './dto/feed-query.dto';

// Fields returned for a post's embedded author. Mirrors UsersService's
// OWN_PROFILE_SELECT precedent in one sense (a Prisma `select`, not a
// post-hoc field strip — passwordHash never leaves Postgres via this
// code path) but is deliberately narrower: OWN_PROFILE_SELECT is what
// the AUTHENTICATED OWNER sees about themselves; this is what ANY other
// user sees about a post's author. No `GET /users/:id/profile` (the
// public-facing view of another user, Section 4.2) exists yet to define
// a public field set — it's explicitly out of scope per
// users/users.controller.ts's own header comment — so `id` + `displayName`
// is the narrowest defensible set until that endpoint exists and settles
// the question properly. In particular: isMinor is never selected here,
// on purpose — there's no reason for that safeguarding-sensitive field
// to ever appear in another user's feed payload.
const POST_AUTHOR_SELECT = {
  id: true,
  displayName: true,
} as const;

const POST_SELECT = {
  id: true,
  authorId: true,
  author: { select: POST_AUTHOR_SELECT },
  contentText: true,
  mediaUrls: true,
  clubPageId: true,
  banterRoomId: true,
  // Denormalized caches, per schema.prisma's comment on Post.likeCount —
  // safe to expose as plain ints on a lean list payload. This slice
  // never creates a Like or Comment, so both stay at their schema
  // default of 0 on every post this code path creates; see
  // feed/README.md.
  likeCount: true,
  commentCount: true,
  createdAt: true,
} as const;

export type FeedPost = Prisma.PostGetPayload<{ select: typeof POST_SELECT }>;

// What GET /posts/feed and GET /posts/:id actually return to a client:
// the raw post plus three per-request-user-computed booleans (Decision
// Log #153). None of them are stored columns — they're derived, per
// request, from the CALLING user's own Like / SavedPost / Follow rows:
//
//   - isLiked            — does a Like row exist for (callerId, postId)?
//   - isSaved            — does a SavedPost row exist for (callerId, postId)?
//   - author.isFollowing — does a Follow row exist for
//                          (followerId: callerId, followeeId: post.authorId)?
//
// isFollowing is a hard `false` — never a lookup result — for the
// caller's OWN posts: UsersService.followUser rejects a self-follow, so a
// Follow row where followerId === followeeId can never exist, and the
// frontend consumes a real `false` more simply than a null.
//
// These are computed WITHOUT an N+1: getFeed() resolves a whole page in
// three batched `findMany({ where: { …: { in: [...] } } })` queries;
// getPostById() resolves a single row with three unique-key existence
// checks. See attachViewerState() / getPostById().
export type FeedPostWithViewerState = FeedPost & {
  isLiked: boolean;
  isSaved: boolean;
  author: FeedPost['author'] & { isFollowing: boolean };
};

export interface FeedPage {
  items: FeedPostWithViewerState[];
  nextCursor: string | null;
}

// Fields returned for a comment's embedded author — deliberately the
// same narrow set as POST_AUTHOR_SELECT, for the identical reason: no
// `GET /users/:id/profile` exists yet to define a public field set, so
// `id` + `displayName` is the narrowest defensible shape until it does.
const COMMENT_SELECT = {
  id: true,
  postId: true,
  authorId: true,
  author: { select: POST_AUTHOR_SELECT },
  contentText: true,
  createdAt: true,
} as const;

export type FeedComment = Prisma.CommentGetPayload<{ select: typeof COMMENT_SELECT }>;

export interface CommentPage {
  items: FeedComment[];
  nextCursor: string | null;
}

export interface LikeState {
  postId: string;
  liked: boolean;
  likeCount: number;
}

export interface SaveState {
  postId: string;
  saved: boolean;
}

// Shape for a single GET /users/:id/saved-posts entry: the saved-at
// timestamp plus the full embedded post (reusing POST_SELECT, same
// field-minimization discipline as everywhere else in this module).
//
// NOTE (Decision Log #153): the embedded `post` here is the RAW FeedPost
// shape, NOT FeedPostWithViewerState — getSavedPosts does not attach
// isLiked / isSaved / author.isFollowing. `isSaved` would be trivially
// `true` for every row (that's what "saved posts" means), but isLiked /
// isFollowing would need the same enrichment getFeed does. Left as a
// flagged follow-up rather than done here: this task (Decision Log #153)
// scoped the fields to GET /posts/feed and GET /posts/:id only, and
// apps/web's saved-posts screen isn't built yet. Same story for
// createPost's response (a freshly created post: isLiked / isSaved /
// isFollowing are all trivially false).
const SAVED_POST_SELECT = {
  postId: true,
  savedAt: true,
  post: { select: POST_SELECT },
} as const;

export type SavedPostEntry = Prisma.SavedPostGetPayload<{ select: typeof SAVED_POST_SELECT }>;

export interface SavedPostPage {
  items: SavedPostEntry[];
  nextCursor: string | null;
}

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(authorId: string, dto: CreatePostDto): Promise<FeedPost> {
    // Cross-field rule ("at most one of clubPageId/banterRoomId"), so it
    // belongs in the service layer, not a static DTO decorator — same
    // precedent as RegistrationService enforcing "guardian required when
    // isMinor" instead of putting that logic on RegisterDto itself (see
    // registration.service.ts / register.dto.ts).
    if (dto.clubPageId && dto.banterRoomId) {
      throw new BadRequestException('A post cannot belong to both a club page and a Banter Room');
    }

    try {
      // Wrapped in a transaction (previously a bare create) so the
      // baseline-engagement points award lands atomically with the Post
      // — sprint-2/contest-data-model-backend, Decision Log #219. Same
      // "write the ledger row in the same tx as the thing it pays for"
      // discipline the like/follow/contest award sites use. refId is the
      // new post id (always unique, so the ledger @@unique never fires
      // here); occurredAt is the post's own createdAt, not write time.
      return await this.prisma.$transaction(async (tx) => {
        const post = await tx.post.create({
          data: {
            authorId,
            contentText: dto.contentText,
            mediaUrls: dto.mediaUrls ?? [],
            clubPageId: dto.clubPageId,
            banterRoomId: dto.banterRoomId,
          },
          select: POST_SELECT,
        });
        await awardPoints(tx, {
          userId: authorId,
          source: 'engagement_post',
          refId: post.id,
          points: ENGAGEMENT_POINTS.POST_CREATED,
          occurredAt: post.createdAt,
        });
        return post;
      });
    } catch (err) {
      // A clubPageId/banterRoomId that's well-formed at the DTO layer
      // (a non-empty string) but doesn't reference a real row fails at
      // the database as a foreign-key violation (Prisma P2003) — surface
      // that as a 400, not an unhandled 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException('clubPageId or banterRoomId does not reference a real record');
      }
      throw err;
    }
  }

  // Scope: the caller's own posts, plus posts by anyone the caller
  // follows (Follow model: followerId is the caller, followeeId is who
  // they follow — `author.followedBy` is the inverse side, Follow rows
  // where the post's author is the followee). Build Plan Section 4.3
  // lists the `GET /posts/feed` endpoint but does not define its scope
  // beyond that — this is a judgment call, flagged as a Decision Log
  // candidate in feed/README.md rather than invented silently. Club-page
  // and Banter-Room membership are deliberately NOT part of this scope
  // query on their own (a post from a club/room the caller belongs to,
  // by an author the caller doesn't follow, will not appear) — see the
  // README for why that's flagged too.
  async getFeed(userId: string, query: FeedQueryDto): Promise<FeedPage> {
    // Math.min is defense-in-depth: FeedQueryDto's own @Max(50) already
    // enforces this at the HTTP boundary, but getFeed() is also callable
    // directly (as it is in this module's own unit tests), so the
    // ceiling shouldn't rely solely on a decorator upstream of it.
    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const scopeFilter: Prisma.PostWhereInput = {
      OR: [{ authorId: userId }, { author: { followedBy: { some: { followerId: userId } } } }],
    };

    const where: Prisma.PostWhereInput = query.cursor
      ? { AND: [scopeFilter, this.buildCursorFilter(query.cursor)] }
      : scopeFilter;

    return this.paginatePostsWithViewerState(where, limit, userId);
  }

  // GET /clubs/:id/feed (sprint-2/club-fan-page-backend) — the
  // club-scoped counterpart of getFeed(), closing the backend half of
  // Decision Log #157. Section 4.3's GET /posts/feed is scoped to the
  // caller's own posts + follows and deliberately never reads
  // Post.clubPageId (see getFeed()'s own scope comment / feed/README.md
  // point 2); this is the club fan-page feed — every Post whose
  // clubPageId matches, newest-first, regardless of whether the caller
  // follows the author.
  //
  // Lives on FeedService (not ClubsService) so it reuses POST_SELECT,
  // attachViewerState (Decision Log #153 — isLiked / isSaved /
  // author.isFollowing), buildCursorFilter, and the feed cursor util
  // as-is: the response is the exact same FeedPage /
  // FeedPostWithViewerState shape GET /posts/feed returns, which is what
  // "paginated consistently with GET /posts/feed" means in practice.
  // ClubsController owns the /clubs/:id/feed route and calls
  // ClubsService.assertClubExists(id) before this runs, so a
  // non-existent club is a 404 (matching GET /clubs/:id); this method
  // itself does not re-check and would simply return an empty page for
  // an unknown clubPageId.
  //
  // No restricted-pending-minor content leak on this feed: POST /posts
  // is GuardianConsentGuard-gated (Decision Log #21), so a
  // restricted-pending minor has no posts to surface here in the first
  // place — nothing analogous to ClubsService.getClubMembers's roster
  // filter is needed.
  async getClubFeed(clubPageId: string, userId: string, query: FeedQueryDto): Promise<FeedPage> {
    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const scopeFilter: Prisma.PostWhereInput = { clubPageId };
    const where: Prisma.PostWhereInput = query.cursor
      ? { AND: [scopeFilter, this.buildCursorFilter(query.cursor)] }
      : scopeFilter;

    return this.paginatePostsWithViewerState(where, limit, userId);
  }

  // Shared "fetch limit+1 posts newest-first, trim the lookahead row,
  // build nextCursor from the last kept row, attach viewer state"
  // pipeline — getFeed() and getClubFeed() now differ only in their
  // WHERE clause. Factored once here for the same reason
  // UsersService.toFollowPage was (two callers, identical shape); the
  // per-caller inline repetition getComments()/getSavedPosts() still
  // use is fine for their single callers, this isn't a push to unify
  // those too.
  //
  // Keyset pagination (Section 5.5) ordered most-recent-first: createdAt
  // desc, id desc as the tiebreaker for rows sharing the same createdAt
  // timestamp — see cursor.util.ts and feed-query.dto.ts. take: limit + 1
  // is the standard "fetch one extra row" trick to know whether a next
  // page exists without a separate COUNT() query.
  private async paginatePostsWithViewerState(
    where: Prisma.PostWhereInput,
    limit: number,
    userId: string,
  ): Promise<FeedPage> {
    const rows = await this.prisma.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: POST_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor = hasMore && last ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id }) : null;

    const items = await this.attachViewerState(userId, trimmed);
    return { items, nextCursor };
  }

  // Decision Log #153 — resolves isLiked / isSaved / author.isFollowing
  // for a whole feed page in THREE batched queries, never one lookup per
  // post (no N+1). Empty-page-safe: a page with no posts skips all three
  // lookups rather than issuing empty-IN queries. The follow lookup is
  // additionally scoped to authors OTHER than the caller — a self-follow
  // row never exists, so the caller's own posts get isFollowing: false
  // with nothing queried for them.
  private async attachViewerState(userId: string, posts: FeedPost[]): Promise<FeedPostWithViewerState[]> {
    if (posts.length === 0) {
      return [];
    }

    const postIds = posts.map((p) => p.id);
    const otherAuthorIds = [
      ...new Set(posts.filter((p) => p.authorId !== userId).map((p) => p.authorId)),
    ];

    const [likedRows, savedRows, followedRows] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
      this.prisma.savedPost.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
      otherAuthorIds.length > 0
        ? this.prisma.follow.findMany({
            where: { followerId: userId, followeeId: { in: otherAuthorIds } },
            select: { followeeId: true },
          })
        : Promise.resolve([] as { followeeId: string }[]),
    ]);

    const likedPostIds = new Set(likedRows.map((r) => r.postId));
    const savedPostIds = new Set(savedRows.map((r) => r.postId));
    const followedAuthorIds = new Set(followedRows.map((r) => r.followeeId));

    return posts.map((post) => ({
      ...post,
      isLiked: likedPostIds.has(post.id),
      isSaved: savedPostIds.has(post.id),
      author: {
        ...post.author,
        isFollowing: post.authorId !== userId && followedAuthorIds.has(post.authorId),
      },
    }));
  }

  private buildCursorFilter(rawCursor: string): Prisma.PostWhereInput {
    const cursor = decodeFeedCursor(rawCursor);
    return {
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    };
  }

  // GET /posts/:id — reuses POST_SELECT as-is (see feed/README.md: no
  // divergence needed, the fields a single-post view should show are the
  // same fields a feed-list view should show). A non-existent id is a
  // 404, never a silent null 200 — callers (including the like/comment/
  // save handlers below, via their own existence checks) should never
  // have to distinguish "post not found" from "post found but empty."
  //
  // Takes `userId` (the caller, from @CurrentUser() — a real controller-
  // signature change made alongside this, see feed.controller.ts) so it
  // can attach the same isLiked / isSaved / author.isFollowing viewer
  // state getFeed() does (Decision Log #153). One row, so three
  // unique-key existence checks — no batching needed. isFollowing is
  // forced false without a lookup for the caller's own post, same as
  // attachViewerState().
  async getPostById(postId: string, userId: string): Promise<FeedPostWithViewerState> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: POST_SELECT });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const isOwnPost = post.authorId === userId;
    const [likeRow, savedRow, followRow] = await Promise.all([
      this.prisma.like.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { id: true },
      }),
      this.prisma.savedPost.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { id: true },
      }),
      isOwnPost
        ? Promise.resolve(null)
        : this.prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: userId, followeeId: post.authorId } },
            select: { id: true },
          }),
    ]);

    return {
      ...post,
      isLiked: likeRow !== null,
      isSaved: savedRow !== null,
      author: { ...post.author, isFollowing: followRow !== null },
    };
  }

  // Shared existence check for every action endpoint below (like/unlike,
  // comment, save/unsave) — all six need "does this postId reference a
  // real Post" as their first move, and all six must 404 (not a raw FK
  // violation surfaced as 400/500) when it doesn't.
  //
  // Returns { id, authorId } rather than void, as of the follow/
  // notification-wiring PR (sprint-2/follow-and-notifications): likePost
  // and addComment need the post's authorId to (a) determine the
  // Notification recipient and (b) suppress a self-notification when the
  // actor IS the post's author. unlikePost/savePost/unsavePost/
  // getComments still call this the same way as before and simply don't
  // use the returned value — a purely additive signature change, not a
  // restructuring of this shared check.
  private async assertPostExists(postId: string): Promise<{ id: string; authorId: string }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  // POST /posts/:id/like. Like.@@unique([userId, postId]) is the
  // idempotency backstop: creating the Like row and incrementing
  // likeCount happen inside one interactive transaction
  // ($transaction(async (tx) => ...), not the array form getFeed's
  // sibling methods don't need here). Interactive, not array-form, is a
  // deliberate choice: the array form evaluates every operation eagerly
  // (each `prisma.model.method(...)` call is made — and, in a real
  // client, queued — before $transaction itself runs), so there is no
  // clean way to make the SECOND operation conditional on whether the
  // FIRST one actually happened. The callback form runs its body
  // top-to-bottom with normal `await`/throw semantics: if `tx.like.create`
  // throws (Postgres unique-constraint violation, Prisma P2002, because
  // this user already liked this post), `tx.post.update` never executes
  // at all — not even as a request — and the whole transaction rolls
  // back. That's caught below and treated as an idempotent success, not
  // a 500, and importantly NOT a double-increment of a count that was
  // already correct.
  //
  // Notification wiring (sprint-2/follow-and-notifications): a
  // Notification row (type: 'like', payloadRefId: postId, recipient
  // userId: the POST'S AUTHOR — never the actor) is created inside this
  // same transaction, immediately after the increment. Because it's
  // inside the same $transaction callback, if tx.like.create threw
  // P2002 above, execution never reaches this notification create at
  // all — the whole callback (increment included) already rolled back —
  // so a duplicate/idempotent like can never produce a duplicate
  // Notification. No self-notification: skipped entirely when the actor
  // IS the post's author (liking your own post is a real path through
  // this code today, tested explicitly).
  async likePost(userId: string, postId: string): Promise<LikeState> {
    const post = await this.assertPostExists(postId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.like.create({ data: { userId, postId } });
        await tx.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
        if (post.authorId !== userId) {
          await tx.notification.create({
            data: { userId: post.authorId, type: 'like', payloadRefId: postId },
          });
        }
        // Baseline-engagement point for the LIKER (the action-taker, not
        // the post author) — sprint-2/contest-data-model-backend,
        // Decision Log #219. Only reached on a genuine first like (a
        // duplicate like throws P2002 on tx.like.create above and this
        // whole callback rolls back), and the ledger's own
        // @@unique([source, refId, userId]) is a backstop so a
        // like → unlike → re-like never re-awards.
        await awardPoints(tx, {
          userId,
          source: 'engagement_like',
          refId: postId,
          points: ENGAGEMENT_POINTS.LIKE_GIVEN,
        });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already liked — fall through and report current state without
      // having touched likeCount a second time.
    }

    return { postId, liked: true, likeCount: await this.currentLikeCount(postId) };
  }

  // DELETE /posts/:id/like. Symmetric idempotency to likePost(): if no
  // Like row exists for this (userId, postId), this is a no-op success,
  // not a 404 — "you don't have this liked" and "you successfully
  // ensured this isn't liked" land on the same observable state, so
  // there's nothing to error about. When a row DOES exist, its deletion
  // and the likeCount decrement happen in the same interactive
  // transaction as likePost() above, for the identical
  // conditional-execution reason. The decrement itself additionally
  // guards against a race driving likeCount negative: it's expressed as
  // an `updateMany` scoped to `likeCount: { gt: 0 }`, so even if two
  // concurrent unlike requests both observed the Like row before either
  // deleted it, at most one of them can actually decrement once the row
  // (and, if it lost the race, the transaction itself) is gone. The
  // transaction is additionally wrapped to treat a concurrent-delete
  // race (Prisma P2025 — "record to delete does not exist," raised if a
  // second request's delete loses the race after this request's own
  // existence check passed) as the same idempotent success, rather than
  // a 500.
  async unlikePost(userId: string, postId: string): Promise<LikeState> {
    await this.assertPostExists(postId);

    const existing = await this.prisma.like.findUnique({ where: { userId_postId: { userId, postId } } });
    if (existing) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.like.delete({ where: { userId_postId: { userId, postId } } });
          await tx.post.updateMany({
            where: { id: postId, likeCount: { gt: 0 } },
            data: { likeCount: { decrement: 1 } },
          });
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
          throw err;
        }
        // Lost a race with a concurrent unlike — already gone, treat as
        // the same idempotent success.
      }
    }

    return { postId, liked: false, likeCount: await this.currentLikeCount(postId) };
  }

  private async currentLikeCount(postId: string): Promise<number> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
    return post?.likeCount ?? 0;
  }

  // POST /posts/:id/comments. Unlike likes/saves, a comment has no
  // uniqueness constraint to be idempotent about — two identical
  // comments from the same user are two distinct rows, same as two
  // identical posts would be. What DOES need atomicity is the Comment
  // row and the commentCount increment landing together: the same
  // interactive-transaction pattern as likePost/unlikePost above (see
  // their comments for why the callback form, not the array form, is
  // used throughout this module) — see the comment on Post.commentCount
  // in schema.prisma for the obligation this honors. There is no
  // decrement path here on purpose: Section 4.3 has no
  // DELETE /posts/:id/comments/:commentId, so nothing in this codebase
  // ever removes a Comment row — see schema.prisma and feed/README.md.
  //
  // Notification wiring (sprint-2/follow-and-notifications): same
  // pattern as likePost — a Notification row (type: 'comment',
  // payloadRefId: postId, recipient userId: the POST'S AUTHOR, i.e.
  // `post.authorId` below, never the commenter) is created inside this
  // same transaction, after the Comment row and the commentCount
  // increment. No self-notification when the commenter IS the post's
  // author (`post.authorId !== authorId`, where `authorId` here is the
  // COMMENT's author param, not to be confused with `post.authorId`).
  // Unlike likePost, there is no idempotency concern to guard against
  // here — every addComment call creates a genuinely new Comment row
  // (see the comment above), so there's no duplicate-notification case
  // analogous to the like P2002 path.
  async addComment(postId: string, authorId: string, dto: CreateCommentDto): Promise<FeedComment> {
    const post = await this.assertPostExists(postId);

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: { postId, authorId, contentText: dto.contentText },
        select: COMMENT_SELECT,
      });
      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      if (post.authorId !== authorId) {
        await tx.notification.create({
          data: { userId: post.authorId, type: 'comment', payloadRefId: postId },
        });
      }
      return comment;
    });
  }

  // GET /posts/:id/comments. Same keyset-cursor pagination pattern as
  // getFeed() (Section 5.5), reusing cursor.util.ts's encode/decode
  // as-is — the envelope shape ({ createdAt, id }) is generic, so no
  // second cursor format is invented for comments. Ordering is
  // deliberately oldest-first (createdAt asc, id asc as the tiebreaker),
  // the opposite direction from the feed's most-recent-first: Section
  // 4.3 doesn't specify a comment-thread order, and this is a documented
  // judgment call (see feed/README.md), not an oversight — a comment
  // thread reads naturally top-to-bottom in the order it was written,
  // the same convention essentially every comment UI (this codebase's
  // own Figma-derived screens included) follows.
  async getComments(postId: string, query: FeedQueryDto): Promise<CommentPage> {
    await this.assertPostExists(postId);

    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const where: Prisma.CommentWhereInput = query.cursor
      ? { postId, ...this.buildCommentsCursorFilter(query.cursor) }
      : { postId };

    const rows = await this.prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: COMMENT_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  private buildCommentsCursorFilter(rawCursor: string): Prisma.CommentWhereInput {
    const cursor = decodeFeedCursor(rawCursor);
    // Ascending-order counterpart of buildCursorFilter() above: "greater
    // than" instead of "less than," because comments page oldest-first
    // while the main feed pages newest-first.
    return {
      OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
    };
  }

  // DELETE /posts/:id/comments/:commentId. Deliberately NOT the
  // idempotent-200 pattern likePost/unlikePost/savePost/unsavePost use —
  // see feed/README.md's "Is comment deletion idempotent?" section. A
  // Comment has its own single-row primary-key identity (unlike a
  // Like/SavedPost's @@unique([userId, postId]) toggle relationship,
  // where "absent" is a normal, repeatedly-reachable resting state): once
  // a given commentId is deleted, a second DELETE on it is genuinely
  // indistinguishable from calling it on a commentId that never existed —
  // both are a real 404, not a synthesized 200.
  //
  // Existence-and-belongs-to-this-post is checked BEFORE authorization,
  // and both failure modes are 404, not 403 — a commentId that exists but
  // references a DIFFERENT postId than the URL's :id is a resource-
  // identity mismatch (the URL is simply wrong about where this comment
  // lives), not an authorization question, so it gets the same status as
  // "this commentId doesn't exist at all" rather than leaking that the id
  // is real via a 403.
  //
  // Authorization: the comment's own author, OR the post's author, may
  // delete it — there is no moderator/admin role anywhere in this
  // codebase yet, and this matches how comment moderation works on
  // comparable platforms (you can always delete your own comment; a post
  // author can remove comments left on their own post). Neither → 403
  // ForbiddenException, the same "authenticated but not authorized for
  // this resource" convention UsersController.assertSelf() /
  // SavedPostsController.assertSelf() already established (403, not 404,
  // once the resource's existence itself is settled).
  //
  // Atomic counter update: the Comment row's deletion and
  // Post.commentCount's decrement happen inside one interactive
  // $transaction, mirroring the create-side increment in addComment()
  // above and closing the decrement gap schema.prisma's own comment on
  // Post.commentCount has flagged since PR #54. The decrement itself
  // additionally uses updateMany with a commentCount: { gt: 0 }
  // where-clause floor guard — the same two-layer guard reasoning
  // leaveClub() uses for memberCount (a straightforward delete-then-
  // decrement shouldn't be able to double-fire here, since a Comment's
  // own primary key — not a toggle relationship — backs the existence
  // check above, but the floor guard is cheap, already-established
  // codebase precedent, and costs nothing to include as a second line of
  // defense).
  async deleteComment(postId: string, commentId: string, requestingUserId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, authorId: true, post: { select: { authorId: true } } },
    });

    if (!comment || comment.postId !== postId) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== requestingUserId && comment.post.authorId !== requestingUserId) {
      throw new ForbiddenException('You may only delete your own comments, or comments on your own post');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.delete({ where: { id: commentId } });
      await tx.post.updateMany({
        where: { id: postId, commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });
    });
  }

  // POST /posts/:id/save. SavedPost.@@unique([userId, postId]) backs the
  // same idempotency pattern as likePost(), but there is no denormalized
  // counter anywhere on SavedPost or Post for "save" — nothing to
  // increment. A duplicate save (P2002) is caught and treated as
  // success.
  async savePost(userId: string, postId: string): Promise<SaveState> {
    await this.assertPostExists(postId);

    try {
      await this.prisma.savedPost.create({ data: { userId, postId } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already saved — idempotent success.
    }

    return { postId, saved: true };
  }

  // DELETE /posts/:id/save. Symmetric to unlikePost(), but simpler:
  // there's no counter to guard against going negative, so a plain
  // delete-and-catch-P2025 (unlike unlikePost's separate
  // findUnique-then-delete-then-updateMany dance, which exists only
  // because of likeCount) is sufficient here.
  async unsavePost(userId: string, postId: string): Promise<SaveState> {
    await this.assertPostExists(postId);

    try {
      await this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
        throw err;
      }
      // Wasn't saved — idempotent success.
    }

    return { postId, saved: false };
  }

  // GET /users/:id/saved-posts. Scope (self-only, enforced by the
  // controller — see feed/README.md and users/README.md's precedent)
  // isn't this method's concern; by the time userId reaches here it's
  // already the caller's own id. Same keyset-cursor pattern again, most-
  // recently-saved-first (savedAt desc, postId desc tiebreaker) — the
  // natural "what did I save recently" read, matching the feed's own
  // most-recent-first convention. postId (not SavedPost's own `id`,
  // which isn't selected here) is the tiebreaker because
  // @@unique([userId, postId]) already guarantees it's unique within a
  // single caller's rows — no need to select an extra field just for
  // this. Note the cursor envelope's `createdAt` field is reused to
  // carry SavedPost.savedAt here (see cursor.util.ts — the envelope
  // shape is a generic { timestamp, id } pair despite its field being
  // named for the feed's original use; renaming it would touch every
  // existing call site and test for no behavioral gain, so this method
  // instead documents the reuse here).
  async getSavedPosts(userId: string, query: FeedQueryDto): Promise<SavedPostPage> {
    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const where: Prisma.SavedPostWhereInput = query.cursor
      ? { userId, ...this.buildSavedPostsCursorFilter(query.cursor) }
      : { userId };

    const rows = await this.prisma.savedPost.findMany({
      where,
      orderBy: [{ savedAt: 'desc' }, { postId: 'desc' }],
      take: limit + 1,
      select: SAVED_POST_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeFeedCursor({ createdAt: last.savedAt, id: last.postId }) : null;

    return { items, nextCursor };
  }

  private buildSavedPostsCursorFilter(rawCursor: string): Prisma.SavedPostWhereInput {
    const cursor = decodeFeedCursor(rawCursor);
    return {
      OR: [{ savedAt: { lt: cursor.createdAt } }, { savedAt: cursor.createdAt, postId: { lt: cursor.id } }],
    };
  }
}
