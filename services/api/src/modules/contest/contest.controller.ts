import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { ContestService } from './contest.service';
import { SubmitEntryDto } from './dto/submit-entry.dto';

// sprint-2/contest-data-model-backend — the user-facing Contest endpoints.
// None of these are in Build Plan Section 4 (which has no Contest lines at
// all); they are genuine additions, flagged as Decision Log #218. See
// contest/README.md and Decision Log #61/#70/#71/#130/#188.
@Controller('contest')
export class ContestController {
  constructor(private readonly contestService: ContestService) {}

  // GET /contest/current — the single call the Create Post "For Contest"
  // mode-tab (Decision Log #188) and the Leaderboard Contest tab
  // (Decision Log #61/#70) both read. JwtAuthGuard only: reading, and
  // Decision Log #129 already settled that anything Leaderboard-adjacent
  // is login-gated but not consent-gated. @CurrentUser() is needed for
  // the `callerEntry` field ("have I already entered this week?").
  @Get('current')
  @UseGuards(JwtAuthGuard)
  async current(@CurrentUser() user: AccessTokenPayload) {
    return this.contestService.getCurrentContest(user.sub);
  }

  // GET /contest/cycles/:id — one cycle in full, for the Contest tab's
  // "past months" view. JwtAuthGuard only, same reasoning as above.
  // Declared AFTER `current` so Nest never matches the literal "current"
  // segment against this `:id` route.
  @Get('cycles/:id')
  @UseGuards(JwtAuthGuard)
  async cycle(@Param('id') id: string) {
    return this.contestService.getCycleById(id);
  }

  // POST /contest/entries — submit an already-created Post as this
  // cycle's entry (the "Create a Post — For Contest" flow's second call;
  // the composer creates the Post via POST /posts first).
  //
  // JwtAuthGuard + GuardianConsentGuard: submitting a contest entry is a
  // content-creation action, gated the same way POST /posts and
  // POST /posts/:id/comments are (Decision Log #21's broad reading of
  // Section 5.7 "posting"). This is also defence-in-depth — the Post it
  // references was itself created through the GuardianConsentGuard-gated
  // POST /posts, so a restricted-pending minor could never have a Post to
  // submit here — but the guard is applied explicitly rather than relied
  // on transitively.
  //
  // HttpCode(201): unlike the idempotent like/save toggles, a successful
  // submission always creates exactly one new ContestEntry row.
  @Post('entries')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async submitEntry(@CurrentUser() user: AccessTokenPayload, @Body() dto: SubmitEntryDto) {
    return this.contestService.submitEntry(user.sub, dto.postId);
  }
}
