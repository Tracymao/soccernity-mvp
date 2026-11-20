import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediaUploadsEnabledGuard } from './media-uploads-enabled.guard';
import { MediaUploadsSwitchService } from './media-uploads-switch.service';

// backend/b306-media-uploads-switch (B-306). Imported by PostMediaModule and UsersModule, the two modules with
// user upload routes. A Nest module is a singleton, so the start-up warning is logged once.
@Module({
  imports: [ConfigModule],
  providers: [MediaUploadsSwitchService, MediaUploadsEnabledGuard],
  exports: [MediaUploadsSwitchService, MediaUploadsEnabledGuard],
})
export class MediaUploadsModule {}
