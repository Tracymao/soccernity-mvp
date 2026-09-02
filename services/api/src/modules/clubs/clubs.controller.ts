import { Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { ClubsService } from './clubs.service';
import { ListClubsQueryDto } from './dto/list-clubs-query.dto';

// Build Plan Section 4.4 (Club & Banter Service) — the club subset only:
// GET /clubs, GET /clubs/:id, POST /clubs/:id/join. /banter-rooms* (the
// other half of Section 4.4) is explicitly Sprint 3 scope, not built
// here — see clubs/README.md.
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  // JwtAuthGuard only — argued fresh for this resource, not inherited
  // from GET /posts/feed or GET /users/:id/followers's own guard
  // choices. Browsing the club catalog isn't a safety-sensitive action
  // under Section 5.7's list ("posting, messaging, joining a Banter Room
  // or Community Group") — reading never is, that list is entirely
  // action-verbs — and nothing in Section 8.3 step 5's restricted-pending
  // enumeration mentions club browsing either. JwtAuthGuard alone (no
  // GuardianConsentGuard) is required simply because every endpoint in
  // this codebase so far requires SOME authentication; there is no
  // logged-out/public route anywhere yet, and Section 4.4 gives no signal
  // that GET /clubs should be the first exception to that.
  // @CurrentUser() added (Decision Log #154): the response now carries a
  // per-caller `joined` boolean, so the service needs the caller's own
  // id. JwtAuthGuard already attaches request.user — signature change
  // only, no new guard wiring.
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Query() query: ListClubsQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.clubsService.listClubs(query, user.sub);
  }

  // JwtAuthGuard only, same reasoning as GET /clubs above — reading a
  // single club's page is no more safety-sensitive than reading the
  // catalog it came from. :id not referencing a real ClubPage → 404
  // (ClubsService.getClubById).
  //
  // @CurrentUser() added (Decision Log #154), mirroring the same change
  // PR #136 made to feed.controller.ts's getById — the response carries a
  // per-caller `joined` flag, so the service needs the caller id.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.clubsService.getClubById(id, user.sub);
  }

  // JwtAuthGuard only — argued fresh, not inherited from POST /posts's
  // GuardianConsentGuard-gated conclusion (feed/README.md point 1) or
  // POST /users/:id/follow's non-gated one (users/README.md point 1).
  // Section 5.7's safety-sensitive-action list names "joining a Banter
  // Room or Community Group" explicitly — but a ClubPage fan-page join
  // is neither of those two named things: it's not a Banter Room (a
  // materially different model — schema.prisma's BanterRoom — with its
  // own membership concept), and "Community Group" isn't a term this
  // codebase's schema uses for anything, so reading it as covering
  // ClubPage would be extending Section 5.7's own language rather than
  // applying it. A club fan-page join also produces no visible content of
  // its own (same category feed/README.md already put liking, saving,
  // and following in) — only a memberCount changing, which
  // users/README.md's point 1 already treated as not meeting the bar
  // "posting" requires. Not flagged as a Decision Log candidate for that
  // reason — this reads unambiguous enough that there's no real tension
  // to resolve, same category as feed/README.md's liking/saving points,
  // not its posting/commenting ones.
  //
  // HttpCode(200), same reasoning as every other idempotent toggle action
  // in this codebase (like/save/follow): joining doesn't always "create a
  // resource" on a given call (see idempotency below), so 200-with-
  // resulting-state fits better than Nest's default 201.
  //
  // Section 4.4 originally listed no leave/unjoin endpoint — unlike
  // follow/like/save, which are all POST+DELETE pairs. That gap is now
  // closed by DELETE :id/join below (sprint-2/club-leave). See
  // clubs/README.md's "join-only, no leave" section for the full history
  // of why this endpoint didn't exist until now, and for the Decision
  // Log candidate this closes.
  @Post(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async join(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.clubsService.joinClub(user.sub, id);
  }

  // DELETE /clubs/:id/join. Symmetric with POST above, same route path
  // (matching follow/like/save's own POST+DELETE-same-path convention,
  // e.g. POST/DELETE /users/:id/follow, POST/DELETE /posts/:id/like).
  //
  // JwtAuthGuard only — this is a short confirmation of join's own
  // guard argument above, not a fresh one: every reason join gave for
  // staying JwtAuthGuard-only (a ClubPage fan-page membership is neither
  // "a Banter Room" nor "a Community Group" under Section 5.7's literal
  // list, and it produces no visible content — only a memberCount
  // changing) applies at least as strongly to leaving as to joining.
  // Leaving is, if anything, a more clearly non-safety-sensitive action
  // than joining. See clubs/README.md for the full restatement.
  //
  // HttpCode(200), same reasoning as join and every other idempotent
  // toggle action in this codebase (like/save/follow): leaving doesn't
  // always change any state on a given call (see idempotency below), so
  // 200-with-resulting-state fits better than a 204.
  //
  // Idempotent: leaving a club you're not a member of is a 200 with
  // { joined: false, memberCount unchanged }, never a 404 — matching
  // unlikePost/unfollowUser/unsavePost's own precedent for their DELETE
  // endpoints. A non-existent :id is still a 404 (ClubsService.
  // assertClubExists), identical to join's own 404 case.
  @Delete(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.clubsService.leaveClub(user.sub, id);
  }
}
