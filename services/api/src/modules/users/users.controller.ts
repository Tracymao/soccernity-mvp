import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
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
// Deliberately OUT of scope for this PR, left for later work:
// `GET /users/:id/profile` (the public-facing view of *another* user —
// needs field curation for non-owners, not just auth) and the
// follow/follower endpoints (social graph, pagination — Section 5.5).
// Both are genuinely separate concerns from "does the owner's own
// profile view/edit endpoint work," which is this PR's whole scope.
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
}
