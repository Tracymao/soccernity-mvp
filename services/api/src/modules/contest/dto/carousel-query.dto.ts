import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CAROUSEL_DEFAULT_LIMIT, CAROUSEL_MAX_LIMIT } from '../contest-exposure.util';

// GET /contest/final-week/carousel (B-092). No cursor: the carousel is one short, bounded list
// (at most 9 finalists, the weekly winners), served in the viewer's rotation order.
export class CarouselQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CAROUSEL_MAX_LIMIT)
  limit?: number = CAROUSEL_DEFAULT_LIMIT;
}
