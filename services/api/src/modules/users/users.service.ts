import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeFeedCursor, encodeFeedCursor } from '../feed/cursor.util';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE, FeedQueryDto } from '../feed/dto/feed-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Fields returned for the authenticated user's OWN profile. Notably:
//
// - passwordHash is never in this list, so there is no code path where it
//   is even pulled out of Postgres by this service, let alone serialized
//   into a response — this is a Prisma `select`, not a post-hoc `delete
//   result.passwordHash`, which would be one refactor away from a leak.
// - isMinor / verificationStatus ARE included, because this is a fresh
//   `findUnique`/`update` against Postgres on every single call — never
//   assembled from the JWT (which per token.types.ts carries only
//   { sub, role } and structurally cannot supply these fields anyway).
//   This satisfies the non-negotiable in CLAUDE.md and Build Plan
//   Section 5.7: safety-sensitive fields must come from a fresh DB read,
//   not a cached/trusted claim.
const OWN_PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  dateOfBirth: true,
  isMinor: true,
  role: true,
  verificationStatus: true,
  createdAt: true,
  clubAffiliationId: true,
} as const;

export type OwnProfile = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  dateOfBirth: Date;
  isMinor: boolean;
  role: string;
  verificationStatus: string;
  createdAt: Date;
  clubAffiliationId: string | null;
};

// The ONLY place request-body fields become a Prisma `data` object for
// this update. An explicit allowlist, not `{ ...dto }` — even if
// UpdateUserDto or the global ValidationPipe were ever loosened upstream,
// this function structurally cannot forward isMinor, role,
// verificationStatus, or any other field to Prisma, because it never
// reads them off `dto` in the first place.
function toUpdateData(dto: UpdateUserDto): { displayName?: string; phone?: string } {
  const data: { displayName?: string; phone?: string } = {};
  if (dto.displayName !== undefined) data.displayName = dto.displayName;
  if (dto.phone !== undefined) data.phone = dto.phone;
  return data;
}

// Minimal shape for a follower/followee entry on GET /users/:id/followers
// and GET /users/:id/following. Same {id, displayName}-only discipline
// FeedService's POST_AUTHOR_SELECT already established for "what any
// other user sees about someone else" -- deliberately re-declared here
// rather than imported, per this PR's own brief: POST_AUTHOR_SELECT is a
// private, unexported const in feed.service.ts, not reasonably
// importable across modules, so it's duplicated field-for-field instead
// of reaching for a broader User select. No isMinor, email, phone,
// dateOfBirth, verificationStatus, or passwordHash ever leaves Postgres
// via this select.
const FOLLOW_USER_SELECT = {
  id: true,
  displayName: true,
} as const;

export type FollowUser = Prisma.UserGetPayload<{ select: typeof FOLLOW_USER_SELECT }>;

