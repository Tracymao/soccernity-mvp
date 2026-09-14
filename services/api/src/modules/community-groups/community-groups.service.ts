import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COMMUNITY_GROUPS_DEFAULT_PAGE_SIZE,
  COMMUNITY_GROUPS_MAX_PAGE_SIZE,
  COMMUNITY_GROUP_MEMBERS_DEFAULT_PAGE_SIZE,
  COMMUNITY_GROUP_MEMBERS_MAX_PAGE_SIZE,
} from './community-groups.constants';
import {
  decodeCommunityGroupCursor,
  decodeCommunityGroupMemberCursor,
  encodeCommunityGroupCursor,
  encodeCommunityGroupMemberCursor,
} from './cursor.util';
import { CreateCommunityGroupDto } from './dto/create-community-group.dto';
import { ListCommunityGroupMembersQueryDto } from './dto/list-community-group-members-query.dto';
import { ListCommunityGroupsQueryDto } from './dto/list-community-groups-query.dto';

// Response shape for every GET /community-groups and GET
// /community-groups/:id entry (Build Plan Sprint 3, Decision Log #281).
// Deliberately does NOT select `members` — same low-bandwidth discipline
// (Section 5.5) as ClubsService.CLUB_SELECT / BanterService.ROOM_SELECT:
// a group with thousands of members returned inline on every page would
// be exactly the unbounded payload that discipline exists to prevent.
// `createdById` IS exposed (an opaque id, like GrassrootsTeam.createdById
// / BanterRoom.createdBy) so a client can tell whether the current user
// created the group without any organiser PII leaking.
const GROUP_SELECT = {
  id: true,
  name: true,
  city: true,
  positionPlayed: true,
  careerTrack: true,
  createdById: true,
  memberCount: true,
  createdAt: true,
} as const;

export type CommunityGroupSummary = Prisma.CommunityGroupGetPayload<{ select: typeof GROUP_SELECT }>;

// What the group endpoints actually return: the lean group row plus ONE
// per-request-user-computed boolean. `joined` is `true` iff a
// CommunityGroupMember row exists for (this group, the CALLING user) —
// same discipline as ClubsService.ClubSummaryWithViewerState /
// BanterService.BanterRoomView (Decision Log #154/#275): an intersection
// on top, never added to GROUP_SELECT itself. Resolved WITHOUT an N+1 —
// see membershipSubset() below.
//
// The Figma browse/directory cards render no Join button at all (join
// lives only on the individual group page) — that is a FRONTEND layout
// choice, not a reason to omit `joined` from this API: the data still
// needs to come from somewhere for the individual group page's own Join/
// Leave button, and returning it uniformly on both list and single-item
// responses (matching every other viewer-state precedent in this
// codebase) costs nothing extra given membershipSubset's batching.
export type CommunityGroupView = CommunityGroupSummary & { joined: boolean };

export interface CommunityGroupPage {
  items: CommunityGroupView[];
  nextCursor: string | null;
}

// `joined` is a plain boolean (not a true/false literal split), mirroring
// ClubsService.JoinState / BanterService.JoinRoomState — one interface for
// both joinGroup and leaveGroup rather than a parallel Join/Leave pair.
export interface JoinGroupState {
  groupId: string;
  joined: boolean;
  memberCount: number;
}

// GET /community-groups/:id/members roster entry. Deliberately the same
// { id, displayName }-only shape ClubsService.CLUB_MEMBER_SELECT /
// UsersService.FOLLOW_USER_SELECT already established for "what any other
// user sees about someone else" — re-declared here rather than imported
// (both of those are private, unexported consts in other modules). No
// email, phone, dateOfBirth, isMinor, verificationStatus, or
// passwordHash ever leaves Postgres via this select.
const GROUP_MEMBER_SELECT = {
  id: true,
  displayName: true,
} as const;

export type CommunityGroupMemberView = Prisma.UserGetPayload<{ select: typeof GROUP_MEMBER_SELECT }>;

export interface CommunityGroupMemberPage {
  items: CommunityGroupMemberView[];
  nextCursor: string | null;
}

