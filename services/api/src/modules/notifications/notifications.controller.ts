import { Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { NotificationsQueryDto } from './dto/notifications-query.dto';
import { NotificationsService } from './notifications.service';

// Build Plan Section 4.7 (Content, Messaging, Notification & Search
// Services) — the Notifications read-side. Read-only: this PR does not
// touch any of the 7 trigger call sites that WRITE Notification rows
// (users.service.ts, feed.service.ts, messaging.service.ts,
// grassroots.service.ts, contest.service.ts — see Decision Log #87/#278).
//
// Every route here is JwtAuthGuard only, never GuardianConsentGuard —
// reading or acknowledging your own notifications is never a "posting"
// action under Section 5.7, and every route is implicitly self-scoped
// (no :id param on the caller's own identity — the same shape as
// GET /contest/current).
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // GET /notifications — the caller's inbox, keyset-paginated
  // newest-first. Declared before the parameterized PATCH route below,
  // matching this codebase's "static before :id" ordering convention
  // (though there is no actual overlap risk here — see notifications/README.md).
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AccessTokenPayload, @Query() query: NotificationsQueryDto) {
    return this.notifications.listNotifications(user.sub, query);
  }

  // GET /notifications/unread-count — a dedicated lightweight endpoint
  // for the Navbar badge (rendered on every page), so it never has to
  // fetch and resolve a full page of notifications just to paint a
  // count. See notifications.service.ts's own comment on why this is
  // separate from the unreadCount already included on GET /notifications.
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(@CurrentUser() user: AccessTokenPayload) {
    return { unreadCount: await this.notifications.getUnreadCount(user.sub) };
  }

  // PATCH /notifications/read-all — marks every unread notification read
  // for the caller. HttpCode(200): mutates existing rows, doesn't create
  // a resource (matching PATCH /conversations/:id/read's own precedent).
  @Patch('read-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async readAll(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  // PATCH /notifications/:id/read — marks one notification read.
  // Not-found-or-not-owned -> 404 (NotificationsService.markRead).
  // HttpCode(200), idempotent.
  @Patch(':id/read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async markRead(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markRead(user.sub, id);
  }
}
