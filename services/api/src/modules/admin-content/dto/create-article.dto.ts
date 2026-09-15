import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ARTICLE_STATUSES, ArticleStatus } from '../admin-content.constants';

// POST /admin/articles (Build Plan Section 4.8's literal line).
// `authorAdminId` is taken from the verified admin access token
// (@CurrentAdmin()), never the body — same discipline as
// CreateTeamDto.createdById / CreateCommunityGroupDto's own header
// comment. `status` is OPTIONAL and defaults to Article.status's own
// schema @default("draft") when omitted — see
// AdminContentService.createArticle for the publishedAt-on-publish
// behaviour when a caller does supply `status: 'published'` directly.
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
}
