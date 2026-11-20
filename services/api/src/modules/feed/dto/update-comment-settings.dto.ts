import { IsIn } from 'class-validator';

// Allow-list for Post.commentPermission (a bare String column, the
// BanterRoom.scopeType/status convention).
export const COMMENT_PERMISSIONS = ['everyone', 'followers', 'off'] as const;
export type CommentPermission = (typeof COMMENT_PERMISSIONS)[number];

export class UpdateCommentSettingsDto {
  @IsIn(COMMENT_PERMISSIONS)
  commentPermission!: CommentPermission;
}
