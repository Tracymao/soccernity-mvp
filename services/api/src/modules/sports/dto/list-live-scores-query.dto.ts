import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SPORTS_MAX_PAGE_SIZE } from '../sports.constants';

// GET /sports/live-scores?league=&cursor=&limit= — NO AUTH REQUIRED (Section 4.6). Reads
// exclusively from MatchData rows already cached with status='live' — see sports.service.ts's own
// header comment on why this never triggers its own separate Highlightly call (today's own
// GET /sports/fixtures?date=<today> refresh already covers it).
export class ListLiveScoresQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  league?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPORTS_MAX_PAGE_SIZE)
  limit?: number;
}