// Roster visibility filter — mirrors ClubsService.VISIBLE_CLUB_MEMBER_FILTER
// exactly (same reasoning, re-declared rather than imported across the
// module boundary): exclude restricted-pending minors (CLAUDE.md
// non-negotiable #1; Build Plan Section 8.3) AND non-"active" accounts
// (Decision Log #221 — a deactivated/pending_deletion account should not
// surface in a roster readable by any authenticated caller) from the
// member list. A restricted-pending minor CAN join a Community Group
// (POST /community-groups/:id/join is GuardianConsentGuard-gated, so in
// practice a restricted-pending minor can never actually reach this state
// — see this file's join/leave guard reasoning below — but the filter is
// kept anyway as defence-in-depth, matching how ClubsService keeps its
// own filter even though ClubPage join has a different guard history).
//
// "Not restricted-pending" = a non-minor, OR a minor whose Guardian row
// exists AND has consentStatus 'confirmed'. Consequence, flagged here and
// in community-groups/README.md: the visible roster length can be
// smaller than CommunityGroup.memberCount (which counts raw
// CommunityGroupMember rows) — acceptable, memberCount is explicitly "not
// authoritative in isolation" per its own schema comment.
const VISIBLE_GROUP_MEMBER_FILTER: Prisma.UserWhereInput = {
  accountStatus: 'active',
  OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
};

