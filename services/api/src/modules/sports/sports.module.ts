import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { SportsDataModule } from '../../sports-data/sports-data.module';
import { MatchKickoffService } from './match-kickoff.service';
import { SportsMatchesController } from './sports-matches.controller';
import { SportsStandingsController } from './sports-standings.controller';
import { SportsService } from './sports.service';

// Build Plan Section 4.6 — Sports Hub / Highlightly integration
// (sprint-4/sports-hub-highlightly-backend). Imports SportsDataModule (the SportsDataClient
// abstraction + HighlightlyClient + the daily budget guard + the refresh lock — src/sports-data/)
// rather than reaching for any of those directly. Every read route is genuinely public. The one
// exception is the kickoff-alert subscription (sprint-4/match-kickoff-alerts), which needs
// AuthFoundationModule for JwtAuthGuard. MatchKickoffService also registers the per-minute kickoff
// sweep (ScheduleModule.forRoot() is global, see app.module.ts).
@Module({
  imports: [ConfigModule, SportsDataModule, AuthFoundationModule],
  controllers: [SportsMatchesController, SportsStandingsController],
  providers: [SportsService, MatchKickoffService, PrismaService],
})
export class SportsModule {}
