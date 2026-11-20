import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /notifications — same cursor + limit shape as every other
// keyset-paginated list endpoint in this codebase (FeedQueryDto,
// MyBantsQueryDto, MessagingQueryDto). Section 5.5's bounds (default 20 /
// max 50), enforced here rather than re-derived.
export class NotificationsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
