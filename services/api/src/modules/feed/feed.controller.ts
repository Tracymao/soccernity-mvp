import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreatePostDto } from './dto/create-post.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

// Build Plan Section 4.3 (Feed Service). This slice is deliberately only
// POST /posts and GET /posts/feed — GET /posts/:id, like, comment, and
// save are a separate follow-up slice (see feed/README.md).
@Controller('posts')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  // Guard ordering: JwtAuthGuard first (attaches request.user), then
  // GuardianConsentGuard (reads request.user.sub, re-checks Postgres) —
  // the same convention documented on guardian-consent.guard.ts and
  // followed nowhere else yet, because no route existed to apply it to
  // until this one. Build Plan Section 5.7: "Re-check current status
  // against the database on every safety-sensitive action (posting,
  // messaging, joining a Banter Room or Community Group), not just on
  // login" — Section 5.7 names "posting" explicitly as one of the
  // safety-sensitive actions requiring this re-check.
  //
  // This is a judgment call, not a mechanical read of Section 8.3 step 5
  // alone — see feed/README.md's "spec discrepancy flagged" section:
  // step 5's own enumerated list of restricted-pending behaviors (no
  // public profile visibility, no DMs from unverified accounts, no
  // Banter Room participation beyond read-only) does not literally
  // include "creating a general feed post." Section 5.7's explicit,
  // broader instruction is what this guard placement actually rests on.
  @Post()
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreatePostDto) {
    return this.feedService.createPost(user.sub, dto);
  }

  // JwtAuthGuard only — reading a feed is not the safety-sensitive
  // action posting is. Section 8.3 step 5's restricted-pending
  // behaviors are all about what a restricted-pending MINOR can do or
  // be seen/contacted by; nothing there (or in Section 5.7's
  // safety-sensitive-action list) says reading one's own feed should be
  // blocked, and blocking it would be actively counter to "the account
  // exists but is restricted" (i.e. it still functions, just narrowly).
  @Get('feed')
  @UseGuards(JwtAuthGuard)
  async feed(@CurrentUser() user: AccessTokenPayload, @Query() query: FeedQueryDto) {
    return this.feedService.getFeed(user.sub, query);
  }
}
