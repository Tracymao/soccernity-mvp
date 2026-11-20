import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

// GET /users/:id/saved-posts (Build Plan Section 4.3) is the one
// endpoint in this slice whose *path* belongs to the User Service
// (/users/*) even though it's backed by FeedService and the SavedPost
// model this module owns. It lives here, in its own controller, rather
// than on UsersController (users/users.controller.ts) — that controller
// depends only on UsersService today, and giving it a FeedService
// dependency just for this one route would blur module boundaries for
// no real benefit. Nest allows multiple controllers to share a route
// prefix across different modules (there's no single "owner" of
// '/users' as a whole), so this compiles and routes correctly alongside
// UsersController.
//
// Spec gap, flagged not silently resolved (see feed/README.md and the
// precedent set in users/README.md for self-scoped routes): Section 4.3
// doesn't say whether :id must equal the caller's own id, or whether a
// user's saved posts are visible to others. This PR defaults to the
// conservative reading — self-only, 403 on mismatch — mirroring
// UsersController.assertSelf() exactly. Widening this to allow viewing
// someone else's saved posts (there's a real product argument either
// way — "saved" often implies private, but a public "reading list"
// isn't unheard of either) is a Decision Log candidate, not something
// to guess at here.
@Controller('users')
@UseGuards(JwtAuthGuard)
export class SavedPostsController {
  constructor(private readonly feedService: FeedService) {}

  @Get(':id/saved-posts')
  async getSavedPosts(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: FeedQueryDto,
  ) {
    this.assertSelf(id, user);
    return this.feedService.getSavedPosts(user.sub, query);
  }

  // Identical in shape and intent to UsersController.assertSelf() —
  // duplicated rather than extracted into a shared helper, since the two
  // controllers otherwise have no coupling and a shared util for a
  // three-line check isn't worth the cross-module dependency it would
  // introduce.
  private assertSelf(id: string, user: AccessTokenPayload): void {
    if (id !== user.sub) {
      throw new ForbiddenException('You may only view your own saved posts');
    }
  }
}
