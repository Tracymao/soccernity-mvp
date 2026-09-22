import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { TRENDING_MAX_LIMIT } from '../trending.constants';

// GET /trending?limit= (Build Plan Section 4.7). `limit` is the ONLY
// query param -- no `cursor` (see trending.service.ts's own header
// comment on why a keyset cursor doesn't apply to a reorderable top-N
// snapshot) and no `q` (this endpoint ranks EVERY hashtag in the window,
// it doesn't search for one).
export class TrendingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TRENDING_MAX_LIMIT)
  limit?: number;
}
