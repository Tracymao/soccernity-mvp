import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { PostMediaModule } from '../post-media/post-media.module';
import { AdminMediaReviewController } from './admin-media-review.controller';
import { AdminMediaReviewService } from './admin-media-review.service';

// backend/w15-media-review-queue (B-037; Decision Log #419 item 4). The moderator side of the media review
// queue, a module of its own (like admin-users / admin-staff-vetting) so the user-facing post-media module
// carries no admin routes. The decision logic itself lives in PostMediaDecisionService (post-media), shared
// with nothing else today but kept beside the automatic check that writes the same notifications.
@Module({
  imports: [AdminAuthFoundationModule, AdminActionLogModule, StorageModule, PostMediaModule],
  controllers: [AdminMediaReviewController],
  providers: [AdminMediaReviewService, PrismaService],
})
export class AdminMediaReviewModule {}
