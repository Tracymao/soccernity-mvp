import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { NotificationPolicyService } from './notification-policy.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Sprint 3 — Build Plan Section 4.7 (Content, Messaging, Notification &
// Search Services), the Notifications READ-SIDE only: GET /notifications,
// GET /notifications/unread-count, PATCH /notifications/:id/read, PATCH
// /notifications/read-all. The 7 trigger call sites that WRITE
// Notification rows (Decision Log #87/#278) are untouched by this module
// and live on their own respective services — see notifications/README.md
// for the full design (the payloadRefId denormalization decision, the
// pagination convention, and the like/comment actor gap).
//
// Imports AuthFoundationModule so JwtAuthGuard resolves via DI (same
// pattern every other feature module uses). No GuardianConsentGuard here
// — nothing in this module is a "posting" action.
@Module({
  imports: [PrismaModule, AuthFoundationModule],
  controllers: [NotificationsController, NotificationSettingsController],
  providers: [NotificationsService, NotificationSettingsService, NotificationPolicyService],
  exports: [NotificationPolicyService],
})
export class NotificationsModule {}
