import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { FeedModule } from '../feed/feed.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

// Sprint 2 — Section 4.4 (Club & Banter Service), club subset only:
// GET /clubs, GET /clubs/:id, POST /clubs/:id/join. Imports
// AuthFoundationModule so JwtAuthGuard resolves via DI, same pattern
// FeedModule/UsersModule already established.
// ClubsService is exported (sprint-2/auto-join-on-signup) so
// AuthRegistrationModule can inject it via DI to implement auto-join on
// signup (RegisterDto.clubId) — see registration.module.ts's imports and
// registration.service.ts's use of assertClubExists/joinClub.
// FeedModule is imported (sprint-2/club-fan-page-backend) so
// ClubsController can inject FeedService for GET /clubs/:id/feed — the
// club-scoped feed reuses FeedService.getClubFeed rather than
// reimplementing POST_SELECT / attachViewerState / the feed cursor here.
// FeedModule imports neither ClubsModule nor AuthRegistrationModule, so
// there is no import cycle (ClubsModule -> FeedModule only).
@Module({
  imports: [AuthFoundationModule, FeedModule],
  controllers: [ClubsController],
  providers: [ClubsService, PrismaService],
  exports: [ClubsService],
})
export class ClubsModule {}
