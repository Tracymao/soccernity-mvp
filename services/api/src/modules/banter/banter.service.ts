import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import { FeedPage, FeedPost, FeedService } from '../feed/feed.service';
import {
  BANTER_ROOMS_DEFAULT_PAGE_SIZE,
  BANTER_ROOMS_MAX_PAGE_SIZE,
  BANTER_TOPICS_DEFAULT_PAGE_SIZE,
  BANTER_TOPICS_MAX_PAGE_SIZE,
  BanterRoomScopeType,
  BanterRoomStatus,
} from './banter.constants';
import {
  decodeBanterRoomCursor,
  decodeMyBantsCursor,
  encodeBanterRoomCursor,
  encodeMyBantsCursor,
} from './cursor.util';
import { AttachBanterRoomTopicsDto } from './dto/attach-banter-room-topics.dto';
import { CreateBanterPostDto } from './dto/create-banter-post.dto';
import { CreateBanterRoomDto } from './dto/create-banter-room.dto';
import { ListBanterRoomsQueryDto } from './dto/list-banter-rooms-query.dto';
import { ListBanterTopicsQueryDto } from './dto/list-banter-topics-query.dto';
import { MyBantsQueryDto } from './dto/my-bants-query.dto';
import { UpdateBanterRoomStatusDto } from './dto/update-banter-room-status.dto';

// sprint-3/banter-room-topics (Decision Log #276) — the lean shape every
// Topic reference returns, whether from GET /banter-rooms/topics or
// embedded on a room. Just {id, name}: no nameNormalized (internal
// dedup detail, never a client concern) and no createdAt (nothing reads
// it yet).
const TOPIC_SELECT = { id: true, name: true } as const;

export type TopicSummary = Prisma.TopicGetPayload<{ select: typeof TOPIC_SELECT }>;

export interface BanterTopicPage {
  items: TopicSummary[];
  nextCursor: string | null;
}

export interface AttachTopicsResult {
  roomId: string;
  topics: TopicSummary[];
}

// Response shape for every GET /banter-rooms, GET /banter-rooms/search,
// GET /banter-rooms/mine and GET /banter-rooms/:id entry (Build Plan
// Section 4.4). Deliberately does NOT select `members` — same
// low-bandwidth discipline (Section 5.5) as ClubsService.CLUB_SELECT: a
// room with thousands of members returned inline on every page is
// exactly the unbounded payload that discipline exists to prevent.
// `createdBy` IS exposed (an opaque id, like GrassrootsTeam.createdById)
// so a client can tell whether the current user created the room without
// any organiser PII leaking.
//
// `topics` IS selected inline (unlike `members`) — sprint-3/banter-room-topics.
// A room's topic tags are a handful at most (AttachBanterRoomTopicsDto
// caps a single attach call at 5, and nothing removes that ceiling over
// time), nowhere near the unbounded-membership-list problem `members`
// exists to avoid, so surfacing them on every room read costs nothing the
// Section 5.5 discipline is meant to prevent.
const ROOM_SELECT = {
  id: true,
  name: true,
  scopeType: true,
  // sprint-3/banter-room-scope-ref (Decision Log #276 item b). Exposed on
  // every room read — public and the only room serialization in this
  // codebase that carries scopeType (no admin surface selects BanterRoom).
  scopeRef: true,
  scopeName: true,
  createdBy: true,
  // Decision Log #357 — the room's active/inactive status dot.
  status: true,
  memberCount: true,
  topics: { select: { topic: { select: TOPIC_SELECT } } },
} as const;

// The RAW Prisma shape ROOM_SELECT produces — `topics` is still the
// junction array ({ topic: {id, name} }[]), not yet flattened. Never
// returned to a caller directly; always passed through toRoomSummary()
// first.
type RawBanterRoomRow = Prisma.BanterRoomGetPayload<{ select: typeof ROOM_SELECT }>;

export type BanterRoomSummary = Omit<RawBanterRoomRow, 'topics'> & { topics: TopicSummary[] };

// Flattens ROOM_SELECT's raw junction-row shape ({ topic: {...} }[]) down
// to a plain TopicSummary[] — the shape every endpoint in this module
// actually returns. Every read path (createRoom / listRooms / getMyRooms /
// getRoomById) funnels its ROOM_SELECT result through this before
// attaching `joined`.
function toRoomSummary(row: RawBanterRoomRow): BanterRoomSummary {
  return { ...row, topics: row.topics.map((t) => t.topic) };
}

