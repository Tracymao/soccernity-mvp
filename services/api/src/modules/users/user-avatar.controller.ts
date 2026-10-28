import { Controller, Delete, ForbiddenException, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { AVATAR_MAX_FILE_SIZE_BYTES, UploadedAvatarFile, UserAvatarService } from './user-avatar.service';
import { UploadRateLimit } from '../../rate-limit/global-rate-limit.decorators';

// backend/w5-profile-block (B-035). The profile picture of the CALLER. Mounted
// under /users next to PATCH /users/:id, with the same self-only rule: :id must be
// the caller's own id, and the service is called with the token's `sub`, never
// the path param.
//
// Guards follow the pinned write-route rule (write-route-guards.spec.ts): a
// profile write, so GuardianConsentGuard on both forms (a restricted-pending
// minor has no profile to edit, #370) and EmailVerifiedGuard on the creating
// form only. NOT ProfileCompleteGuard: the avatar is chosen AT Create Profile,
// before the username that completes the profile exists.
//
// Guards run before the FileInterceptor, so a rejected caller never has a body
// parsed. multer's own `limits.fileSize` aborts an oversize upload and Nest turns
// it into a clean 413 (the same mechanism as POST /admin/media/upload).
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserAvatarController {
  constructor(private readonly avatars: UserAvatarService) {}

  @Post(':id/avatar')
  @UploadRateLimit()
  @UseGuards(GuardianConsentGuard, EmailVerifiedGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_FILE_SIZE_BYTES } }))
  async upload(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file: UploadedAvatarFile | undefined,
  ) {
    this.assertSelf(id, user);
    return this.avatars.uploadAvatar(user.sub, file);
  }

  @Delete(':id/avatar')
  @UseGuards(GuardianConsentGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    this.assertSelf(id, user);
    return this.avatars.deleteAvatar(user.sub);
  }

  private assertSelf(id: string, user: AccessTokenPayload): void {
    if (id !== user.sub) {
      throw new ForbiddenException('You may only change your own profile picture');
    }
  }
}
