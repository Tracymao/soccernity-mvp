import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { GrassrootsFixturesController } from './grassroots-fixtures.controller';
import { GrassrootsTeamsController } from './grassroots-teams.controller';
import { GrassrootsService } from './grassroots.service';

// Sprint 5 — Section 4.5 (Grassroots Records Service). All 7 Section 4.5
// endpoints plus PATCH /fixtures/:id/status (Decision Log #254). Imports
// AuthFoundationModule so JwtAuthGuard and GuardianConsentGuard resolve
// via DI — same pattern FeedModule / ClubsModule / UsersModule use.
//
// Zero schema.prisma diff: the GrassrootsTeam / Fixture / Result models
// (Section 3) already carry everything this module needs. The permission
// model is enforced by joining through teamA/teamB.createdById; the status
// machine uses the existing Fixture.status string. No migration.
//
// See grassroots/README.md for the endpoint list, permission matrix, the
// status machine, and the "first write is final" result-race policy.
@Module({
  imports: [AuthFoundationModule],
  controllers: [GrassrootsTeamsController, GrassrootsFixturesController],
  providers: [GrassrootsService, PrismaService],
})
export class GrassrootsModule {}
