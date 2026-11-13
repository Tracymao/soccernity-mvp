import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isMediaUploadsEnabled, MEDIA_UPLOADS_DISABLED_CODE, MEDIA_UPLOADS_ENABLED_ENV } from './media-uploads.switch';

// backend/b306-media-uploads-switch (B-306; Decision Log #501). Reads the switch through ConfigService and logs
// ONE warning at start-up while uploads are off. It never stops the boot: off is the safe state, and refusing
// to start would take the whole API down for a setting that is off on purpose until the launch gate.
@Injectable()
export class MediaUploadsSwitchService implements OnModuleInit {
  private readonly logger = new Logger(MediaUploadsSwitchService.name);

  constructor(private readonly config: ConfigService) {}

  // Read on every call, never cached: a restart is the only thing that changes it in production, and a test
  // can flip it without rebuilding the app.
  isEnabled(): boolean {
    // The name is a literal on purpose: src/env-completeness.spec.ts finds variables by static pattern.
    return isMediaUploadsEnabled(this.config.get<string>('MEDIA_UPLOADS_ENABLED'), this.config.get<string>('NODE_ENV'));
  }

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.warn(
        `${MEDIA_UPLOADS_ENABLED_ENV} is off: user image and video uploads (post media, avatar, cover) answer 403 ` +
          `${MEDIA_UPLOADS_DISABLED_CODE}. In production it must be exactly "true" to turn them on, and the founder sets it ` +
          'only after counsel has answered B-206.',
      );
    }
  }
}
