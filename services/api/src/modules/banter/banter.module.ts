import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { FeedModule } from '../feed/feed.module';
import { BanterController } from './banter.controller';
import { BanterService } from './banter.service';

// Sprint 3 — Section 4.4 (Club & Banter Service), the /banter-rooms half.
// (The /clubs half shipped in Sprint 2 on ClubsModule.)
//
// Imports AuthFoundationModule so JwtAuthGuard + GuardianConsentGuard
// resolve via DI (same pattern FeedModule / ClubsModule / UsersModule /
// GrassrootsModule use). Imports FeedModule (which exports FeedService)
// so BanterService can delegate room-scoped posting to
// FeedService.createPost and the room feed to
// FeedService.getBanterRoomFeed — exactly the cross-module-DI pattern
// ClubsModule already uses for GET /clubs/:id/feed. FeedModule imports
// neither ClubsModule nor BanterModule, so there is no import cycle.
//
// Schema: one new model this sprint — BanterRoomMember (migration
// 20260909003336_add_banter_room_member), the membership join table
// Section 3 never gave BanterRoom, without which "My Bants" is
// impossible. See modules/banter/README.md for the endpoint list, the
// permission model, and every Decision Log candidate this raises.
@Module({
  imports: [AuthFoundationModule, FeedModule],
  controllers: [BanterController],
  providers: [BanterService, PrismaService],
})
export class BanterModule {}
