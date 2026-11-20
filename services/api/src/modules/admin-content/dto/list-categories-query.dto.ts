import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CATEGORY_STATUSES, CategoryStatus } from '../admin-content.constants';

// GET /admin/categories — a genuine addition beyond Section 4.8's literal
// POST-only line (see admin-content/README.md's Decision Log candidate).
// Section 5.5: keyset-paginated, opaque base64 cursor, default 20 / max
// 50. One OPTIONAL exact-match equality filter — `status` — ANDed
// alongside the (createdAt, id) cursor filter, the same treatment
// ListReportsQueryDto gives its own `status`.
export class ListCategoriesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsIn(CATEGORY_STATUSES)
  status?: CategoryStatus;
}