@Injectable()
export class CommunityGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  // POST /community-groups. createdById is the caller, taken from the
  // access token — never the body. Guards (JwtAuthGuard +
  // GuardianConsentGuard) are on the controller: Section 5.7's
  // safety-sensitive-action list names "joining a Banter Room **or
  // Community Group**" literally (see clubs.controller.ts's own guard
  // comment quoting this) — this model IS that literal referent, so
  // creating one is consent-gated without needing the interpretive
  // "posting"-class reading Decision Log #21/#275 needed for Banter Room
  // creation.
  //
  // Permission model (Decision Log #281 item 1, resolved here): ANY
  // authenticated, consent-confirmed user may create a group — the same
  // default POST /teams (Decision Log #255) and POST /banter-rooms
  // (Decision Log #275) already use. The ONE deliberate anti-spam
  // safeguard is name-uniqueness (below); everything else — moderation,
  // group-size limits, a creation rate-limit beyond whatever
  // platform-wide throttling already exists, or role-gating creation to
  // a moderator — is left OPEN, the same "flagged, not built" precedent
  // #255/#275 already set for their own analogous questions. See
  // community-groups/README.md's Permission model section.
  //
  // The creator is auto-joined (memberCount starts at its schema
  // @default(1), a CommunityGroupMember row is written in the same
  // transaction) — "create a group -> you're in it", the same precedent
  // BanterService.createRoom already set.
  //
  // Duplicate normalized name -> 409, not a raw P2002 surfaced to the
  // client (nameNormalized's own @@unique constraint is the enforcement
  // mechanism; this is a pre-check for a clear error message, with the
  // constraint itself as the race-safe backstop — see the try/catch
  // below).
  async createGroup(userId: string, dto: CreateCommunityGroupDto): Promise<CommunityGroupView> {
    const nameNormalized = dto.name.trim().toLowerCase();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const group = await tx.communityGroup.create({
          data: {
            name: dto.name,
            nameNormalized,
            city: dto.city ?? null,
            positionPlayed: dto.positionPlayed ?? null,
            careerTrack: dto.careerTrack ?? null,
            createdById: userId,
            memberCount: 1,
          },
          select: GROUP_SELECT,
        });
        await tx.communityGroupMember.create({
          data: { userId, communityGroupId: group.id },
        });
        return { ...group, joined: true };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A Community Group with this name already exists');
      }
      throw err;
    }
  }

  // GET /community-groups. Ordered newest-first (createdAt desc, id
  // tiebreak — see cursor.util.ts for why this diverges from
  // ClubPage/BanterRoom's own alphabetical ordering). Three optional,
  // combinable, exact-match equality filters ANDed alongside the cursor
  // filter. Per-caller `joined` boolean (batched — no N+1).
  async listGroups(query: ListCommunityGroupsQueryDto, userId: string): Promise<CommunityGroupPage> {
    const limit = Math.min(query.limit ?? COMMUNITY_GROUPS_DEFAULT_PAGE_SIZE, COMMUNITY_GROUPS_MAX_PAGE_SIZE);

    const filters: Prisma.CommunityGroupWhereInput[] = [];
    if (query.city) filters.push({ city: query.city });
    if (query.positionPlayed) filters.push({ positionPlayed: query.positionPlayed });
    if (query.careerTrack) filters.push({ careerTrack: query.careerTrack });
    if (query.cursor) {
      const cursor = decodeCommunityGroupCursor(query.cursor);
      // Descending (newest-first) keyset: "before this (createdAt, id)".
      filters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const where: Prisma.CommunityGroupWhereInput = filters.length > 0 ? { AND: filters } : {};

    const rows = await this.prisma.communityGroup.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: GROUP_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeCommunityGroupCursor({ createdAt: last.createdAt, id: last.id }) : null;

    const joinedIds = await this.membershipSubset(
      userId,
      trimmed.map((g) => g.id),
    );
    const items = trimmed.map((group) => ({ ...group, joined: joinedIds.has(group.id) }));

    return { items, nextCursor };
  }

  // Decision Log #154/#275's exact pattern — the subset of `groupIds` the
  // caller is a member of, resolved in ONE batched query, never one
  // lookup per group (no N+1). Empty input -> empty Set with no query
  // issued.
  private async membershipSubset(userId: string, groupIds: string[]): Promise<Set<string>> {
    if (groupIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.communityGroupMember.findMany({
      where: { userId, communityGroupId: { in: groupIds } },
      select: { communityGroupId: true },
    });
    return new Set(rows.map((r) => r.communityGroupId));
  }

  // GET /community-groups/:id. Same GROUP_SELECT as the list entries — a
  // non-existent id is a 404, never a silent null 200, matching
  // ClubsService.getClubById / BanterService.getRoomById. Carries the
  // same per-caller `joined` flag the list endpoint does.
  async getGroupById(groupId: string, userId: string): Promise<CommunityGroupView> {
    const group = await this.prisma.communityGroup.findUnique({
      where: { id: groupId },
      select: GROUP_SELECT,
    });
    if (!group) {
      throw new NotFoundException('Community Group not found');
    }
    const membership = await this.prisma.communityGroupMember.findUnique({
      where: { userId_communityGroupId: { userId, communityGroupId: groupId } },
      select: { id: true },
    });
    return { ...group, joined: membership !== null };
  }

  // Shared existence check — mirrors ClubsService.assertClubExists /
  // BanterService.assertRoomExists / GrassrootsService.assertTeamExists.
  async assertGroupExists(groupId: string): Promise<void> {
    const group = await this.prisma.communityGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Community Group not found');
    }
  }

  // POST /community-groups/:id/join. CommunityGroupMember's
  // @@unique([userId, communityGroupId]) is the idempotency backstop —
  // exactly like BanterService.joinRoom / FeedService.likePost (NOT
  // ClubsService.joinClub's raw $executeRaw-against-_ClubMembership,
  // which was only forced by that relation being an *implicit* Prisma
  // m2m — CommunityGroupMember is an explicit model, same as
  // BanterRoomMember). Creating the member row and incrementing
  // memberCount happen in one interactive $transaction; a P2002 on the
  // create is caught below as an idempotent success, never a 500 and
  // never a double-increment of a count that was already correct.
  //
  // Guards on the controller: JwtAuthGuard + GuardianConsentGuard.
  // Section 5.7 names "joining a Banter Room or Community Group"
  // literally — this is the direct textual referent, so no interpretive
  // leap is needed the way Decision Log #275 needed one for Banter Rooms.
  async joinGroup(userId: string, groupId: string): Promise<JoinGroupState> {
    await this.assertGroupExists(groupId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.communityGroupMember.create({ data: { userId, communityGroupId: groupId } });
        await tx.communityGroup.update({
          where: { id: groupId },
          data: { memberCount: { increment: 1 } },
        });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already a member — idempotent success, memberCount untouched.
    }

    return { groupId, joined: true, memberCount: await this.currentMemberCount(groupId) };
  }

  // DELETE /community-groups/:id/join. Symmetric to joinGroup, mirroring
  // BanterService.leaveRoom / FeedService.unlikePost exactly:
  // findUnique-then-delete so a never-joined caller is a no-op success
  // (not a 404), and the delete + decrement run in one interactive
  // $transaction. Two layered guards against memberCount ever going
  // negative:
  //   1. Only enter the transaction when a member row actually exists.
  //   2. The decrement is an updateMany scoped to `memberCount: { gt: 0 }`
  //      — the same floor guard ClubsService.leaveClub /
  //      BanterService.leaveRoom / FeedService.unlikePost use.
  // A concurrent-delete race (Prisma P2025) is caught and treated as the
  // same idempotent success.
  //
  // GUARD JUDGMENT CALL, argued explicitly (flagged in
  // community-groups/README.md, not silently picked): JwtAuthGuard +
  // GuardianConsentGuard, the SAME guard pair as joinGroup — a short
  // confirmation of joinGroup's own argument (Section 5.7 names "joining
  // a ... Community Group"; leaving is the reverse of the same named
  // action), following BanterService.leaveRoom's own reasoning rather
  // than ClubsService.leaveClub's JwtAuthGuard-only precedent. The
  // ClubsService precedent does NOT apply here the way it might first
  // appear to: clubs.controller.ts's own comment is explicit that a
  // ClubPage join is "neither a Banter Room nor a Community Group" under
  // Section 5.7's literal list — which is exactly why THIS model (unlike
  // ClubPage) IS covered by that clause and stays consent-gated on both
  // join and leave.
  async leaveGroup(userId: string, groupId: string): Promise<JoinGroupState> {
    await this.assertGroupExists(groupId);

    const existing = await this.prisma.communityGroupMember.findUnique({
      where: { userId_communityGroupId: { userId, communityGroupId: groupId } },
      select: { id: true },
    });
    if (existing) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.communityGroupMember.delete({
            where: { userId_communityGroupId: { userId, communityGroupId: groupId } },
          });
          await tx.communityGroup.updateMany({
            where: { id: groupId, memberCount: { gt: 0 } },
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

    return { groupId, joined: false, memberCount: await this.currentMemberCount(groupId) };
  }

  private async currentMemberCount(groupId: string): Promise<number> {
    const group = await this.prisma.communityGroup.findUnique({
      where: { id: groupId },
      select: { memberCount: true },
    });
    return group?.memberCount ?? 0;
  }

  // GET /community-groups/:id/members — the roster. Mirrors
  // ClubsService.getClubMembers exactly (per this task's own
  // instruction): keyset pagination alphabetically by displayName, `id`
  // as the tiebreaker (CommunityGroupMember DOES have a joinedAt column,
  // but the roster follows the SAME ordering ClubsService.getClubMembers
  // uses rather than inventing a different one for this endpoint alone —
  // consistency across roster-style endpoints), restricted-pending
  // minors AND non-"active" accounts excluded (VISIBLE_GROUP_MEMBER_FILTER
  // above). JwtAuthGuard only — reading a roster is no more
  // safety-sensitive than GET /community-groups or GET
  // /community-groups/:id.
  async getGroupMembers(
    groupId: string,
    query: ListCommunityGroupMembersQueryDto,
  ): Promise<CommunityGroupMemberPage> {
    await this.assertGroupExists(groupId);

    const limit = Math.min(
      query.limit ?? COMMUNITY_GROUP_MEMBERS_DEFAULT_PAGE_SIZE,
      COMMUNITY_GROUP_MEMBERS_MAX_PAGE_SIZE,
    );

    // Unlike ClubPage.members (an implicit m2m, so ClubsService.getClubMembers
    // filters `{ clubMemberships: { some: { id: clubId } } }` directly
    // against ClubPage's own id), CommunityGroupMember is an EXPLICIT join
    // model — User.communityGroupMemberships is CommunityGroupMember[],
    // not CommunityGroup[] — so the filter targets the join row's own
    // communityGroupId column, not an `id`.
    const filters: Prisma.UserWhereInput[] = [
      { communityGroupMemberships: { some: { communityGroupId: groupId } } },
      VISIBLE_GROUP_MEMBER_FILTER,
    ];
    if (query.cursor) filters.push(this.buildMemberCursorFilter(query.cursor));

    const rows = await this.prisma.user.findMany({
      where: { AND: filters },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: GROUP_MEMBER_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCommunityGroupMemberCursor({ name: last.displayName, id: last.id })
        : null;

    return { items: trimmed, nextCursor };
  }

  private buildMemberCursorFilter(rawCursor: string): Prisma.UserWhereInput {
    const cursor = decodeCommunityGroupMemberCursor(rawCursor);
    return {
      OR: [
        { displayName: { gt: cursor.name } },
        { displayName: cursor.name, id: { gt: cursor.id } },
      ],
    };
  }
}
