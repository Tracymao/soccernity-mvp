import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeFeedCursor, encodeFeedCursor } from './cursor.util';
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

export interface FeedPage {
  items: FeedPost[];
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
      return await this.prisma.post.create({
        data: {
          authorId,
          contentText: dto.contentText,
          mediaUrls: dto.mediaUrls ?? [],
          clubPageId: dto.clubPageId,
          banterRoomId: dto.banterRoomId,
        },
        select: POST_SELECT,
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

    // Keyset pagination (Section 5.5) ordered most-recent-first:
    // createdAt desc, id desc as the tiebreaker for rows sharing the
    // same createdAt timestamp — see cursor.util.ts and
    // feed-query.dto.ts for the full reasoning. take: limit + 1 is the
    // standard "fetch one extra row" trick to know whether a next page
    // exists without a separate COUNT() query.
    const rows = await this.prisma.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: POST_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  private buildCursorFilter(rawCursor: string): Prisma.PostWhereInput {
    const cursor = decodeFeedCursor(rawCursor);
    return {
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    };
  }
}
