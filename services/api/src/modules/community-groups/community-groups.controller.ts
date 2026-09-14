import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CommunityGroupsService } from './community-groups.service';
import { CreateCommunityGroupDto } from './dto/create-community-group.dto';
import { ListCommunityGroupMembersQueryDto } from './dto/list-community-group-members-query.dto';
import { ListCommunityGroupsQueryDto } from './dto/list-community-groups-query.dto';

// Build Plan Sprint 3 — Community Groups (Decision Log #281, design by
// `sprint-3/community-groups-design`; schema by
// `sprint-3/community-groups-backend`). No Section 3/Section 4 endpoint
// list existed for this feature before this PR — a genuine addition, not
// a literal spec line item, the same category of addition
// GrassrootsModule / BanterModule already made for their own features.
//
// Deliberately NOT built, per the design's own Design Notes frame
// (Decision Log #281): any group-post-composer or group-feed endpoint —
// Community Groups has no scoped feed-posting capability, mirroring
// Club — Fan Page's own no-composer state — and any moderation/report
// endpoint for group names (flagged item 2, open).
@Controller('community-groups')
export class CommunityGroupsController {
  constructor(private readonly communityGroups: CommunityGroupsService) {}

  // POST /community-groups — JwtAuthGuard + GuardianConsentGuard. Section
  // 5.7's safety-sensitive-action list names "joining a Banter Room or
  // Community Group" literally, and this is the direct textual referent
  // of the latter — see CommunityGroupsService.createGroup's own comment.
  // `createdById` = the caller. Permission model (Decision Log #281 item
  // 1, resolved): ANY consent-confirmed authenticated user, with only a
  // name-uniqueness safeguard against duplicates (409) — moderation/
  // size-limits/rate-limiting are flagged open, not built. Nest's default
  // 201 is correct — this genuinely creates a resource.
  @Post()
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateCommunityGroupDto) {
    return this.communityGroups.createGroup(user.sub, dto);
  }

  // GET /community-groups — JwtAuthGuard only. Browsing the group
  // directory is not a safety-sensitive action under Section 5.7 (all
  // action-verbs) — same reasoning as GET /clubs / GET /banter-rooms.
  // Three optional, combinable equality filters (city/positionPlayed/
  // careerTrack); response carries a per-caller `joined` flag (Decision
  // Log #154/#275 pattern) even though the Figma browse cards render no
  // Join button — that's a frontend layout choice, not a reason to omit
  // the data from the API (see community-groups.service.ts's own
  // comment).
  //
  // Declared before GET /community-groups/:id so Nest matches a bare
  // /community-groups request here.
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Query() query: ListCommunityGroupsQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.communityGroups.listGroups(query, user.sub);
  }

  // GET /community-groups/:id — JwtAuthGuard only, reading a single group
  // is no more safety-sensitive than reading the directory it came from.
  // 404 for a non-existent id (CommunityGroupsService.getGroupById).
  // Carries per-caller `joined`.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.communityGroups.getGroupById(id, user.sub);
  }

  // GET /community-groups/:id/members — the roster. JwtAuthGuard only,
  // same reasoning as GET /community-groups / GET /community-groups/:id
  // above — no @CurrentUser() needed (unlike GET /community-groups, this
  // endpoint has no per-caller field in its response). Mirrors GET
  // /clubs/:id/members exactly — see
  // CommunityGroupsService.getGroupMembers.
  //
  // A more specific path than GET /community-groups/:id (an extra
  // segment), so it never collides with that route regardless of
  // declaration order.
  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  async members(@Param('id') id: string, @Query() query: ListCommunityGroupMembersQueryDto) {
    return this.communityGroups.getGroupMembers(id, query);
  }

  // POST /community-groups/:id/join — JwtAuthGuard + GuardianConsentGuard,
  // the literal referent of Section 5.7's "joining a ... Community
  // Group" — see CommunityGroupsService.joinGroup's own comment.
  // HttpCode(200): an idempotent toggle, not a resource creation — same
  // as like/save/follow/club-join/banter-room-join.
  @Post(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async join(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.communityGroups.joinGroup(user.sub, id);
  }

  // DELETE /community-groups/:id/join — same path as POST (follow/like/
  // save/club-join/banter-room-join convention). GUARD JUDGMENT CALL,
  // argued explicitly in CommunityGroupsService.leaveGroup's own comment
  // (not silently inherited): JwtAuthGuard + GuardianConsentGuard, the
  // SAME pair as join — following BanterService.leaveRoom's precedent
  // (Section 5.7 names "joining a ... Community Group"; leaving is the
  // reverse of that same named action) rather than
  // ClubsService.leaveClub's JwtAuthGuard-only one, since clubs.controller.ts's
  // own reasoning is explicit that a ClubPage join is "neither a Banter
  // Room nor a Community Group" — the exact carve-out that does NOT apply
  // to this model. HttpCode(200), idempotent (leaving a group you're not
  // in is a 200, not a 404), memberCount floor-guarded >= 0.
  @Delete(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async leave(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.communityGroups.leaveGroup(user.sub, id);
  }
}
