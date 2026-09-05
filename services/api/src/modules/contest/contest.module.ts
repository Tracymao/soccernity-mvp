import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { ContestAdminController } from './contest-admin.controller';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

// sprint-2/contest-data-model-backend — Decision Log #218 (schema) / #219
// (scoring weights). The Contest weekly-cycle mechanic (Decision Log
// #61/#70/#71) plus the "is there an active contest right now" query the
// Create Post mode-tab needs (Decision Log #188). See README.md.
//
// Imports BOTH auth foundations: AuthFoundationModule for JwtAuthGuard /
// GuardianConsentGuard (the user-facing GET /contest/* + POST
// /contest/entries), and AdminAuthFoundationModule for AdminJwtAuthGuard
// (the admin state-machine transitions). Same "a module needs guards from
// more than one auth domain" shape nothing else has hit yet — both
// foundation modules are static and export only their guards + token
// services, so this is additive wiring, not cross-contamination.
//
// Points wiring is a plain function import (../points/points.util), no
// module — see points/README.md for why (the notification-wiring
// precedent).
@Module({
  imports: [AuthFoundationModule, AdminAuthFoundationModule],
  controllers: [ContestController, ContestAdminController],
  providers: [ContestService, PrismaService],
})
export class ContestModule {}
