import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SUSPECTED_MEDIA_MAX_PAGE_SIZE, SUSPECTED_MEDIA_STATUSES } from '../suspected-illegal-media.constants';

export class ListSuspectedIllegalQueryDto {
  @IsOptional()
  @IsIn(SUSPECTED_MEDIA_STATUSES)
  status?: (typeof SUSPECTED_MEDIA_STATUSES)[number];

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SUSPECTED_MEDIA_MAX_PAGE_SIZE)
  limit?: number;
}
