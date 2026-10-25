import { Module } from '@nestjs/common';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { UserAvatarController } from './user-avatar.controller';
import { UserAvatarService } from './user-avatar.service';
import { UserCoverController } from './user-cover.controller';
import { UserCoverService } from './user-cover.service';
import { UserImageReviewService } from './user-image-review.service';
import { UsersController } from './users.controller';
import { UsernamePolicyService } from './username-policy.service';
import { UsersService } from './users.service';

// Sprint 1 / PR B6 — Section 4.2 (User Service), self-profile scope only for now.
// See users.controller.ts for the exact routes and the spec-vs-brief
// discrepancy this PR flags.
//
// Imports AuthFoundationModule so JwtAuthGuard (and TokenService, which
// the guard depends on) resolve via DI — this is the pattern every future
// module protecting a route should follow, per
// auth-foundation.module.ts's own doc comment.
//
// backend/w5-profile-block (B-035): StorageModule + UserAvatarController/Service
// for the profile picture (POST/DELETE /users/:id/avatar), on the same
// StorageService the admin media upload uses.
@Module({
  imports: [AuthFoundationModule, StorageModule],
  controllers: [UsersController, UserAvatarController, UserCoverController],
  providers: [UsersService, UsernamePolicyService, UserAvatarService, UserCoverService, UserImageReviewService, PrismaService],
  // B-214: the image review queue (B-037) will import UsersModule and call this.
  exports: [UserImageReviewService],
})
export class UsersModule {}
