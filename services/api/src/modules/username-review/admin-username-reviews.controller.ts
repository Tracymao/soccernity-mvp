import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminUsernameReviewsService } from './admin-username-reviews.service';
import { DecideUsernameReviewDto } from './dto/decide-username-review.dto';
import { ListUsernameReviewsQueryDto } from './dto/list-username-reviews-query.dto';

// backend/b139-username-review (B-139 part (c); Decision Log #467). The "Username reviews" list and the decide
// action. AdminJwtAuthGuard + AdminRolesGuard('moderator', 'superadmin') on the WHOLE controller, GET included: an
// editor gets a 403 on both (the same split as admin/users, whose username-revoke this is the review of).
//
// The two rules that depend on WHO is asking -- the revoking admin is excluded, and a minor's request is for a
// child-safety-vetted admin only -- are applied inside the service from the verified token's subject.
@Controller('admin/username-reviews')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class AdminUsernameReviewsController {
  constructor(private readonly reviews: AdminUsernameReviewsService) {}

  @Get()
  async list(@Query() query: ListUsernameReviewsQueryDto, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.reviews.list(query, admin);
  }

  @Post(':id/decide')
  @HttpCode(200)
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideUsernameReviewDto,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
  ) {
    return this.reviews.decide(id, dto, admin);
  }
}
