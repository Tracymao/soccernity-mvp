import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  SUSPECTED_MEDIA_NOT_FILED_REASON_MIN_LENGTH,
  SUSPECTED_MEDIA_REASON_MAX_LENGTH,
} from '../suspected-illegal-media.constants';

// POST /admin/suspected-illegal-media/:id/not-filed. A decision NOT to file, with the reason.
export class RecordNotFiledDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(SUSPECTED_MEDIA_NOT_FILED_REASON_MIN_LENGTH)
  @MaxLength(SUSPECTED_MEDIA_REASON_MAX_LENGTH)
  reason!: string;
}
