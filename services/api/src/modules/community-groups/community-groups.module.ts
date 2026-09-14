import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { CommunityGroupsController } from './community-groups.controller';
import { CommunityGroupsService } from './community-groups.service';

// Build Plan Sprint 3 — Community Groups (Decision Log #281). Imports
// AuthFoundationModule so JwtAuthGuard + GuardianConsentGuard resolve via
// DI — same pattern FeedModule / ClubsModule / GrassrootsModule /
// BanterModule use.
//
// No FeedModule import: unlike BanterModule (which delegates room-scoped
// posting/feed reads to FeedService), Community Groups has NO post
// composer and NO scoped feed anywhere — the design's own Design Notes
// frame is explicit that a group page mirrors Club — Fan Page's
// no-composer state (Decision Log #281). Nothing in this module ever
// touches Post.
//
// Schema: two new models this sprint — CommunityGroup and
// CommunityGroupMember (migration
// <see the migration folder for the exact timestamp>), both shipped in
// this SAME PR (unlike BanterRoom/BanterRoomMember, whose membership
// table had to be added retroactively — see banter/README.md). See
// modules/community-groups/README.md for the endpoint list, the
// permission model, and every Decision Log candidate this raises.
@Module({
  imports: [AuthFoundationModule],
  controllers: [CommunityGroupsController],
  providers: [CommunityGroupsService, PrismaService],
})
export class CommunityGroupsModule {}
