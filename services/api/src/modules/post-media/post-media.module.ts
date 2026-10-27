import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { FfmpegMediaProcessor } from './ffmpeg-media-processor';
import { MediaModerationClient, RekognitionMediaModerationClient } from './media-moderation-client';
import { MediaProcessor } from './media-processor';
import { MediaCheckService, PostMediaSweepService } from './media-check.service';
import { PostMediaConfig } from './post-media.config';
import { PostMediaController } from './post-media.controller';
import { PostMediaService } from './post-media.service';

// backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419). User post and contest-entry media:
// direct-to-storage upload, server-side verification and metadata stripping, the automatic Rekognition
// check, and the background sweeps. See README.md. The real file processor (sharp + ffmpeg) and the real
// Rekognition client are bound here; the e2e specs override MediaProcessor, MediaModerationClient and
// StorageService with in-memory doubles.
//
// PostMediaConfig is exported so FeedModule can read the per-post file limit. Attaching media to a post
// is NOT a provider here: it is the pure helpers in post-media-attach.util.ts, called by FeedService (the
// single post-creation path), so FeedModule does not need to import this module's services.
@Module({
  imports: [ConfigModule, StorageModule, AuthFoundationModule],
  controllers: [PostMediaController],
  providers: [
    PrismaService,
    PostMediaConfig,
    { provide: MediaProcessor, useClass: FfmpegMediaProcessor },
    { provide: MediaModerationClient, useClass: RekognitionMediaModerationClient },
    PostMediaService,
    MediaCheckService,
    PostMediaSweepService,
  ],
  exports: [PostMediaConfig],
})
export class PostMediaModule {}
