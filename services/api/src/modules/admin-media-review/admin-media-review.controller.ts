import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminMediaReviewService } from './admin-media-review.service';
import { ListMediaReviewQueryDto } from './dto/list-media-review-query.dto';
import { MediaReviewStatsQueryDto } from './dto/media-review-stats-query.dto';
import { RejectMediaDto } from './dto/reject-media.dto';

// backend/w15-media-review-queue (B-037; Decision Log #419 item 4). The moderator media review queue.
//
// AdminJwtAuthGuard + AdminRolesGuard('moderator', 'superadmin') on the whole controller, GET included --
// the same class-level shape as the other moderation surfaces (an editor does not review user content).
// NOT YET DECIDED (Decision Log #419 "found, not decided"): whether reviewers of MINORS' media must also be
// child-safety vetted. No such gate exists here; see docs/backend-w15-review-queue-report.md.
//
// `stats` is declared before `:id` so it is not captured as an id.
@Controller('admin/media-review')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class AdminMediaReviewController {
  constructor(private readonly review: AdminMediaReviewService) {}

  @Get()
  async list(@Query() query: ListMediaReviewQueryDto) {
    return this.review.list(query);
  }

  @Get('stats')
  async stats(@Query() query: MediaReviewStatsQueryDto) {
    return this.review.stats(query.days);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.review.get(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.review.approve(id, admin.sub);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: RejectMediaDto) {
    return this.review.reject(id, admin.sub, dto.reason);
  }
}
