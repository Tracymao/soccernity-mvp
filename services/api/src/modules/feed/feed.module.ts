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
@Module({
  imports: [AuthFoundationModule],
  controllers: [FeedController, SavedPostsController],
  providers: [FeedService, PrismaService],
})
export class FeedModule {}
