import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ARTICLE_EXCERPT_MAX_LENGTH, ARTICLE_STATUSES, ArticleStatus } from '../admin-content.constants';

// PATCH /admin/articles/:id (Build Plan Section 4.8's literal line).
// Every field optional — a partial update, same shape as
// UpdateAdminProfileDto/UpdateCommunityGroupDto-style PATCH DTOs
// elsewhere in this codebase. `authorAdminId` is never editable via this
// route (no per-author edit restriction is enforced either — see
// admin-content/README.md's "who may edit" section for why that's a
// deliberate, disclosed choice, not an oversight).
//
// `excerpt` is OPTIONAL (Decision Log #333, resolved) — same DTO-level
// shape as CreateArticleDto's own; see that file's header comment for
// the fallback behaviour on the public read side.
//
// `coverImageId` (Decision Log #334, resolved) is genuinely THREE-way
// optional, not two — the DTO type is `string | null | undefined`, and
// AdminContentService.updateArticle distinguishes all three via
// `!== undefined`: omitted -> leave the current cover image untouched;
// a real MediaAsset UUID -> set/replace it (validated to exist first);
// an EXPLICIT `null` -> clear it back to no cover image. `@IsOptional()`
// (class-validator) treats BOTH `undefined` and `null` as "skip the
// following validators" — so `@IsUUID()` only ever runs against a real
// non-null value, and an explicit `null` reaches the service layer
// untouched (the global ValidationPipe's `whitelist: true` strips
// properties not declared on this class; it does not strip or coerce
// the VALUE of a property that is declared, so `null` survives). Proven
// against the real HTTP layer (not just asserted) in
// admin-articles.controller.http.spec.ts.
export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(ARTICLE_STATUSES)
  status?: ArticleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_EXCERPT_MAX_LENGTH)
  excerpt?: string;

  @IsOptional()
  @IsUUID()
  coverImageId?: string | null;
}
