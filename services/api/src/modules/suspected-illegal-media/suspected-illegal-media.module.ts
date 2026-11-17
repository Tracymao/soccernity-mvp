import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminMediaReviewModule } from '../admin-media-review/admin-media-review.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { PostMediaModule } from '../post-media/post-media.module';
import { UsersModule } from '../users/users.module';
import { SuspectedIllegalMediaController } from './suspected-illegal-media.controller';
import { SuspectedIllegalMediaService } from './suspected-illegal-media.service';

// backend/suspected-illegal-imagery-path (B-206). See suspected-illegal-media.service.ts and README.md.
@Module({
  imports: [PrismaModule, AdminAuthFoundationModule, PostMediaModule, AdminMediaReviewModule, UsersModule],
  controllers: [SuspectedIllegalMediaController],
  providers: [SuspectedIllegalMediaService],
})
export class SuspectedIllegalMediaModule {}
