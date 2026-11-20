import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { SUGGESTED_USERS_MAX_LIMIT } from '../suggested-users.constants';

// GET /users/suggested?limit= (Build Plan Section 4.7 — Search &
// Trending's "Suggested" follow panel, Decision Log #139). `limit` is
// the ONLY query param — no `cursor`, mirroring TrendingQueryDto's own
// shape and reasoning (search/dto/trending-query.dto.ts): this is a
// small, fixed-size suggestion panel, not a browsable/paginated catalog.
// No `q` either — this endpoint doesn't search, it suggests.
export class SuggestedUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SUGGESTED_USERS_MAX_LIMIT)
  limit?: number;
}
