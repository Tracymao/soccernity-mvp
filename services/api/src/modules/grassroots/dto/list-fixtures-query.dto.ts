import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /teams/:id/fixtures (Build Plan Section 4.5). Section 5.5: paginated.
// Keyset by (scheduledAt desc, id desc) — a team's fixture list is closer
// to an activity feed than a browsable catalog, so newest-scheduled-first
// (like GET /posts/feed), not alphabetical. Same { cursor, limit } shape /
// default 20 / max 50 as every other list DTO in this codebase.
export class ListFixturesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
