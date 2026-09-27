import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ADMIN_USER_ROLES, AdminUserRole } from '../admin-staff-roles.constants';

// GET /admin/staff. Section 5.5: keyset-paginated, opaque base64 cursor,
// default 20 / max 50. One OPTIONAL exact-match equality filter —
// `role` — ANDed alongside the (createdAt, id) cursor filter, the same
// treatment ListUsersQueryDto/ListReportsQueryDto/ListArticlesQueryDto
// give their own single filter field.
export class ListStaffQueryDto {
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
  @IsIn(ADMIN_USER_ROLES)
  role?: AdminUserRole;
}
