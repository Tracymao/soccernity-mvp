import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardHistoryRollupService } from './leaderboard-history-rollup.service';
import { LeaderboardRollupService } from './leaderboard-rollup.service';
import { LeaderboardService } from './leaderboard.service';

// sprint-6/leaderboard-read-rollup — Build Plan Section 4.9. GET
// /leaderboard (LeaderboardService, LeaderboardController) plus the
// @Cron()-driven rollup that materializes LeaderboardEntry from
// PointsLedgerEntry (LeaderboardRollupService). ScheduleModule.forRoot()
// itself is registered once, globally, in app.module.ts — same pattern
// AccountDeletionModule already established for its own @Cron() job; it
// does not need to be imported here.
//
// Imports AuthFoundationModule so JwtAuthGuard resolves via DI (same
// pattern every other feature module uses). No GuardianConsentGuard
// here — reading the board is not a "posting"-class action.
//
// LeaderboardRollupService is exported so a future manual-backfill
// script / admin endpoint could call rollupPeriod() directly without
// waiting for the cron tick — not consumed by any other module today.
@Module({
  imports: [PrismaModule, AuthFoundationModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardRollupService, LeaderboardHistoryRollupService],
  exports: [LeaderboardRollupService, LeaderboardHistoryRollupService],
})
export class LeaderboardModule {}
