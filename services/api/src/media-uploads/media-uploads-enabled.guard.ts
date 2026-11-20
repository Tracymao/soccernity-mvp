import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { MediaUploadsSwitchService } from './media-uploads-switch.service';
import { MEDIA_UPLOADS_DISABLED_CODE } from './media-uploads.switch';

// backend/b306-media-uploads-switch (B-306; Decision Log #501). Applied with @UseGuards to the four user upload
// routes (POST /media/uploads, its confirm step, POST /users/:id/avatar, POST /users/:id/cover). Guards run
// before interceptors and before the handler, so with the switch off nothing is parsed (no multipart body),
// no storage call is made and nothing is written. Response: 403 { statusCode, error, code, message }.
// The message is a plain developer-facing sentence; the product decision is that NO new customer-facing wording
// is written (the client branches on `code`, if it ever does).
@Injectable()
export class MediaUploadsEnabledGuard implements CanActivate {
  constructor(private readonly uploads: MediaUploadsSwitchService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.uploads.isEnabled()) return true;
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: MEDIA_UPLOADS_DISABLED_CODE,
      message: 'Uploads are not available right now.',
    });
  }
}
