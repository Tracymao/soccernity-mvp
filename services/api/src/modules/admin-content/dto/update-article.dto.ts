import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ARTICLE_STATUSES, ArticleStatus } from '../admin-content.constants';

// PATCH /admin/articles/:id (Build Plan Section 4.8's literal line).
// Every field optional — a partial update, same shape as
// UpdateAdminProfileDto/UpdateCommunityGroupDto-style PATCH DTOs
// elsewhere in this codebase. `authorAdminId` is never editable via this
// route (no per-author edit restriction is enforced either — see
// admin-content/README.md's "who may edit" section for why that's a
// deliberate, disclosed choice, not an oversight).
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
}
