import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ARTICLE_STATUSES, ArticleStatus } from '../admin-content.constants';

// GET /admin/articles — a genuine addition beyond Section 4.8's literal
// POST/PATCH-only line (see admin-content/README.md's Decision Log
// candidate). Section 5.5: keyset-paginated, opaque base64 cursor,
// default 20 / max 50 — following list-reports-query.dto.ts /
// list-community-groups-query.dto.ts verbatim. Two OPTIONAL, combinable,
// exact-match equality filters — `status` and `categoryId` — each ANDed
// alongside the (createdAt, id) cursor filter, the same treatment
// ListReportsQueryDto gives `status`.
export class ListArticlesQueryDto {
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
  @IsIn(ARTICLE_STATUSES)
  status?: ArticleStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
