import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { BLOG_MAX_PAGE_SIZE } from '../blog.constants';

// GET /articles?categoryId=&categorySlug=&cursor=&limit= — NO AUTH
// REQUIRED (Build Plan Section 4, Sprint 4's public Blog/Articles feed).
// Section 5.5: keyset-paginated, opaque base64 cursor, default 20 / max
// 50 — a fresh, separate DTO from admin-content's own
// ListArticlesQueryDto, since this ticket deliberately does not touch
// admin-content (see ../README.md).
//
// `categoryId` (a real Category UUID) and `categorySlug` (Category.slug)
// are alternate, combinable equality filters on the referenced category
// — this module's task brief asks for "filterable by categoryId/category
// slug to match BlogPage.tsx's category tabs". `categorySlug` exists
// specifically so the frontend can filter using the slug it already has
// from GET /categories, with no extra id lookup. If a caller supplies
// both, they're ANDed (a real, if unlikely, edge case) rather than
// treated as an error.
export class ListPublicArticlesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BLOG_MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  categorySlug?: string;
}
