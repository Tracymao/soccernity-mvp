import { Module } from '@nestjs/common';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { PushSettingsController } from './push-settings.controller';
import { PushSweepService } from './push-sweep.service';
import { PushConfig } from './push.config';
import { PushService } from './push.service';
import { WebPushLibSender, WebPushSender } from './web-push-sender';

// backend/b285-web-push (B-285; Decision Log #472 adopted default (e)): opt-in web push, default off. Settings
// routes under /notification-settings/push and the per-minute sweep that sends the one generic push. Needs
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT; with them unset the feature reports itself unavailable and
// nothing else changes. See README.md.
@Module({
  imports: [AuthFoundationModule],
  controllers: [PushSettingsController],
  providers: [
    PushService,
    PushSweepService,
    PushConfig,
    { provide: WebPushSender, useClass: WebPushLibSender },
  ],
})
export class PushModule {}
