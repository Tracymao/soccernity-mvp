import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DASHBOARD_LATEST_POSTS_MAX } from '../admin-dashboard.constants';

// GET /admin/dashboard/latest-posts?limit= . A value outside 1..5 is a 400 (rejected, not clamped), like the other
// admin list routes. DEFAULT, founder-veto-able.
export class LatestPostsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_LATEST_POSTS_MAX)
  limit?: number;
}
