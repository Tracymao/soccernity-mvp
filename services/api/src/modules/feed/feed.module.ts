import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

// Sprint 2 — Section 4.3 (Feed Service), POST /posts + GET /posts/feed
// slice only. Imports AuthFoundationModule so both JwtAuthGuard and
// GuardianConsentGuard resolve via DI, same pattern UsersModule
// established in Sprint 1 — see users.module.ts.
@Module({
  imports: [AuthFoundationModule],
  controllers: [FeedController],
  providers: [FeedService, PrismaService],
})
export class FeedModule {}
