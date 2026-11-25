import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { SPORTS_MAX_PAGE_SIZE } from '../sports.constants';

// GET /sports/results/recent?limit= - public, no cursor (one bounded list of the latest finished day).
export class ListRecentResultsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPORTS_MAX_PAGE_SIZE)
  limit?: number;
}
