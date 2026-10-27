import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { ViewHeartbeatDto } from './dto/view-heartbeat.dto';
import { ViewHeartbeatResponse, ViewQualificationService } from './view-qualification.service';

// backend/w12-points (B-093). The heartbeat endpoint for view qualification.
//
// JwtAuthGuard ONLY, deliberately - not GuardianConsentGuard / EmailVerifiedGuard. Looking at a post is
// not a social write; a restricted or unverified account may keep reading. The consequence is enforced
// where it belongs, in the points engine: such an account simply earns nothing (and counts for nothing
// in a contest tally). The response never says whether points were awarded.
//
// It does not replace POST /posts/:id/view (the anonymous display-count tally); that endpoint is
// unchanged. A "view" shown as a number and a qualified view that earns a point are different things
// (spec 9c: "A view counted for display is distinct from a view POINT").
@Controller('posts')
export class ViewQualificationController {
  constructor(private readonly views: ViewQualificationService) {}

  @Post(':id/view-heartbeat')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async heartbeat(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ViewHeartbeatDto,
  ): Promise<ViewHeartbeatResponse> {
    return this.views.heartbeat(user.sub, id, dto);
  }
}
