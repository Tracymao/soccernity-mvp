import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ARTICLE_EXCERPT_MAX_LENGTH, ARTICLE_STATUSES, ArticleStatus } from '../admin-content.constants';

// POST /admin/articles (Build Plan Section 4.8's literal line).
// `authorAdminId` is taken from the verified admin access token
// (@CurrentAdmin()), never the body — same discipline as
// CreateTeamDto.createdById / CreateCommunityGroupDto's own header
// comment. `status` is OPTIONAL and defaults to Article.status's own
// schema @default("draft") when omitted — see
// AdminContentService.createArticle for the publishedAt-on-publish
// behaviour when a caller does supply `status: 'published'` directly.
//
// `excerpt` is OPTIONAL (Decision Log #333, resolved) — a curated,
// admin-authored summary. Omitting it (or sending an empty/whitespace
// string, normalized to `null` in AdminContentService) leaves the
// public read side to fall back to excerpt.util.ts's own
// truncateExcerpt(body), unchanged.
//
// `coverImageId` is OPTIONAL (Decision Log #334, resolved) — a real
// `MediaAsset.id` (AdminContentService.assertMediaAssetExists checks it
// exists before the create runs). Omitting it leaves the article with
// no cover image at all — the same "optional, no clearing concept
// needed on create" shape `excerpt` already has.
export class CreateArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsIn(ARTICLE_STATUSES)
  status?: ArticleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(ARTICLE_EXCERPT_MAX_LENGTH)
  excerpt?: string;

  @IsOptional()
  @IsUUID()
  coverImageId?: string;
}
