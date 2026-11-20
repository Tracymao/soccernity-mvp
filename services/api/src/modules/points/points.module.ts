import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PointsConfig } from './points-config.service';

// backend/w12-points (B-093). Holds only the injectable configuration (the two daily caps). The ledger
// writes themselves stay plain functions that take a transaction client (points.util.ts,
// engagement-points.util.ts) for the reason points.util.ts documents: every award lands in the same
// transaction as the thing it pays for, and FeedModule must not import a heavyweight module for it.
@Module({
  imports: [ConfigModule],
  providers: [PointsConfig],
  exports: [PointsConfig],
})
export class PointsModule {}
