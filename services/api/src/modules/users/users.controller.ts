import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// ---------------------------------------------------------------------
// SPEC NOTE (flagged, not silently resolved — see PR report): this PR's
// task brief asked for `GET /users/me` / `PATCH /users/me`, but Build
// Plan Section 4.2 (User Service) actually specifies:
//
//   GET    /users/:id
//   PATCH  /users/:id
//   GET    /users/:id/profile
//   POST   /users/:id/follow
//   DELETE /users/:id/follow
//   GET    /users/:id/followers
//   GET    /users/:id/following
//
// There is no `/users/me` in the spec, and no `GET /auth/me` here either
// — that's Section 4.1 (Auth Service), a separate B2-B4 endpoint. This
// controller implements the literal spec routes (`GET`/`PATCH
// /users/:id`), scoped to self only for this PR: both handlers 403 if
// `:id` isn't the authenticated user's own id. That matches this PR's
// actual brief (view/edit "my" profile) without inventing an undocumented
// `/me` alias.
//
// Deliberately OUT of scope for this PR (B6), left for later work:
// `GET /users/:id/profile` (the public-facing view of *another* user —
// needs field curation for non-owners, not just auth) and the
// follow/follower endpoints (social graph, pagination — Section 5.5).
// Both are genuinely separate concerns from "does the owner's own
// profile view/edit endpoint work," which was B6's whole scope.
//
// UPDATE (Sprint 2, sprint-2/follow-and-notifications): the four
// follow/follower endpoints described above as deferred are now built
// below (`follow`/`unfollow`/`followers`/`following`). `GET
// /users/:id/profile` remains deliberately unbuilt — still no field
// curation for a non-owner's view exists anywhere in this codebase, and
// nothing in this PR's brief asked for it. See users/README.md for the
// guard-choice and scope reasoning behind each of the four new routes.
// ---------------------------------------------------------------------
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    this.assertSelf(id, user);
    return this.usersService.getOwnProfile(user.sub);
  }

  @Patch(':id')
  async updateById(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateUserDto,
  ) {
    this.assertSelf(id, user);
    return this.usersService.updateOwnProfile(user.sub, dto);
  }

  // NOTE: user.sub (from the verified JWT) is what's actually passed to
  // UsersService, not the :id path param — the path param is only used
  // for this ownership check. This means even if the check below were
  // ever weakened, the service call itself can't act on any id other
  // than the token holder's own.
  private assertSelf(id: string, user: AccessTokenPayload): void {
    if (id !== user.sub) {
      throw new ForbiddenException('You may only view or edit your own profile via this endpoint');
    }
  }

  // POST/DELETE /users/:id/follow — JwtAuthGuard only, deliberately NOT
  // GuardianConsentGuard. Re-argued specifically for follow, not
  // inherited from POST /posts or the like endpoints' own conclusions —
  // see users/README.md's "Is following 'posting'?" section for the full
  // reasoning. Short version: a follow relationship produces even less
  // visible content than a like does (feed/README.md already argued a
  // like isn't "posting" because it creates no content of its own beyond
  // a number changing) — a follow doesn't even change a number anyone
  // else sees, since there's no follower/following count field anywhere
  // in schema.prisma. HttpCode(200) on the POST here, same reasoning as
  // FeedController's like/save endpoints: a follow/unfollow toggle
  // doesn't always "create a resource" on a given call (idempotency
  // below), so 200-with-resulting-state fits better than a "Created"
  // status that may not have created anything this call.
  //
  // Self-follow/self-unfollow (:id === caller's own id) → 400, and
  // :id not referencing a real User → 404 — both are UsersService
  // business rules (assertUserExists / the followerId === followeeId
  // check), not controller-level checks, the same "cross-field/business
  // rules belong in the service" precedent FeedService established.
  @Post(':id/follow')
  @HttpCode(200)
  async follow(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.usersService.followUser(user.sub, id);
  }

  @Delete(':id/follow')
  async unfollow(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.usersService.unfollowUser(user.sub, id);
  }

  // GET /users/:id/followers, GET /users/:id/following — JwtAuthGuard
  // only, and deliberately NOT self-scoped (unlike GET/PATCH /users/:id
  // above, or GET /users/:id/saved-posts in the feed module). See
  // users/README.md's "followers/following public-scope reasoning" for
  // the full argument: followers/following lists are standard public
  // social graph data on essentially every platform this product is
  // modeled after, and nothing in Section 8.3 step 5's restricted-pending
  // list or Section 5.7's safety-sensitive-action list names them. This
  // is a deliberate departure from the self-only default the saved-posts
  // endpoint chose under the same kind of spec silence — not an
  // unexamined default here, a different judgment call reached because
  // there's an actual signal to reason from this time. Paginated with the
  // same keyset-cursor FeedQueryDto/cursor.util.ts machinery as every
  // other list endpoint in this codebase (Section 5.5). :id not
  // referencing a real User → 404 (UsersService.assertUserExists).
  @Get(':id/followers')
  async followers(@Param('id') id: string, @Query() query: FeedQueryDto) {
    return this.usersService.getFollowers(id, query);
  }

  @Get(':id/following')
  async following(@Param('id') id: string, @Query() query: FeedQueryDto) {
    return this.usersService.getFollowing(id, query);
  }
}
