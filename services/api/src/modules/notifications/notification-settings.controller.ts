import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NotificationSettingsService } from './notification-settings.service';

// backend/b062-notification-preferences (B-062; Decision Log #472 adopted default (c)): the Settings >
// Notification Preferences leaves (Filters, Muted accounts) read and write their four options here. JwtAuthGuard
// only: the options only REDUCE what the person is notified of about other people, so a restricted-pending or
// unverified account may still change them (pinned in write-route-guards.spec.ts). Self-scoped, no :id.
@Controller('notification-settings')
@UseGuards(JwtAuthGuard)
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  async get(@CurrentUser() user: AccessTokenPayload) {
    return this.settings.get(user.sub);
  }

  @Patch()
  async update(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateNotificationSettingsDto) {
    return this.settings.update(user.sub, dto);
  }
}
