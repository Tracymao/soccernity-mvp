import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BLOG_MAX_PAGE_SIZE } from '../blog.constants';

// GET /categories?cursor=&limit= — NO AUTH REQUIRED, active only (see
// BlogService.listCategories). Deliberately no `status` query param at
// all, unlike the admin-side GET /admin/categories — a public caller has
// no legitimate reason to ask for the inactive list, so there's no
// filter surface to lock down later.
export class ListPublicCategoriesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BLOG_MAX_PAGE_SIZE)
  limit?: number;
}
