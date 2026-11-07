import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { GuardianSecurityNoticeModule } from '../guardian-security-notice/guardian-security-notice.module';
import { AdminUsernameReviewsController } from './admin-username-reviews.controller';
import { AdminUsernameReviewsService } from './admin-username-reviews.service';
import { UsernameReviewController } from './username-review.controller';
import { UsernameReviewService } from './username-review.service';

// backend/b139-username-review (B-139 part (c); Decision Log #467): the review route for a revoked username. The
// user's two routes (JwtAuthGuard, from AuthFoundationModule), the admin's two routes (AdminAuthFoundationModule),
// the shared auth rate limiter (AuthRateLimitModule) and the guardian kind-of-action notice
// (GuardianSecurityNoticeModule). The revoke itself stays in AdminUsersModule; it only imports this module's
// window helper, so there is no module cycle.
@Module({
  imports: [PrismaModule, AdminAuthFoundationModule, AuthFoundationModule, AuthRateLimitModule, GuardianSecurityNoticeModule],
  controllers: [UsernameReviewController, AdminUsernameReviewsController],
  providers: [UsernameReviewService, AdminUsernameReviewsService],
})
export class UsernameReviewModule {}
