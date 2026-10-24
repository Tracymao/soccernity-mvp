import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import { ContestVotingService } from './contest-voting.service';
import { ContestService } from './contest.service';
import { SubmitEntryDto } from './dto/submit-entry.dto';
import { SubmitFinalEntryDto } from './dto/submit-final-entry.dto';

// The user-facing Contest (backend/w7-contest, B-091; Decision Log #381-#388, #393, #399-#401,
// #404-#406; docs/contest-spec.md). None of these are in Build Plan Section 4 (which has no Contest
// lines at all); they are genuine additions, Decision Log #218 / #381.
//
// The write routes pin the uniform write block (#370, B-026): GuardianConsentGuard on every one (a
// restricted account cannot enter, vote or un-vote), EmailVerifiedGuard on the CREATING forms (an
// entry, a final entry, a vote), ProfileCompleteGuard on the routes that publish content under the
// user's identity (the two entries). Un-voting is an undo, so it carries the consent guard only.
// write-route-guards.spec.ts pins this table.
@Controller('contest')
export class ContestController {
  constructor(
    private readonly contestService: ContestService,
    private readonly votingService: ContestVotingService,
  ) {}

  // GET /contest/current -- the single call the Create Post "Contest" tab (Decision Log #188), the
  // Contest page and the Leaderboard Contest tab read. JwtAuthGuard only: reading (Decision Log #129:
  // anything Leaderboard-adjacent is login-gated but not consent-gated).
  @Get('current')
  @UseGuards(JwtAuthGuard)
  async current(@CurrentUser() user: AccessTokenPayload) {
    return this.contestService.getCurrentContest(user.sub);
  }

  // GET /contest/cycles/:id -- one cycle in full, for the "past months" view. Declared AFTER `current`
  // so Nest never matches the literal "current" segment against `:id`.
  @Get('cycles/:id')
  @UseGuards(JwtAuthGuard)
  async cycle(@Param('id') id: string) {
    return this.contestService.getCycleById(id);
  }

  // GET /contest/rounds/:roundId/entries -- the entries of one round: every entry while Phase 1 is
  // open (paged), the top 10 with live vote counts during Phase 2, the decided order afterwards, and
  // the finalists' entries from the reveal (the caller's own final entry before it).
  @Get('rounds/:roundId/entries')
  @UseGuards(JwtAuthGuard)
  async roundEntries(
    @Param('roundId') roundId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: FeedQueryDto,
  ) {
    return this.contestService.listRoundEntries(roundId, user.sub, query);
  }

  // GET /contest/users/:userId/pinned-entry -- the contest entry pinned on a user's profile, if any.
  @Get('users/:userId/pinned-entry')
  @UseGuards(JwtAuthGuard)
  async pinnedEntry(@Param('userId') userId: string, @CurrentUser() user: AccessTokenPayload) {
    return this.contestService.getPinnedEntry(userId, user.sub);
  }

  // POST /contest/entries -- submit an already-created Post as this week's entry (Phase 1 only). The
  // composer creates the Post via POST /posts first, so that stays the single post-creation path.
  // HttpCode(201): a successful submission always creates exactly one new ContestEntry row.
  @Post('entries')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async submitEntry(@CurrentUser() user: AccessTokenPayload, @Body() dto: SubmitEntryDto) {
    return this.contestService.submitEntry(user.sub, dto.postId);
  }

  // POST /contest/final-entry -- a finalist's NEW final video (days 22-24). The post is created here,
  // hidden from the first instant (see SubmitFinalEntryDto).
  @Post('final-entry')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async submitFinalEntry(@CurrentUser() user: AccessTokenPayload, @Body() dto: SubmitFinalEntryDto) {
    return this.contestService.submitFinalEntry(user.sub, dto);
  }

  // PUT /contest/entries/:entryId/vote -- vote for an entry (the toggle's "on"). Idempotent for the
  // same entry; a different entry while already holding a vote is a 409 (un-vote first, #401).
  @Put('entries/:entryId/vote')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard, EmailVerifiedGuard)
  async vote(@CurrentUser() user: AccessTokenPayload, @Param('entryId') entryId: string) {
    return this.votingService.castVote(user.sub, entryId);
  }

  // DELETE /contest/entries/:entryId/vote -- un-vote (the toggle's "off"). Idempotent.
  @Delete('entries/:entryId/vote')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async unvote(@CurrentUser() user: AccessTokenPayload, @Param('entryId') entryId: string) {
    return this.votingService.retractVote(user.sub, entryId);
  }
}
