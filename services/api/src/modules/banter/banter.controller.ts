import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import { BanterService } from './banter.service';
import { CreateBanterPostDto } from './dto/create-banter-post.dto';
import { CreateBanterRoomDto } from './dto/create-banter-room.dto';
import { ListBanterRoomsQueryDto } from './dto/list-banter-rooms-query.dto';
import { MyBantsQueryDto } from './dto/my-bants-query.dto';

// Build Plan Section 4.4 (Club & Banter Service) — the /banter-rooms
// half, Sprint 3. The /clubs half lives on ClubsController.
//
// Section 4.4 lists: GET /banter-rooms, GET /banter-rooms/:id, POST
// /banter-rooms, POST /banter-rooms/:id/topics, GET
// /banter-rooms/search?q=. This controller builds all of those EXCEPT
// POST /banter-rooms/:id/topics (there is no Topic entity in Section 3
// and scopeType:'topic' is a room *category*, not a room *having*
// topics — flagged as a Decision Log candidate in banter/README.md, not
// built). It also adds three endpoints Section 4.4's literal list omits
// but Section 6's Sprint 3 description + Post.banterRoomId's existence
// require: POST/DELETE /banter-rooms/:id/join, GET /banter-rooms/mine
// ("My Bants"), and POST/GET /banter-rooms/:id/posts. All flagged in the
// README the same way GrassrootsController flagged PATCH
// /fixtures/:id/status (Decision Log #254).
//
// Guard reasoning per route is inline below and in banter/README.md.
@Controller('banter-rooms')
export class BanterController {
  constructor(private readonly banter: BanterService) {}

  // POST /banter-rooms — JwtAuthGuard + GuardianConsentGuard. A Banter
  // Room is a public-facing, persistent, named record other users see
  // and join: a "posting"-class action under Section 5.7's broad reading
  // (Decision Log #21), so a restricted-pending minor cannot create one.
  // `createdBy` = the caller. Permission model: ANY consent-confirmed
  // authenticated user (default, matching POST /teams — Decision Log
  // #255); flagged as a Decision Log candidate whether room creation
  // should later be moderator-gated (an unbounded supply of user-named
  // public rooms on a minors' platform is a real spam/safeguarding
  // surface). Nest's default 201 is correct here — this genuinely
  // creates a resource, unlike the join toggle below.
  @Post()
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateBanterRoomDto) {
    return this.banter.createRoom(user.sub, dto);
  }

  // GET /banter-rooms — JwtAuthGuard only. Browsing the room catalog is
  // not a safety-sensitive action under Section 5.7 (all action-verbs);
  // same reasoning as GET /clubs. Optional ?scopeType= filter; response
  // carries a per-caller `joined` flag (Decision Log #154 pattern).
  //
  // Declared before GET /banter-rooms/:id so Nest matches a bare
  // /banter-rooms request here.
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Query() query: ListBanterRoomsQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.banter.listRooms(query, user.sub);
  }

  // GET /banter-rooms/search?q= — Section 4.4's literal search route.
  // Shares BanterService.listRooms with GET /banter-rooms (same
  // scopeType + name filter mechanism, the GrassrootsPage server-side
  // filter precedent); this route exists because Section 4.4 names it.
  // Declared before /:id.
  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(@Query() query: ListBanterRoomsQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.banter.listRooms(query, user.sub);
  }

  // GET /banter-rooms/mine — "My Bants" (Build Plan Section 6, Sprint 3).
  // JwtAuthGuard only — reading your own memberships. Declared before
  // /:id so "mine" isn't matched as a room id.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async mine(@Query() query: MyBantsQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.banter.getMyRooms(user.sub, query);
  }

  // GET /banter-rooms/:id — JwtAuthGuard only, reading a single room is
  // no more safety-sensitive than reading the catalog. 404 for a
  // non-existent id (BanterService.getRoomById). Carries per-caller
  // `joined`.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.banter.getRoomById(id, user.sub);
  }

  // POST /banter-rooms/:id/join — JwtAuthGuard + GuardianConsentGuard.
  // This is the one action Section 5.7 AND Section 8.3 step 5 both name
  // literally ("joining a Banter Room" / "no participation in Banter
  // Rooms beyond read-only"), so it is consent-gated without
  // interpretation — a deliberate divergence from POST /clubs/:id/join
  // (JwtAuthGuard only), whose own reasoning rested on "a ClubPage join
  // is NOT a Banter Room". HttpCode(200): an idempotent toggle, not a
  // resource creation — same as like/save/follow/club-join.
  @Post(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async join(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.banter.joinRoom(user.sub, id);
  }

  // DELETE /banter-rooms/:id/join — same path as POST (follow/like/save/
  // club-join convention). JwtAuthGuard + GuardianConsentGuard: a short
  // confirmation of join's own argument. HttpCode(200), idempotent
  // (leaving a room you're not in is a 200, not a 404), memberCount
  // floor-guarded >= 0.
  @Delete(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async leave(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.banter.leaveRoom(user.sub, id);
  }

  // GET /banter-rooms/:id/posts — the room feed. JwtAuthGuard only
  // (reading, like GET /clubs/:id/feed and GET /posts/feed). Room
  // existence checked first (404), then delegated to
  // FeedService.getBanterRoomFeed — identical FeedPage /
  // FeedPostWithViewerState shape to GET /posts/feed. Not in Section
  // 4.4's literal list; flagged in the README as the obvious
  // read-counterpart of posting and a 1:1 mirror of GET /clubs/:id/feed.
  @Get(':id/posts')
  @UseGuards(JwtAuthGuard)
  async roomFeed(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: FeedQueryDto,
  ) {
    await this.banter.assertRoomExists(id);
    return this.banter.getRoomFeed(id, user.sub, query);
  }

  // POST /banter-rooms/:id/posts — JwtAuthGuard + GuardianConsentGuard
  // (posting). Delegates to FeedService.createPost with banterRoomId set
  // — the single post-creation path, not a parallel one. 404 room ->
  // 403 not-a-member -> create, in that order. Nest's default 201 (this
  // really does create a Post).
  @Post(':id/posts')
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async postToRoom(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateBanterPostDto,
  ) {
    return this.banter.postToRoom(user.sub, id, dto);
  }
}
