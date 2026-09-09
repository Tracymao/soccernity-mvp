import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import { FeedPage, FeedPost, FeedService } from '../feed/feed.service';
import {
  BANTER_ROOMS_DEFAULT_PAGE_SIZE,
  BANTER_ROOMS_MAX_PAGE_SIZE,
} from './banter.constants';
import {
  decodeBanterRoomCursor,
  decodeMyBantsCursor,
  encodeBanterRoomCursor,
  encodeMyBantsCursor,
} from './cursor.util';
import { CreateBanterPostDto } from './dto/create-banter-post.dto';
import { CreateBanterRoomDto } from './dto/create-banter-room.dto';
import { ListBanterRoomsQueryDto } from './dto/list-banter-rooms-query.dto';
import { MyBantsQueryDto } from './dto/my-bants-query.dto';

// Response shape for every GET /banter-rooms, GET /banter-rooms/search,
// GET /banter-rooms/mine and GET /banter-rooms/:id entry (Build Plan
// Section 4.4). Deliberately does NOT select `members` — same
// low-bandwidth discipline (Section 5.5) as ClubsService.CLUB_SELECT: a
// room with thousands of members returned inline on every page is
// exactly the unbounded payload that discipline exists to prevent.
// `createdBy` IS exposed (an opaque id, like GrassrootsTeam.createdById)
// so a client can tell whether the current user created the room without
// any organiser PII leaking.
const ROOM_SELECT = {
  id: true,
  name: true,
  scopeType: true,
  createdBy: true,
  memberCount: true,
} as const;

export type BanterRoomSummary = Prisma.BanterRoomGetPayload<{ select: typeof ROOM_SELECT }>;

// What the room endpoints actually return: the lean room row plus ONE
// per-request-user-computed boolean — `joined` is `true` iff a
// BanterRoomMember row exists for (this room, the CALLING user). Same
// discipline as ClubsService.ClubSummaryWithViewerState (Decision Log
// #154) and FeedService.FeedPostWithViewerState (Decision Log #153): an
// intersection on top, never added to ROOM_SELECT itself. Resolved
// WITHOUT an N+1 — see membershipSubset().
export type BanterRoomView = BanterRoomSummary & { joined: boolean };

export interface BanterRoomPage {
  items: BanterRoomView[];
  nextCursor: string | null;
}

// `joined` is a plain boolean (not a true/false literal split), mirroring
// ClubsService.JoinState / FeedService.LikeState — one interface for both
// joinRoom and leaveRoom rather than a parallel Join/Leave pair.
export interface JoinRoomState {
  roomId: string;
  joined: boolean;
  memberCount: number;
}

@Injectable()
export class BanterService {
  constructor(
    private readonly prisma: PrismaService,
    // GET /banter-rooms/:id/posts and POST /banter-rooms/:id/posts
    // delegate to FeedService — the room feed reuses
    // FeedService.getBanterRoomFeed (identical FeedPage /
    // FeedPostWithViewerState shape to GET /posts/feed) and room posts
    // reuse FeedService.createPost (the single post-creation path,
    // engagement-points award and all — never a second parallel
    // post.create). Same cross-module-DI pattern ClubsController already
    // uses for GET /clubs/:id/feed. BanterModule imports FeedModule;
    // FeedModule imports neither — no cycle.
    private readonly feed: FeedService,
  ) {}

