import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SUSPECTED_MEDIA_REASON_MAX_LENGTH } from '../suspected-illegal-media.constants';

// POST /admin/media-review/:id/suspected-illegal. The reason is internal (never sent to the uploader or a guardian)
// and is kept on the record, not in the audit log.
export class SetAsideSuspectedIllegalDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(SUSPECTED_MEDIA_REASON_MAX_LENGTH)
  reason!: string;

  @IsOptional()
  @IsUUID()
  reportId?: string;
}
