import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreatePushSubscriptionDto, DeletePushSubscriptionDto } from './dto/push-subscription.dto';
import { PushService } from './push.service';

// backend/b285-web-push (B-285; Decision Log #472 adopted default (e)). JwtAuthGuard only: turning on a notification
// channel for the person's OWN browser produces no content and tells no one anything (pinned in
// write-route-guards.spec.ts). Self-scoped by the token subject; there is no :id. The browser-permission and
// service-worker code is a web PR, not here.
@Controller('notification-settings/push')
@UseGuards(JwtAuthGuard)
export class PushSettingsController {
  constructor(private readonly push: PushService) {}

  @Get()
  status() {
    return this.push.getStatus();
  }

  @Post('subscription')
  @HttpCode(200)
  async subscribe(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreatePushSubscriptionDto) {
    return this.push.subscribe(user.sub, dto);
  }

  @Delete('subscription')
  @HttpCode(204)
  async unsubscribe(@CurrentUser() user: AccessTokenPayload, @Body() dto: DeletePushSubscriptionDto): Promise<void> {
    await this.push.unsubscribe(user.sub, dto.endpoint);
  }
}
