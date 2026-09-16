import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { HighlightlyClient } from './highlightly-client.service';
import { SportsDataBudgetService } from './sports-data-budget.service';
import { SportsDataClient } from './sports-data-client';
import { SportsRefreshLock } from './sports-refresh-lock';

// Mirrors StorageModule's own shape (src/storage/storage.module.ts) — a thin top-level infra
// module, imported by whichever feature module needs it (today, only SportsModule).
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    { provide: SportsDataClient, useClass: HighlightlyClient },
    SportsDataBudgetService,
    SportsRefreshLock,
  ],
  exports: [SportsDataClient, SportsDataBudgetService, SportsRefreshLock],
})
export class SportsDataModule {}