// Decision Log #358 — dateFrom/dateTo as an inclusive createdAt range. A
// date-only bound covers its whole UTC day; a full timestamp is taken as
// given. Returns undefined when neither bound is supplied.
function resolveCreatedAtBounds(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const gte = dateFrom ? new Date(DATE_ONLY.test(dateFrom) ? `${dateFrom}T00:00:00.000Z` : dateFrom) : undefined;
  const lte = dateTo ? new Date(DATE_ONLY.test(dateTo) ? `${dateTo}T23:59:59.999Z` : dateTo) : undefined;
  if (gte && lte && gte.getTime() > lte.getTime()) {
    throw new BadRequestException('dateFrom must not be after dateTo.');
  }
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

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
    // Validated BEFORE the transaction: a bad scope target must never
    // leave a half-made room behind, and the affiliation lookups are
    // plain reads that don't belong inside the write transaction.
    const scope = await this.resolveScopeTarget(userId, dto.scopeType, dto.scopeRef);
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.banterRoom.create({
        data: {
          name: dto.name,
          scopeType: dto.scopeType,
          scopeRef: scope.scopeRef,
          scopeName: scope.scopeName,
          createdBy: userId,
          memberCount: 1,
        },
        select: ROOM_SELECT,
      });
      await tx.banterRoomMember.create({ data: { userId, banterRoomId: room.id } });
      // A freshly created room has no topics attached (topics: []) —
      // POST /banter-rooms/:id/topics is a separate, later call.
      return { ...toRoomSummary(room), joined: true };
    });
  }

  // Decision Log #276 item (b) — validates a room's scope target on
  // creation and returns the (scopeRef, scopeName) pair to store. The
  // scopeType/scopeRef pairing and the caller's affiliation are both
  // decided HERE, never trusted from the client.
  //
  //   club     -> scopeRef REQUIRED. Must be a real ClubPage (404 if not),
  //               and the caller must be a member of it (403 if not).
  //               Affiliation is ClubPage.members — the only populated
  //               club-membership mechanism (see clubs/README.md).
  //               User.clubAffiliationId is deliberately NOT consulted:
  //               nothing ever writes it.
  //   league   -> scopeRef rejected. There is no League table; a
  //   country     league/country room is free-text, same as before.
  //   topic    -> scopeRef rejected. Never entity-scoped.
  //
  // Rejecting (rather than silently ignoring) a scopeRef that doesn't fit
  // the scopeType is deliberate: a client that sends one has a wrong
  // mental model of the room, and a 400 says so.
  private async resolveScopeTarget(
    userId: string,
    scopeType: BanterRoomScopeType,
    scopeRef: string | undefined,
  ): Promise<{ scopeRef: string | null; scopeName: string | null }> {
    if (scopeType === 'club') {
      if (!scopeRef) {
        throw new BadRequestException('A club-scoped Banter Room must name its club (scopeRef).');
      }
      const club = await this.prisma.clubPage.findUnique({
        where: { id: scopeRef },
        select: { id: true, name: true },
      });
      if (!club) {
        throw new NotFoundException('Club not found');
      }
      const affiliated = await this.prisma.clubPage.findFirst({
        where: { id: club.id, members: { some: { id: userId } } },
        select: { id: true },
      });
      if (!affiliated) {
        throw new ForbiddenException(
          'You can only create a club-scoped Banter Room for a club you are a member of',
        );
      }
      return { scopeRef: club.id, scopeName: club.name };
    }

    if (scopeRef) {
      const reason =
        scopeType === 'topic'
          ? 'topic-scoped rooms are never tied to a specific entity'
          : `${scopeType}-scoped rooms cannot reference a specific entity yet (there is no ${scopeType} table)`;
      throw new BadRequestException(`scopeRef is not allowed here: ${reason}.`);
    }
    return { scopeRef: null, scopeName: null };
  }

  // Keeps the denormalized BanterRoom.scopeName honest on every read.
  // Re-resolves each club-scoped room's live ClubPage.name in ONE batched
  // read, and for any room whose stored snapshot is stale, writes the
  // fresh name back (one updateMany per renamed club, not per room) and
  // returns the fresh value. Chosen over a periodic job because reads are
  // the only place a stale label is ever seen, and the write is idempotent
  // and touches only rows that actually drifted. A ClubPage with no
  // matching row keeps its stored snapshot (no ClubPage deletion path
  // exists today; see the schema comment on BanterRoom.scopeRef).
  private async syncScopeNames<
    T extends { scopeType: string; scopeRef: string | null; scopeName: string | null },
  >(rows: T[]): Promise<T[]> {
    const clubIds = [
      ...new Set(
        rows.filter((r) => r.scopeType === 'club' && r.scopeRef).map((r) => r.scopeRef as string),
      ),
    ];
    if (clubIds.length === 0) {
      return rows;
    }
    const clubs = await this.prisma.clubPage.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, name: true },
    });
    const liveName = new Map(clubs.map((c) => [c.id, c.name]));

    // Only the clubs whose stored snapshot actually disagrees with the
    // live name are written back.
    const staleClubIds = new Set(
      rows
        .filter(
          (r) =>
            r.scopeType === 'club' &&
            r.scopeRef !== null &&
            liveName.has(r.scopeRef) &&
            r.scopeName !== liveName.get(r.scopeRef),
        )
        .map((r) => r.scopeRef as string),
    );
    for (const clubId of staleClubIds) {
      const name = liveName.get(clubId) as string;
      await this.prisma.banterRoom.updateMany({
        where: {
          scopeType: 'club',
          scopeRef: clubId,
          // `scopeName: { not: name }` alone would skip NULL snapshots
          // (SQL NULL <> x is NULL), so the null case is spelled out.
          OR: [{ scopeName: null }, { scopeName: { not: name } }],
        },
        data: { scopeName: name },
      });
    }

    return rows.map((r) =>
      r.scopeType === 'club' && r.scopeRef && liveName.has(r.scopeRef)
        ? { ...r, scopeName: liveName.get(r.scopeRef) as string }
        : r,
    );
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
    // sprint-3/banter-room-topics (Decision Log #276) — filter rooms by an
    // attached Topic's id. A plain equality condition against the join
    // table, same treatment as scopeType above; an unknown topicId simply
    // matches zero rooms rather than 400ing.
    if (query.topicId) filters.push({ topics: { some: { topicId: query.topicId } } });
    const tagTerm = query.tagQuery?.trim();
    if (tagTerm) filters.push({ id: { in: await this.matchRoomIdsByTag(tagTerm) } });
    const createdAt = resolveCreatedAtBounds(query.dateFrom, query.dateTo);
    if (createdAt) filters.push({ createdAt });
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

    const synced = await this.syncScopeNames(trimmed);
    const joinedIds = await this.membershipSubset(
      userId,
      synced.map((r) => r.id),
    );
    const items = synced.map((room) => ({ ...toRoomSummary(room), joined: joinedIds.has(room.id) }));

    return { items, nextCursor };
  }

  // BanterRoom.createdBy is a bare String (no relation to User) and
  // BanterRoom.scopeRef is a polymorphic id with no FK, so Prisma cannot
  // express "creator's name / scoped club's name" as a relational filter.
  // This resolves the match in one parameterized query over the real join
  // paths instead. Live ClubPage.name is used rather than the denormalized
  // BanterRoom.scopeName snapshot, so a renamed club is findable at once.
  // League/country scopes have no backing table and can't be matched.
  private async matchRoomIdsByTag(term: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT r."id"
      FROM "BanterRoom" r
      LEFT JOIN "User" u ON u."id" = r."createdBy"
      LEFT JOIN "ClubPage" c ON r."scopeType" = 'club' AND c."id" = r."scopeRef"
      WHERE position(lower(${term}) in lower(u."displayName")) > 0
         OR position(lower(${term}) in lower(c."name")) > 0
         OR EXISTS (
           SELECT 1 FROM "BanterRoomTopic" bt
           JOIN "Topic" t ON t."id" = bt."topicId"
           WHERE bt."banterRoomId" = r."id"
             AND position(lower(${term}) in lower(t."name")) > 0
         )
    `);
    return rows.map((row) => row.id);
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
    const synced = await this.syncScopeNames(trimmed.map((m) => m.banterRoom));
    const items = synced.map((room) => ({ ...toRoomSummary(room), joined: true }));

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
    const [synced] = await this.syncScopeNames([room]);
    const membership = await this.prisma.banterRoomMember.findUnique({
      where: { userId_banterRoomId: { userId, banterRoomId: roomId } },
      select: { id: true },
    });
    return { ...toRoomSummary(synced), joined: membership !== null };
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

  // ---------- Topics (sprint-3/banter-room-topics, Decision Log #276) ----------

  // POST /banter-rooms/:id/topics — Section 4.4's literal, previously
  // unbuilt route. Guards on the controller: JwtAuthGuard +
  // GuardianConsentGuard. Attaching a topic tag changes a public-facing,
  // persistent room's own discoverability metadata (it's what
  // ?topicId= filters against, on GET /banter-rooms/search) — the same
  // "posting"-class reasoning Section 5.7 / Decision Log #21 already
  // applies to POST /banter-rooms itself. A short confirmation of that
  // existing argument, not a fresh one (the same "leaving is the reverse
  // of a named action" style short-confirmation joinRoom/leaveRoom's own
  // comments already use).
  //
  // PERMISSION MODEL — a real judgment call, argued in full in
  // banter/README.md's Permission model section, not silently picked:
  // ONLY the room's creator (`createdBy`) may attach topics — not any
  // member, and not any consent-confirmed authenticated user. Mirrors
  // GrassrootsService.createFixture's own "you manage what you created"
  // ownership model (the closest analogous precedent this codebase has
  // for who may mutate a record's own metadata), and avoids compounding
  // the spam/safeguarding concern this module's own README already
  // flags about unbounded room-metadata mutation on a minors' platform.
  // "Any member may tag" was considered and rejected — no analogous
  // "shared metadata, editable by any member" precedent exists anywhere
  // in this codebase (CommunityGroup/ClubPage don't have one either).
  //
  // 404 (room existence) settled before 403 (ownership) — the
  // FeedService.deleteComment / GrassrootsService convention.
  //
  // Each name is find-or-created against Topic by its normalized form,
  // then attached — via attachOneTopic, below, one name at a time, each
  // in its OWN transaction with its OWN bounded retry (see that method's
  // own comment for why a single shared transaction across the whole
  // batch — this method's own first, incorrect implementation — is
  // unsafe under a real concurrent race, confirmed by reproducing it
  // directly against Postgres before settling on this design). Attaching
  // a name that resolves to an already-attached Topic is a genuine no-op,
  // not an error — `upsert`'s own `update: {}` no-op branch, not a
  // create-then-catch. Response returns the room's FULL current topic
  // list (not just the newly-attached ones) so a client can simply
  // replace its local state.
  async attachTopics(
    userId: string,
    roomId: string,
    dto: AttachBanterRoomTopicsDto,
  ): Promise<AttachTopicsResult> {
    await this.assertRoomExists(roomId);
    await this.assertRoomCreator(userId, roomId, 'Only the room creator may attach topics to this Banter Room');

    // Sequential, not Promise.all — each name is its own independent
    // transaction (see attachOneTopic), and running them concurrently
    // from within one request has no benefit here (the batch is capped
    // at 5 by AttachBanterRoomTopicsDto) while adding needless internal
    // contention against itself.
    for (const rawName of dto.names) {
      await this.attachOneTopic(roomId, rawName);
    }

    return { roomId, topics: await this.currentTopics(roomId) };
  }

  private async assertRoomCreator(userId: string, roomId: string, message: string): Promise<void> {
    const room = await this.prisma.banterRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { createdBy: true },
    });
    if (room.createdBy !== userId) {
      throw new ForbiddenException(message);
    }
  }

  // ---------- Status (Decision Log #357) ----------

  // PATCH /banter-rooms/:id/status — the room creator's manual active /
  // inactive toggle. Creator-only, the same check attachTopics uses (404
  // before 403). JwtAuthGuard only: a room-settings write, not a Section
  // 5.7 safety-sensitive action.
  async updateRoomStatus(
    userId: string,
    roomId: string,
    dto: UpdateBanterRoomStatusDto,
  ): Promise<BanterRoomView> {
    await this.assertRoomExists(roomId);
    await this.assertRoomCreator(userId, roomId, "Only the room creator may change this Banter Room's status");
    await this.setRoomStatus(this.prisma, roomId, dto.status);
    return this.getRoomById(roomId, userId);
  }

  // The single write path for BanterRoom.status. Takes a Prisma client so
  // ModerationService.actionReport can run it inside the same transaction
  // that records a report's room_deactivated outcome — one status-write
  // implementation, two callers. A missing room throws 404, which also
  // rolls back any enclosing transaction.
  async setRoomStatus(db: Prisma.TransactionClient, roomId: string, status: BanterRoomStatus): Promise<void> {
    const result = await db.banterRoom.updateMany({ where: { id: roomId }, data: { status } });
    if (result.count === 0) {
      throw new NotFoundException('Banter Room not found');
    }
  }

  // Find-or-create a Topic by its normalized (trim + lowercase) name and
  // attach it to `roomId`, both in ONE transaction, with a bounded retry
  // on a genuine concurrent-write race.
  //
  // WHY NOT one shared transaction across find-or-create + attach for the
  // WHOLE batch (this method's own first, incorrect implementation):
  // Postgres aborts an ENTIRE transaction the instant ANY query inside it
  // fails (a real unique-constraint violation from a concurrent writer,
  // here) — every further command on that same transaction is then
  // rejected until it ends, so a "catch the error and issue a recovery
  // query on the SAME tx" pattern throws a SECOND, unrelated error on
  // that very next query. This was a real, reproduced bug, not a
  // hypothetical one: the original implementation's own concurrent-create
  // e2e test failed with a genuine 500 under real Postgres.
  //
  // WHY `upsert` (an atomic `INSERT ... ON CONFLICT DO UPDATE` at the SQL
  // level) is NOT by itself sufficient either, and a retry is still
  // needed: Postgres's own documented `ON CONFLICT` behavior can still
  // raise a real unique-violation error under concurrent load if the
  // conflicting row was inserted by a not-yet-committed concurrent
  // transaction at the moment of the conflict check — reproduced directly
  // (a standalone script hit this on 1 of 5 runs against real Postgres,
  // not merely read about) before choosing to add the retry rather than
  // trusting `upsert` alone.
  //
  // The fix: EACH name gets its own transaction, and a P2002 escaping
  // that transaction (the transaction as a whole failed, so nothing is
  // poisoned — a brand-new transaction on retry starts clean) triggers a
  // bounded retry (max 3 attempts) of the whole find-or-create-and-attach
  // for that one name. A retry's `upsert` sees the now-committed row from
  // the transaction that won the race and completes normally.
  private async attachOneTopic(roomId: string, rawName: string, attempt = 0): Promise<void> {
    const name = rawName.trim();
    const nameNormalized = name.toLowerCase();

    try {
      await this.prisma.$transaction(async (tx) => {
        const topic = await tx.topic.upsert({
          where: { nameNormalized },
          // A harmless no-op re-set of `name` on the update branch (never
          // an empty `update: {}`), so this always has a concrete SET
          // clause regardless of which Prisma/Postgres version runs this —
          // confirmed empirically that an empty update object also works
          // today, but this is the more conservative, self-documenting
          // choice.
          create: { name, nameNormalized },
          update: { name },
          select: TOPIC_SELECT,
        });
        await tx.banterRoomTopic.upsert({
          where: { banterRoomId_topicId: { banterRoomId: roomId, topicId: topic.id } },
          create: { banterRoomId: roomId, topicId: topic.id },
          update: {},
        });
      });
    } catch (err) {
      const isUniqueConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isUniqueConflict && attempt < 3) {
        await this.attachOneTopic(roomId, rawName, attempt + 1);
        return;
      }
      throw err;
    }
  }

  // The room's current topics, alphabetical by name — read fresh after
  // attachTopics's own transaction commits (outside it), the same
  // "compute the denormalized/derived response value in a separate
  // post-transaction read" shape currentMemberCount() already uses for
  // joinRoom/leaveRoom.
  private async currentTopics(roomId: string): Promise<TopicSummary[]> {
    const rows = await this.prisma.banterRoomTopic.findMany({
      where: { banterRoomId: roomId },
      orderBy: { topic: { name: 'asc' } },
      select: { topic: { select: TOPIC_SELECT } },
    });
    return rows.map((r) => r.topic);
  }

  // GET /banter-rooms/topics — the topics catalog. Beyond Section 4.4's
  // literal list (which names only POST /banter-rooms/:id/topics), built
  // anyway and flagged (see list-banter-topics-query.dto.ts's own header
  // comment): without this, GET /banter-rooms's new ?topicId= filter has
  // no way for a client to discover which Topic ids exist at all.
  // JwtAuthGuard only — browsing a small tag catalog is no more
  // safety-sensitive than GET /banter-rooms itself.
  //
  // Alphabetical by name, `id` tiebreak — reuses the room catalog's own
  // { name, id } cursor shape/functions directly (cursor.util.ts), since
  // Topic orders the same way for the same reason (no compelling
  // newest-first case for a small, stable tag catalog).
  async listTopics(query: ListBanterTopicsQueryDto): Promise<BanterTopicPage> {
    const limit = Math.min(query.limit ?? BANTER_TOPICS_DEFAULT_PAGE_SIZE, BANTER_TOPICS_MAX_PAGE_SIZE);

    const filters: Prisma.TopicWhereInput[] = [];
    if (query.cursor) {
      const cursor = decodeBanterRoomCursor(query.cursor);
      filters.push({
        OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
      });
    }
    const where: Prisma.TopicWhereInput = filters.length > 0 ? { AND: filters } : {};

    const rows = await this.prisma.topic.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: TOPIC_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeBanterRoomCursor({ name: last.name, id: last.id }) : null;

    return { items: trimmed, nextCursor };
  }
}
