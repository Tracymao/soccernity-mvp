import { Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { MEDIA_MAX_FILE_SIZE_BYTES } from './media.constants';
import { MediaService, UploadedMediaFile } from './media.service';

// Build Plan Section 4.8 (Admin Service) — Media library.
//
// AdminJwtAuthGuard + AdminRolesGuard('editor', 'superadmin') on the
// WHOLE controller, including GET — media is an authoring tool (image/
// video attachments for Articles, per the deferred follow-up
// media/README.md names), the same role split as
// AdminArticlesController/AdminCategoriesController, not
// AdminModerationController/AdminUsersController's ('moderator',
// 'superadmin'). See those controllers' own header comments for the
// full "no view-vs-mutate split, only a per-JOB split" reasoning this
// mirrors.
@Controller('admin/media')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('editor', 'superadmin')
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async list(@Query() query: ListMediaQueryDto) {
    return this.mediaService.listMedia(query);
  }

  // multer's own `limits.fileSize` aborts the upload once the 50MB cap
  // is exceeded; NestJS's built-in FileInterceptor already converts that
  // into a clean 413 PayloadTooLargeException (see
  // node_modules/@nestjs/platform-express/multer/multer/multer.utils.js's
  // own transformException) — no custom exception filter needed here.
  //
  // Typed as UploadedMediaFile (media.service.ts's own plain-object
  // shape), not the ambient `Express.Multer.File` global — the real
  // runtime value from @UploadedFile() is structurally compatible
  // either way (a superset), and this codebase's shared eslint config
  // (eslint:recommended's `no-undef`) doesn't understand @types/multer's
  // global namespace merge, so referencing that global directly here
  // would need a project-wide eslint change to lint clean.
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_FILE_SIZE_BYTES } }))
  async upload(@UploadedFile() file: UploadedMediaFile | undefined, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.mediaService.uploadMedia(admin.sub, file);
  }
}
