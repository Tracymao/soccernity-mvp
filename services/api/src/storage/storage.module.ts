import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

// Mirrors RedisModule's own shape (src/redis/redis.module.ts) — a thin
// top-level infra module, imported by whichever feature module needs it
// (today, only MediaModule). `useClass` (not a factory) is enough here
// since S3StorageService's own constructor already does all the
// ConfigService-driven setup itself.
@Module({
  imports: [ConfigModule],
  providers: [{ provide: StorageService, useClass: S3StorageService }],
  exports: [StorageService],
})
export class StorageModule {}
