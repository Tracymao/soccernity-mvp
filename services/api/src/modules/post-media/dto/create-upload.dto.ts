import { IsIn, IsInt, Max, Min } from 'class-validator';
import { HEIC_CONTENT_TYPES, POST_MEDIA_CONTENT_TYPES } from '../media-signature.util';

// POST /media/uploads (backend/w14-post-media-pipeline; Decision Log #419). The client DECLARES the type
// and exact size of the file it is about to send; the one-time link is bound to both, and the server
// re-checks both against the bytes that actually arrive. The per-kind limits are in configuration, not
// here (a static decorator cannot read configuration), so this DTO only bounds the shape; the service
// enforces the real limit.
//
// backend/media-privacy-vetting-followups (B-259): the HEIC/HEIF types are let THROUGH this validator on
// purpose (they are not accepted) so the service can refuse them with their own plain, coded message instead
// of the generic "must be one of the following values" validation error. Every other unsupported type is
// still a validation 400.
export class CreateUploadDto {
  @IsIn([...POST_MEDIA_CONTENT_TYPES, ...HEIC_CONTENT_TYPES])
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(2 * 1024 * 1024 * 1024)
  size!: number;
}
