import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

// Build Plan Section 4.3 (Feed Service). Slice one (merged, PR #53) was
// POST /posts and GET /posts/feed only. Slice two (merged, PR #54) added
// the remaining seven: GET /posts/:id, POST/DELETE /posts/:id/like,
// POST/GET /posts/:id/comments, POST/DELETE /posts/:id/save. The eighth
// Section 4.3 endpoint, GET /users/:id/saved-posts, lives on
// SavedPostsController (saved-posts.controller.ts) in this same module
// — its path is under /users, not /posts, so it can't share this
// controller's @Controller('posts') prefix, but it shares FeedService
// and this module's guard/select conventions. DELETE
// /posts/:id/comments/:commentId (this PR, sprint-2/comment-delete) is a
// genuine addition beyond Section 4.3's original nine-endpoint list —
// see feed/README.md for the full reasoning, including why it's a
// flagged Decision Log candidate rather than something quietly slipped
// in. See feed/README.md for the full guard-choice reasoning for every
// route in this module.
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

  // GET /posts/:id — JwtAuthGuard only, same category as GET
  // /posts/feed: reading a single post isn't the safety-sensitive action
  // posting is. NestJS route-matching note: this MUST be declared after
  // @Get('feed') above, or Nest would try to match the literal segment
  // "feed" against this :id param route first and this one would shadow
  // it — same ordering constraint that already applied before this PR,
  // just now relevant because a second GET on this controller exists.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string) {
    return this.feedService.getPostById(id);
  }

  // POST/DELETE /posts/:id/like — JwtAuthGuard only, deliberately NOT
  // GuardianConsentGuard. This is a real judgment call, not an assumed
  // carry-over from POST /posts's own guard choice — see
  // feed/README.md's "Is liking 'posting'?" section for the full
  // reasoning. Short version: Section 5.7's safety-sensitive-action list
  // names "posting, messaging, joining a Banter Room or Community
  // Group" — a like is not new user-generated content visible to
  // others in the way a post or comment is; it produces no content of
  // its own at all. HttpCode(200) on the POST here (rather than Nest's
  // default 201 for POST): a like/unlike toggle doesn't "create a
  // resource" the way POST /posts does — 200 with the resulting state
  // fits an idempotent action better than a "Created" status that may
  // not have created anything on this particular call (see
  // FeedService.likePost's idempotency handling).
  @Post(':id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async like(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.feedService.likePost(user.sub, id);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  async unlike(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.feedService.unlikePost(user.sub, id);
  }

  // POST /posts/:id/comments — JwtAuthGuard AND GuardianConsentGuard.
  // Unlike liking, this genuinely is original user-generated content
  // visible to others, arguably closer to POST /posts itself than to
  // liking — see feed/README.md's "Is commenting 'posting'?" section for
  // the full argument. Landed the same direction slice one's README
  // argued for POST /posts: Section 5.7's "posting" language is read as
  // covering it.
  @Post(':id/comments')
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async addComment(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateCommentDto,
  ) {
    return this.feedService.addComment(id, user.sub, dto);
  }

  // GET /posts/:id/comments — JwtAuthGuard only, reading is not posting,
  // same category as GET /posts/feed and GET /posts/:id.
  @Get(':id/comments')
  @UseGuards(JwtAuthGuard)
  async getComments(@Param('id') id: string, @Query() query: FeedQueryDto) {
    return this.feedService.getComments(id, query);
  }

  // DELETE /posts/:id/comments/:commentId — JwtAuthGuard only,
  // deliberately NOT GuardianConsentGuard. Argued fresh here rather than
  // inherited from POST /posts/:id/comments's own GuardianConsentGuard-
  // gated conclusion (Decision Log #21 gated comment CREATION on the
  // reading that it's "closer to posting" — genuinely new content
  // visible to others). Removing your own content, or moderating content
  // left on your own post, doesn't produce any new visible content — the
  // same category feed/README.md already puts unlike/unsave in, not the
  // category POST /posts/:id/comments is in. See feed/README.md for the
  // full argument.
  //
  // Default 204 (no body), not the 200-with-resulting-state pattern
  // like/save/follow/join/leave use — see feed/README.md's "response
  // shape" section for why: a delete has nothing meaningful left to
  // return about the now-gone resource, unlike a toggle endpoint whose
  // whole point is reporting the resulting state.
  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    return this.feedService.deleteComment(id, commentId, user.sub);
  }

  // POST/DELETE /posts/:id/save — JwtAuthGuard only. Saving a post is a
  // private bookmarking action (see feed/README.md): it creates no
  // content visible to anyone but the saver, so it doesn't fall under
  // Section 5.7's "posting" language any more than liking does. Same
  // HttpCode(200) reasoning as the like endpoint above — an idempotent
  // toggle, not a resource creation in the POST /posts sense.
  @Post(':id/save')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async save(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.feedService.savePost(user.sub, id);
  }

  @Delete(':id/save')
  @UseGuards(JwtAuthGuard)
  async unsave(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.feedService.unsavePost(user.sub, id);
  }
}
