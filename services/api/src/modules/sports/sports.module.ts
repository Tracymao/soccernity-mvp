import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsDataModule } from '../../sports-data/sports-data.module';
import { SportsMatchesController } from './sports-matches.controller';
import { SportsStandingsController } from './sports-standings.controller';
import { SportsService } from './sports.service';

// Build Plan Section 4.6 — Sports Hub / Highlightly integration
// (sprint-4/sports-hub-highlightly-backend). Imports SportsDataModule (the SportsDataClient
// abstraction + HighlightlyClient + the daily budget guard + the refresh lock — src/sports-data/)
// rather than reaching for any of those directly; every route in this module is genuinely public
// (no JwtAuthGuard, no AdminJwtAuthGuard), so there's no auth-foundation module to pull in, matching
// BlogModule's own shape.
@Module({
  imports: [ConfigModule, SportsDataModule],
  controllers: [SportsMatchesController, SportsStandingsController],
  providers: [SportsService, PrismaService],
})
export class SportsModule {}
