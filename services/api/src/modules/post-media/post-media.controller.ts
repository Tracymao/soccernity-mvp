import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { SkipGlobalRateLimit } from '../../rate-limit/global-rate-limit.decorators';
import { CreateUploadDto } from './dto/create-upload.dto';
import { PostMediaService } from './post-media.service';

// backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419). User-facing upload routes. Every
// route is the uploader's OWN: another user's upload is a 404, never a 403, so an id reveals nothing.
//
// Guards: creating a link and confirming carry the SAME guards as POST /posts -- `JwtAuthGuard`,
// `GuardianConsentGuard`, `EmailVerifiedGuard` and `ProfileCompleteGuard` (Decision Log #419 item 8, widened
// by #430 item 4 / B-259). Reading and deleting your own upload need only
// `JwtAuthGuard`, so an account that is restricted LATER can still see and remove what it already holds.
// write-route-guards.spec.ts pins this.
@Controller('media/uploads')
@UseGuards(JwtAuthGuard)
export class PostMediaController {
  constructor(private readonly postMedia: PostMediaService) {}

  // Exempt from the global rate limit: it has its own per-user limit (POST_MEDIA_UPLOAD_RATE_LIMIT_*).
  // The sibling routes (confirm, delete, report) get the ordinary writes limit. The bytes themselves
  // go from the browser straight to the bucket and never reach the API.
  @Post()
  @SkipGlobalRateLimit()
  @UseGuards(GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateUploadDto) {
    return this.postMedia.createUpload(user.sub, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @UseGuards(GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async confirm(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.postMedia.confirmUpload(user.sub, id);
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.postMedia.getOwnUpload(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string): Promise<void> {
    await this.postMedia.deleteOwnUpload(user.sub, id);
  }
}
