import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LEADERBOARD_MAX_PAGE_SIZE } from '../leaderboard.constants';

// GET /leaderboard?period=&cursor=&limit= — Build Plan Section 4.9 /
// Section 5.5. Same cursor-based (keyset), default-20/max-50-page-size
// precedent as every other list DTO in this codebase (feed-query.dto.ts,
// list-clubs-query.dto.ts, etc.).
//
// `period` is deliberately validated at the SERVICE layer
// (iso-week.util.ts's parseIsoWeekPeriod), not here with a @Matches
// regex — the format regex and the "does this week actually exist for
// this ISO year" range check both live in exactly one place
// (iso-week.util.ts) rather than being duplicated across the DTO and
// the util. This mirrors ContestService.createCycle's own
// startsAt < endsAt cross-field check, which also lives in the service,
// not the DTO. When `period` is omitted, LeaderboardService defaults to
// the current UTC ISO week.
export class LeaderboardQueryDto {
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LEADERBOARD_MAX_PAGE_SIZE)
  limit?: number;
}
