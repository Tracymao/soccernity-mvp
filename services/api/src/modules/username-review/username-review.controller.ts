import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreateUsernameReviewDto } from './dto/create-username-review.dto';
import { UsernameReviewService } from './username-review.service';

// backend/b139-username-review (B-139 part (c); Decision Log #467). The signed-in user's side of the review route.
//
// GUARDS: JwtAuthGuard ONLY, and that is the point. The person asking has NO username, so ProfileCompleteGuard
// would refuse them (it exists to keep a username-less account from posting). A username-less account that is
// restricted-pending or has an unverified email must still be able to ask, exactly as it can still report and
// appeal (#370). So the POST is listed in write-route-guards.spec.ts's OPEN_ROUTES with that reason, and the
// "no consent / email / profile guard" fact is pinned there.
//
// The path is 'users/me/username-review' as the brief specified. It cannot be shadowed by 'users/:id/...': no
// route under UsersController ends in 'username-review'. (Decision Log #15 rejected a bare '/users/me' alias;
// this is a distinct sub-resource, not that alias.)
//
// @AuthRateLimit(): the shared 'auth' limiter (5 per 60 s per IP, env-driven AUTH_RATE_LIMIT_*). A person can make
// ONE request per revocation (a second is a 409), so the limit only blunts hammering; it is deliberately the
// shared default and not a tighter one, because a school or club shares one IP (Decision Log #429).
// @SkipGlobalWriteLimit() is required by global-rate-limit.coverage.spec.ts for every handler that carries it.
@Controller('users/me/username-review')
@UseGuards(JwtAuthGuard)
export class UsernameReviewController {
  constructor(private readonly reviews: UsernameReviewService) {}

  @Get()
  async status(@CurrentUser() user: AccessTokenPayload) {
    return this.reviews.getStatus(user.sub);
  }

  @Post()
  @HttpCode(201)
  @AuthRateLimit()
  @SkipGlobalWriteLimit()
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateUsernameReviewDto) {
    return this.reviews.createRequest(user.sub, dto.message);
  }
}