export interface FollowPage {
  items: FollowUser[];
  nextCursor: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(userId: string): Promise<OwnProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: OWN_PROFILE_SELECT,
    });
    if (!user) {
      // A valid 15-minute access token for a since-deleted account is a
      // real (if rare) case, not a hypothetical — the token itself
      // can't know the account is gone.
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateOwnProfile(userId: string, dto: UpdateUserDto): Promise<OwnProfile> {
    const data = toUpdateData(dto);
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: OWN_PROFILE_SELECT,
    });
  }

  // Shared existence check for the four follow endpoints below, mirroring
  // FeedService.assertPostExists's exact shape/intent: "does :id
  // reference a real User" is the first move for follow/unfollow/
  // followers/following, and a well-formed but non-existent id must 404,
  // never a raw FK violation surfaced as 400/500.
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  // POST /users/:id/follow. followerId is the caller (from the verified
  // JWT), followeeId is :id. Self-follow is a business rule, not an auth
  // check -- rejected with 400 here, the same "cross-field/business
  // rules belong in the service layer" precedent FeedService.createPost
  // established for its clubPageId/banterRoomId mutual-exclusivity check.
  //
  // Idempotency mirrors FeedService.likePost exactly: Follow.@@unique
  // ([followerId, followeeId]) backs a P2002-on-duplicate-create being
  // caught and treated as success, not a 500. The Follow row's creation
  // and the recipient's Notification row are written inside the same
  // interactive transaction (see users/README.md's payloadRefId
  // convention) -- if the Follow create throws P2002, the Notification
  // create never runs, so a repeat follow can never produce a duplicate
  // Notification. type: 'follow' (matching Notification.type's
  // documented enum in schema.prisma exactly), payloadRefId: the
  // follower's own userId, so the recipient's client can resolve "who
  // followed me" from the notification alone.
  async followUser(followerId: string, followeeId: string): Promise<{ following: true }> {
    if (followerId === followeeId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.assertUserExists(followeeId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.follow.create({ data: { followerId, followeeId } });
        await tx.notification.create({
          data: { userId: followeeId, type: 'follow', payloadRefId: followerId },
        });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already following -- idempotent success, no duplicate Follow row
      // and (because the create never got this far) no duplicate
      // Notification either.
    }

    return { following: true };
  }

  // DELETE /users/:id/follow. Symmetric idempotency to unlikePost: no
  // Follow row for this (followerId, followeeId) pair is a no-op
  // success, not a 404 -- "you don't follow this user" and "you
  // successfully ensured you don't follow this user" are the same
  // observable end state. Self-unfollow is rejected the same way
  // self-follow is (400) -- stated once in this PR's brief for both
  // verbs together, and there is genuinely no Follow row a self-follow
  // rejection could ever have allowed to exist, so this is a consistency
  // choice, not a behavior change from the P2025-idempotent path it would
  // otherwise fall into.
  //
  // No Notification on unfollow, on purpose -- removing an action isn't
  // performing one; only followUser (and likePost/addComment in
  // FeedService) create Notification rows.
  async unfollowUser(followerId: string, followeeId: string): Promise<{ following: false }> {
    if (followerId === followeeId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }
    await this.assertUserExists(followeeId);

    try {
      await this.prisma.follow.delete({ where: { followerId_followeeId: { followerId, followeeId } } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
        throw err;
      }
      // Wasn't following -- idempotent success.
    }

    return { following: false };
  }

  // GET /users/:id/followers -- users who follow :id (Follow rows where
  // followeeId = :id, each entry is the follower). NOT self-scoped -- see
  // users/README.md's "followers/following public-scope reasoning" for
  // the full argument; short version: this is standard public social
  // graph data on every platform this product is modeled after, and
  // nothing in Section 8.3 step 5 or Section 5.7 restricts it.
  //
  // Same keyset-cursor pagination pattern as FeedService (cursor.util.ts
  // reused as-is, no second pagination scheme invented), ordered
  // most-recently-followed-first (createdAt desc, id desc tiebreaker on
  // Follow's own row id -- NOT the embedded user's id), matching the
  // feed's own most-recent-first convention. :id not referencing a real
  // User -> 404.
  async getFollowers(userId: string, query: FeedQueryDto): Promise<FollowPage> {
    await this.assertUserExists(userId);

    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const where: Prisma.FollowWhereInput = query.cursor
      ? { followeeId: userId, ...this.buildFollowCursorFilter(query.cursor) }
      : { followeeId: userId };

    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, createdAt: true, follower: { select: FOLLOW_USER_SELECT } },
    });

    return this.toFollowPage(rows, limit, (row) => row.follower);
  }

  // GET /users/:id/following -- users :id follows (Follow rows where
  // followerId = :id, each entry is the followee). Same scope/pagination
  // reasoning as getFollowers above, mirrored exactly.
  async getFollowing(userId: string, query: FeedQueryDto): Promise<FollowPage> {
    await this.assertUserExists(userId);

    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const where: Prisma.FollowWhereInput = query.cursor
      ? { followerId: userId, ...this.buildFollowCursorFilter(query.cursor) }
      : { followerId: userId };

    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, createdAt: true, followee: { select: FOLLOW_USER_SELECT } },
    });

    return this.toFollowPage(rows, limit, (row) => row.followee);
  }

  // Shared pagination-shaping helper for getFollowers/getFollowing --
  // both fetch limit+1 Follow rows (each embedding either `follower` or
  // `followee`, the only difference between the two callers) and need
  // the identical "trim the lookahead row, build nextCursor from the
  // last kept row's (createdAt, id)" logic FeedService.getFeed/
  // getComments/getSavedPosts each repeat inline for their own single
  // caller. With two callers sharing the exact same shape here, factoring
  // it once is worth the small indirection.
  private toFollowPage<T extends { id: string; createdAt: Date }>(
    rows: T[],
    limit: number,
    pickUser: (row: T) => FollowUser,
  ): FollowPage {
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore && last ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items: sliced.map(pickUser), nextCursor };
  }

  private buildFollowCursorFilter(rawCursor: string): Prisma.FollowWhereInput {
    const cursor = decodeFeedCursor(rawCursor);
    return {
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    };
  }
}
