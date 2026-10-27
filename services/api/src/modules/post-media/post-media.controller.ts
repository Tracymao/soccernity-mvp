import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreateUploadDto } from './dto/create-upload.dto';
import { PostMediaService } from './post-media.service';

// backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419). User-facing upload routes. Every
// route is the uploader's OWN: another user's upload is a 404, never a 403, so an id reveals nothing.
//
// Guards: creating a link and confirming are `JwtAuthGuard` + `GuardianConsentGuard` -- a restricted-
// pending account cannot upload (#419 item 8). Reading and deleting your own upload need only
// `JwtAuthGuard`, so an account that is restricted LATER can still see and remove what it already holds.
// write-route-guards.spec.ts pins this.
@Controller('media/uploads')
@UseGuards(JwtAuthGuard)
export class PostMediaController {
  constructor(private readonly postMedia: PostMediaService) {}

  @Post()
  @UseGuards(GuardianConsentGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateUploadDto) {
    return this.postMedia.createUpload(user.sub, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @UseGuards(GuardianConsentGuard)
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
