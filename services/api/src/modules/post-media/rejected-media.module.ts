import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { PostMediaConfig } from './post-media.config';
import { RejectedMediaSweepService } from './rejected-media-sweep.service';

// backend/b283-delete-rejected-media (B-283; Decision Log #464). Registers the daily deferred-deletion retry and
// stray-object sweep (RejectedMediaSweepService) and exports it so the account purge can clean up a purged user's
// objects. Its own small module (not PostMediaModule) so AccountDeletionModule can import it without pulling in
// the upload controllers and the Rekognition/ffmpeg providers. PostMediaConfig is a plain ConfigService reader.
@Module({
  imports: [ConfigModule, StorageModule],
  providers: [PrismaService, PostMediaConfig, RejectedMediaSweepService],
  exports: [RejectedMediaSweepService],
})
export class RejectedMediaModule {}