  // POST /banter-rooms. `createdBy` is the caller, from the access token.
  // Guards (JwtAuthGuard + GuardianConsentGuard) are on the controller:
  // a Banter Room is a public-facing, persistent, named record other
  // users see and join — a "posting"-class action under Section 5.7's
  // broad reading (Decision Log #21), and Section 5.7 additionally names
  // "joining a Banter Room" as safety-sensitive.
  //
  // The creator is AUTO-JOINED (memberCount starts at 1, a
  // BanterRoomMember row is written in the same transaction). Judgment
  // call, flagged in banter/README.md: "create a group -> you're in it"
  // matches every comparable platform and keeps memberCount from being
  // misleadingly 0 for an active room. The alternative (creator must
  // then explicitly join their own room) was considered and not chosen.
  async createRoom(userId: string, dto: CreateBanterRoomDto): Promise<BanterRoomView> {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.banterRoom.create({
        data: { name: dto.name, scopeType: dto.scopeType, createdBy: userId, memberCount: 1 },
        select: ROOM_SELECT,
      });
      await tx.banterRoomMember.create({ data: { userId, banterRoomId: room.id } });
      return { ...room, joined: true };
    });
  }

  // GET /banter-rooms  and  GET /banter-rooms/search?q=
  //
  // Both routes share this one method (see list-banter-rooms-query.dto.ts):
  // an optional `scopeType` exact-match filter, an optional `q`
  // case-insensitive substring match on `name`. Ordered alphabetically by
  // `name` (BanterRoom has no timestamp — same as ClubPage, see
  // cursor.util.ts), `id` as the keyset tiebreaker. Keyset (not offset)
  // pagination, Section 5.5.
  async listRooms(query: ListBanterRoomsQueryDto, userId: string): Promise<BanterRoomPage> {
    const limit = Math.min(
      query.limit ?? BANTER_ROOMS_DEFAULT_PAGE_SIZE,
      BANTER_ROOMS_MAX_PAGE_SIZE,
    );

    const filters: Prisma.BanterRoomWhereInput[] = [];
    if (query.scopeType) filters.push({ scopeType: query.scopeType });
    if (query.q) filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    if (query.cursor) {
      const cursor = decodeBanterRoomCursor(query.cursor);
      filters.push({
        OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
      });
    }
    const where: Prisma.BanterRoomWhereInput = filters.length > 0 ? { AND: filters } : {};

    const rows = await this.prisma.banterRoom.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: ROOM_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeBanterRoomCursor({ name: last.name, id: last.id }) : null;

    const joinedIds = await this.membershipSubset(
      userId,
      trimmed.map((r) => r.id),
    );
    const items = trimmed.map((room) => ({ ...room, joined: joinedIds.has(room.id) }));

    return { items, nextCursor };
  }

  // GET /banter-rooms/mine — "My Bants" (Build Plan Section 6, Sprint 3).
  // The rooms the caller has joined, most-recently-joined first
  // (BanterRoomMember.joinedAt desc, banterRoomId tiebreak — see
  // cursor.util.ts). This is the whole reason the BanterRoomMember model
  // exists: BanterRoom.memberCount alone can't answer "which rooms is
  // this user in".
  async getMyRooms(userId: string, query: MyBantsQueryDto): Promise<BanterRoomPage> {
    const limit = Math.min(
      query.limit ?? BANTER_ROOMS_DEFAULT_PAGE_SIZE,
      BANTER_ROOMS_MAX_PAGE_SIZE,
    );

    const where: Prisma.BanterRoomMemberWhereInput = { userId };
    if (query.cursor) {
      const cursor = decodeMyBantsCursor(query.cursor);
      // Descending (newest-joined-first) keyset: "before this
      // (joinedAt, banterRoomId)".
      where.OR = [
        { joinedAt: { lt: cursor.joinedAt } },
        { joinedAt: cursor.joinedAt, banterRoomId: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.banterRoomMember.findMany({
      where,
      orderBy: [{ joinedAt: 'desc' }, { banterRoomId: 'desc' }],
      take: limit + 1,
      select: { joinedAt: true, banterRoomId: true, banterRoom: { select: ROOM_SELECT } },
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeMyBantsCursor({ joinedAt: last.joinedAt, id: last.banterRoomId })
        : null;

    // Every room in this list is, by definition, one the caller has
    // joined — so `joined` is a hard `true`, not a lookup. Same shape as
    // listRooms so the frontend type is uniform.
    const items = trimmed.map((m) => ({ ...m.banterRoom, joined: true }));

    return { items, nextCursor };
  }

  // Decision Log #154's exact pattern — the subset of `roomIds` the
  // caller is a member of, resolved in ONE batched query, never one
  // lookup per room (no N+1). Empty input -> empty Set with no query
  // issued.
  private async membershipSubset(userId: string, roomIds: string[]): Promise<Set<string>> {
    if (roomIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.banterRoomMember.findMany({
      where: { userId, banterRoomId: { in: roomIds } },
      select: { banterRoomId: true },
    });
    return new Set(rows.map((r) => r.banterRoomId));
  }

  // GET /banter-rooms/:id. Same ROOM_SELECT as the list entries — nothing
  // about viewing one room calls for more or fewer fields. A non-existent
  // id is a 404, never a silent null 200 (FeedService.getPostById /
  // ClubsService.getClubById precedent). Carries the same per-caller
  // `joined` flag the list endpoints do.
  async getRoomById(roomId: string, userId: string): Promise<BanterRoomView> {
    const room = await this.prisma.banterRoom.findUnique({
      where: { id: roomId },
      select: ROOM_SELECT,
    });
    if (!room) {
      throw new NotFoundException('Banter Room not found');
    }
    const membership = await this.prisma.banterRoomMember.findUnique({
      where: { userId_banterRoomId: { userId, banterRoomId: roomId } },
      select: { id: true },
    });
    return { ...room, joined: membership !== null };
  }

  // Shared existence check — mirrors ClubsService.assertClubExists /
  // GrassrootsService.assertTeamExists / FeedService.assertPostExists.
  // Public so the controller can call it before delegating a room feed
  // read to FeedService (exactly as ClubsController does for
  // GET /clubs/:id/feed).
  async assertRoomExists(roomId: string): Promise<void> {
    const room = await this.prisma.banterRoom.findUnique({
      where: { id: roomId },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundException('Banter Room not found');
    }
  }

  // POST /banter-rooms/:id/join. BanterRoomMember.@@unique([userId,
  // banterRoomId]) is the idempotency backstop — exactly like
  // FeedService.likePost (NOT ClubsService.joinClub's raw
  // $executeRaw-against-_ClubMembership, which was only forced by that
  // relation being an *implicit* Prisma m2m). Creating the member row and
  // incrementing memberCount happen in one interactive $transaction; if
  // tx.banterRoomMember.create throws P2002 (already a member), the
  // increment never runs and the whole transaction rolls back — caught
  // below as an idempotent success, never a 500 and never a
  // double-increment of a count that was already correct.
  //
  // Guards on the controller: JwtAuthGuard + GuardianConsentGuard.
  // Section 5.7 and Section 8.3 step 5 BOTH name "joining a Banter Room"
  // literally as restricted for pending-consent minors — this is the one
  // place that phrase applies without interpretation (unlike a ClubPage
  // fan-page join, which clubs/README.md argued is NOT a Banter Room).
  async joinRoom(userId: string, roomId: string): Promise<JoinRoomState> {
    await this.assertRoomExists(roomId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.banterRoomMember.create({ data: { userId, banterRoomId: roomId } });
        await tx.banterRoom.update({
          where: { id: roomId },
          data: { memberCount: { increment: 1 } },
        });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already a member — idempotent success, memberCount untouched.
    }

    return { roomId, joined: true, memberCount: await this.currentMemberCount(roomId) };
  }

  // DELETE /banter-rooms/:id/join. Symmetric to joinRoom, mirroring
  // FeedService.unlikePost exactly: findUnique-then-delete so a
  // never-joined caller is a no-op success (not a 404), and the delete +
  // decrement run in one interactive $transaction. Two layered guards
  // against memberCount ever going negative:
  //   1. Only enter the transaction when a member row actually exists.
  //   2. The decrement is an updateMany scoped to `memberCount: { gt: 0 }`
  //      — the same floor guard ClubsService.leaveClub /
  //      FeedService.unlikePost use.
  // A concurrent-delete race (Prisma P2025) is caught and treated as the
  // same idempotent success.
  //
  // Guards: JwtAuthGuard + GuardianConsentGuard — a short confirmation of
  // joinRoom's own argument (Section 5.7 names "joining a Banter Room";
  // leaving is the reverse of the same named action), not a fresh one.
  async leaveRoom(userId: string, roomId: string): Promise<JoinRoomState> {
    await this.assertRoomExists(roomId);

    const existing = await this.prisma.banterRoomMember.findUnique({
      where: { userId_banterRoomId: { userId, banterRoomId: roomId } },
      select: { id: true },
    });
    if (existing) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.banterRoomMember.delete({
            where: { userId_banterRoomId: { userId, banterRoomId: roomId } },
          });
          await tx.banterRoom.updateMany({
            where: { id: roomId, memberCount: { gt: 0 } },
            data: { memberCount: { decrement: 1 } },
          });
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
          throw err;
        }
        // Lost a race with a concurrent leave — already gone, idempotent.
      }
    }

    return { roomId, joined: false, memberCount: await this.currentMemberCount(roomId) };
  }

  private async currentMemberCount(roomId: string): Promise<number> {
    const room = await this.prisma.banterRoom.findUnique({
      where: { id: roomId },
      select: { memberCount: true },
    });
    return room?.memberCount ?? 0;
  }

  // POST /banter-rooms/:id/posts. Delegates to FeedService.createPost —
  // the single post-creation path (its GuardianConsentGuard is also on
  // this route's controller; its P2003 catch, engagement-points award,
  // "at most one of clubPageId/banterRoomId" check all apply as-is). We
  // never build a second post.create here.
  //
  // Membership is REQUIRED to post (403 otherwise) — judgment call,
  // flagged in banter/README.md: "join a room to participate" matches
  // the Figma flow and Section 8.3 step 5's "read-only" framing for
  // pending-consent minors (which only makes sense if participation
  // means being a member). Existence (404) is settled before membership
  // (403), the FeedService.deleteComment ordering convention.
  async postToRoom(
    userId: string,
    roomId: string,
    dto: CreateBanterPostDto,
  ): Promise<FeedPost> {
    await this.assertRoomExists(roomId);
    await this.assertRoomMembership(userId, roomId);

    return this.feed.createPost(userId, {
      contentText: dto.contentText,
      mediaUrls: dto.mediaUrls,
      banterRoomId: roomId,
    });
  }

  private async assertRoomMembership(userId: string, roomId: string): Promise<void> {
    const membership = await this.prisma.banterRoomMember.findUnique({
      where: { userId_banterRoomId: { userId, banterRoomId: roomId } },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You must join this Banter Room before posting in it');
    }
  }

  // GET /banter-rooms/:id/posts — the room feed. assertRoomExists is
  // called by the controller first (so a non-existent room is a 404,
  // matching GET /clubs/:id/feed's own pattern); this just forwards to
  // FeedService so the response is the exact FeedPage /
  // FeedPostWithViewerState shape GET /posts/feed and GET /clubs/:id/feed
  // return.
  async getRoomFeed(roomId: string, userId: string, query: FeedQueryDto): Promise<FeedPage> {
    return this.feed.getBanterRoomFeed(roomId, userId, query);
  }
}
