import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RECEIVING_BODY_KEYS } from '../receiving-bodies.constants';
import {
  SUSPECTED_MEDIA_BODY_OTHER_MAX_LENGTH,
  SUSPECTED_MEDIA_NOTE_MAX_LENGTH,
  SUSPECTED_MEDIA_REFERENCE_MAX_LENGTH,
} from '../suspected-illegal-media.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// POST /admin/suspected-illegal-media/:id/filed. Records that a human FILED the report with a receiving body
// outside the system; this route calls nobody.
export class RecordFiledDto {
  @IsIn(RECEIVING_BODY_KEYS)
  bodyKey!: string;

  // Required when bodyKey is 'other' (checked in the service: a coded 400).
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUSPECTED_MEDIA_BODY_OTHER_MAX_LENGTH)
  bodyOther?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUSPECTED_MEDIA_REFERENCE_MAX_LENGTH)
  reference!: string;

  @IsOptional()
  @IsDateString()
  filedAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SUSPECTED_MEDIA_NOTE_MAX_LENGTH)
  note?: string;
}
