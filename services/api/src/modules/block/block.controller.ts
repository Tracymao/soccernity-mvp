import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
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
// Guards follow the rule B-026/B-118 pinned in write-route-guards.spec.ts, with no
// special case: GuardianConsentGuard on every write (the undo form included),
// EmailVerifiedGuard on the CREATING form only. Whether a safety action like
// Block should be exempt from either is NOT decided; the literal rule is applied
// and the question is listed OPEN in docs/backend-w5-report.md.
@Controller('users')
@UseGuards(JwtAuthGuard)
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  @Post(':id/block')
  @HttpCode(200)
  @UseGuards(GuardianConsentGuard, EmailVerifiedGuard)
  async block(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: BlockUserDto) {
    return this.blockService.blockUser(user.sub, id, dto);
  }

  @Delete(':id/block')
  @UseGuards(GuardianConsentGuard)
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
