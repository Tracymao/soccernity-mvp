import { Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { ListFixturesQueryDto } from './dto/list-fixtures-query.dto';
import { ListLiveScoresQueryDto } from './dto/list-live-scores-query.dto';
import { MatchKickoffService } from './match-kickoff.service';
import { SportsService } from './sports.service';

// Build Plan Section 4.6 — the Sports Hub / Highlightly integration. NO GUARD on this controller at
// all — every route here is genuinely public, matching this codebase's already-shipped
// SportsHubPage.tsx (no login gate) and the identical no-guard-at-all precedent blog's
// ArticlesController already established for public content (Build Plan Section 4's own "no auth
// required" line applies the same way here — nothing in Section 4.6 names an auth requirement, and
// live scores/fixtures are exactly the kind of content a logged-out visitor should be able to see).
@Controller('sports')
export class SportsMatchesController {
  constructor(
    private readonly sportsService: SportsService,
    private readonly matchKickoffService: MatchKickoffService,
  ) {}

  @Get('live-scores')
  async liveScores(@Query() query: ListLiveScoresQueryDto) {
    return this.sportsService.listLiveScores(query);
  }

  @Get('fixtures')
  async fixtures(@Query() query: ListFixturesQueryDto) {
    return this.sportsService.listFixtures(query);
  }

  // Deliberately AFTER 'live-scores'/'fixtures' above but that's irrelevant here — those are
  // different static path segments from ':id', so there's no route-ordering hazard the way a
  // literal 'mine'/'search' segment sharing the SAME position as ':id' would create (see e.g.
  // banter.controller.ts's own comment on that exact hazard).
  @Get('matches/:id')
  async getById(@Param('id') id: string) {
    return this.sportsService.getMatchById(id);
  }

  @Get('matches/:id/stats')
  async getStats(@Param('id') id: string) {
    return this.sportsService.getMatchStatistics(id);
  }

  // Per-player box score (Highlightly GET /box-score/{matchId}). Called only from the Match Centre's
  // Statistics tab, so it is never spent on a list view — see sports.service.ts's getMatchBoxScore.
  @Get('matches/:id/box-score')
  async getBoxScore(@Param('id') id: string) {
    return this.sportsService.getMatchBoxScore(id);
  }

  @Get('matches/:id/lineups')
  async getLineups(@Param('id') id: string) {
    return this.sportsService.getMatchLineups(id);
  }

  @Get('matches/:id/h2h')
  async getH2h(@Param('id') id: string) {
    return this.sportsService.getHeadToHead(id);
  }

  // NOT in Section 4.6's own literal endpoint list — a Decision Log candidate flagged in
  // modules/sports/README.md, built to match what the figma-screen-builder "Highlightly data
  // redesign" pass designed (Match Momentum, desktop + mobile).
  @Get('matches/:id/momentum')
  async getMomentum(@Param('id') id: string) {
    return this.sportsService.getMatchMomentum(id);
  }

  // Also NOT in Section 4.6's own literal endpoint list — same Decision Log candidate as momentum
  // above. Backs the Figma design's "Live Commentary" section (an automated event feed, explicitly
  // NOT editorial commentary — see that design's own on-screen disclosure, mirrored in this route's
  // own response, never narrated prose).
  @Get('matches/:id/events')
  async getEvents(@Param('id') id: string) {
    return this.sportsService.getMatchEvents(id);
  }

  // Section 4.6's own literal path — GET /sports/highlights/:matchId, a top-level segment, not
  // nested under matches/:id.
  @Get('highlights/:matchId')
  async getHighlights(@Param('matchId') matchId: string) {
    return this.sportsService.getHighlights(matchId);
  }

  // sprint-4/match-kickoff-alerts (Decision Log #336 item 2). The one route in this controller that
  // requires a session: a subscription is per-user state, so it can't be served anonymously. JwtAuthGuard
  // ONLY, no GuardianConsentGuard or Under16RestrictionGuard. Founder-confirmed: a subscription
  // produces no visible content, so a restricted-pending minor may subscribe.
  @Put('matches/:id/subscription')
  @UseGuards(JwtAuthGuard)
  async subscribe(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    await this.matchKickoffService.subscribe(user.sub, id);
    return { subscribed: true };
  }

  @Delete('matches/:id/subscription')
  @UseGuards(JwtAuthGuard)
  async unsubscribe(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    await this.matchKickoffService.unsubscribe(user.sub, id);
    return { subscribed: false };
  }
}
