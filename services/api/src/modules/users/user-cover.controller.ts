import { Controller, Delete, ForbiddenException, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { PROFILE_IMAGE_MAX_FILE_SIZE_BYTES, UploadedProfileImage } from './profile-image.util';
import { UserCoverService } from './user-cover.service';

// B-196 (Decision Log #411 item 4). The cover photo of the CALLER, mounted under
// /users next to the avatar routes with the SAME self-only rule and the SAME
// guards (write-route-guards.spec.ts): GuardianConsentGuard on both forms,
// EmailVerifiedGuard on the creating form only, NOT ProfileCompleteGuard (the
// cover is optional at Create Profile, like the picture, #394 A2). The service is
// called with the token's `sub`, never the path param. multer's own
// `limits.fileSize` makes an oversize upload a clean 413.
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserCoverController {
  constructor(private readonly covers: UserCoverService) {}

  @Post(':id/cover')
  @UseGuards(GuardianConsentGuard, EmailVerifiedGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PROFILE_IMAGE_MAX_FILE_SIZE_BYTES } }))
  async upload(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file: UploadedProfileImage | undefined,
  ) {
    this.assertSelf(id, user);
    return this.covers.uploadCover(user.sub, file);
  }

  @Delete(':id/cover')
  @UseGuards(GuardianConsentGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    this.assertSelf(id, user);
    return this.covers.deleteCover(user.sub);
  }

  private assertSelf(id: string, user: AccessTokenPayload): void {
    if (id !== user.sub) {
      throw new ForbiddenException('You may only change your own cover photo');
    }
  }
}
