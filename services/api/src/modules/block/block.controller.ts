import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import { BlockService } from './block.service';
import { BlockUserDto } from './dto/block-user.dto';

// backend/w5-profile-block (B-039; Decision Log #396). Mounted under /users so
// the URLs read like the follow routes next to them: POST/DELETE
// /users/:id/block act on the TARGET :id, GET /users/:id/blocks is the caller's
// OWN list (:id must be the caller, the same self-scoped convention as GET
// /users/:id and GET /users/:id/saved-posts).
//
// Guards (B-197, Decision Log #411 item 5): AUTHENTICATION ONLY. Block, unblock and
// the blocked-users list are exempt from GuardianConsentGuard and EmailVerifiedGuard
// (a safety action: a restricted-pending or unverified account must still be able to
// block someone who is bothering them). This amends how #370's uniform write block
// applied to Block, like report/appeal and change-guardian-email, which are already
// open. write-route-guards.spec.ts pins it (OPEN_ROUTES) and that JwtAuthGuard stays.
@Controller('users')
@UseGuards(JwtAuthGuard)
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  @Post(':id/block')
  @HttpCode(200)
  async block(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: BlockUserDto) {
    return this.blockService.blockUser(user.sub, id, dto);
  }

  @Delete(':id/block')
  async unblock(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.blockService.unblockUser(user.sub, id);
  }

  @Get(':id/blocks')
  async list(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload, @Query() query: FeedQueryDto) {
    if (id !== user.sub) {
      throw new ForbiddenException('You may only view your own blocked users');
    }
    return this.blockService.listBlocked(user.sub, query);
  }
}
