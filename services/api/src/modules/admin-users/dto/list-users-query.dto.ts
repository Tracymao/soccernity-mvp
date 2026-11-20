import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ADMIN_USER_FILTER_STATUSES, AdminUserFilterStatus } from '../admin-users.constants';

// GET /admin/users — Section 4.8's literal contract line. Section 5.5:
// keyset-paginated, opaque base64 cursor, default 20 / max 50. One
// OPTIONAL exact-match equality filter — `status` — ANDed alongside the
// (createdAt, id) cursor filter, the same treatment ListReportsQueryDto/
// ListArticlesQueryDto give their own `status`. Accepts all four real
// accountStatus values (not just the two this module's PATCH can write —
// see admin-users.constants.ts's own comment on the distinction).
export class ListUsersQueryDto {
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
  @IsIn(ADMIN_USER_FILTER_STATUSES)
  status?: AdminUserFilterStatus;
}
