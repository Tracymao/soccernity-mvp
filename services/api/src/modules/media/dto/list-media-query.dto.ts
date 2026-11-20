import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MediaType } from '../media.constants';

// GET /admin/media — Section 5.5: keyset-paginated, opaque base64
// cursor, default 20 / max 50, following list-articles-query.dto.ts /
// list-users-query.dto.ts verbatim. One optional exact-match filter —
// `type` — derived server-side on upload from the file's own MIME type
// (never a raw MIME string here), same ANDed-alongside-the-cursor
// treatment ListArticlesQueryDto gives `status`.
export class ListMediaQueryDto {
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
  @IsIn(['image', 'video'])
  type?: MediaType;
}
