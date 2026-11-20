import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { USERNAME_REVIEW_MAX_PAGE_SIZE, USERNAME_REVIEW_STATUSES } from '../username-review.constants';

// GET /admin/username-reviews. Section 5.5: keyset-paginated, opaque cursor. `status` is an optional exact filter.
export class ListUsernameReviewsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USERNAME_REVIEW_MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsIn(USERNAME_REVIEW_STATUSES)
  status?: string;
}
