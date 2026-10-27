import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { POST_MEDIA_REJECTION_REASON_MAX_LENGTH } from '../../post-media/post-media-review.constants';

// POST /admin/media-review/:id/reject. The reason is REQUIRED (trimmed, at most 300 characters): the
// uploader reads it verbatim, so it is written for them. A blank or whitespace-only reason is a 400.
export class RejectMediaDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(POST_MEDIA_REJECTION_REASON_MAX_LENGTH)
  reason!: string;
}
