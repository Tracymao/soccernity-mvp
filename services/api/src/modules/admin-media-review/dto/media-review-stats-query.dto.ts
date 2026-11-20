import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MEDIA_REVIEW_STATS_DEFAULT_DAYS = 7;
export const MEDIA_REVIEW_STATS_MAX_DAYS = 90;

// GET /admin/media-review/stats?days=N -- the window ends now and starts N days earlier.
export class MediaReviewStatsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MEDIA_REVIEW_STATS_MAX_DAYS)
  days?: number;
}
