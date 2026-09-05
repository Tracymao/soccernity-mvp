import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { SavedPostsController } from './saved-posts.controller';

// Sprint 2 — Section 4.3 (Feed Service). Slice one (PR #53, merged) was
// POST /posts + GET /posts/feed only. This module now also covers the
// remaining seven endpoints from this slice: GET /posts/:id,
// like/unlike, comment create/list, save/unsave (all on FeedController),
// and GET /users/:id/saved-posts (on SavedPostsController — see that
// file for why a /users-prefixed route lives in the feed module).
// Imports AuthFoundationModule so JwtAuthGuard and GuardianConsentGuard
// resolve via DI, same pattern UsersModule established in Sprint 1 —
// see users.module.ts.
// FeedService is exported (sprint-2/club-fan-page-backend) so ClubsModule
// can inject it for GET /clubs/:id/feed — the club-scoped feed reuses
// FeedService.getClubFeed rather than reimplementing POST_SELECT /
// attachViewerState / the feed cursor in ClubsService. Same
// export-a-service-for-cross-module-DI pattern ClubsModule itself already
// uses for AuthRegistrationModule (auto-join on signup). No circular
// import: ClubsModule imports FeedModule, FeedModule imports neither.
@Module({
  imports: [AuthFoundationModule],
  controllers: [FeedController, SavedPostsController],
  providers: [FeedService, PrismaService],
  exports: [FeedService],
})
export class FeedModule {}
