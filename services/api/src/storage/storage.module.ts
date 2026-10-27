import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DirectUploadStorageService } from './direct-upload-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

// Mirrors RedisModule's own shape (src/redis/redis.module.ts) — a thin
// top-level infra module, imported by whichever feature module needs it
// (today, only MediaModule). `useClass` (not a factory) is enough here
// since S3StorageService's own constructor already does all the
// ConfigService-driven setup itself.
@Module({
  imports: [ConfigModule],
  // One S3StorageService instance behind both tokens: StorageService (upload/delete, what most callers
  // use) and DirectUploadStorageService (the user-media pipeline's upload links and read-back).
  providers: [
    S3StorageService,
    { provide: StorageService, useExisting: S3StorageService },
    { provide: DirectUploadStorageService, useExisting: S3StorageService },
  ],
  exports: [StorageService, DirectUploadStorageService],
})
export class StorageModule {}
