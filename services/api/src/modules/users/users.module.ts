import { Module } from '@nestjs/common';
import { GuardianSecurityNoticeModule } from '../guardian-security-notice/guardian-security-notice.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { PostMediaModule } from '../post-media/post-media.module';
import { ProfileImageCheckService, ProfileImageCheckSweepService } from './profile-image-check.service';
import { ProfileImagePublishService } from './profile-image-publish.service';
import { ProfileImageViewService } from './profile-image-view.service';
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
  // PostMediaModule exports MediaProcessor: avatars and covers are re-encoded without metadata by the
  // same sanitizeImage post images use (B-205).
  imports: [PrismaModule, AuthFoundationModule, StorageModule, GuardianSecurityNoticeModule, PostMediaModule],
  controllers: [UsersController, UserAvatarController, UserCoverController],
  providers: [
    UsersService,
    UsernamePolicyService,
    UserAvatarService,
    UserCoverService,
    UserImageReviewService,
    ProfileImageViewService,
    // B-036 / B-037: the one place a pending picture is published (the check and the moderator queue).
    ProfileImagePublishService,
    // B-036: the automatic check for avatars and covers (runs only when Rekognition is configured).
    ProfileImageCheckService,
    ProfileImageCheckSweepService,
  ],
  // B-214 / B-037: the moderator media review queue imports UsersModule for these.
  exports: [UserImageReviewService, ProfileImagePublishService, ProfileImageViewService],
})
export class UsersModule {}
