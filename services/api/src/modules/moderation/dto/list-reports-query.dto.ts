import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /admin/moderation/reports (Section 4.8). Section 5.5: every list
// endpoint is keyset-paginated, opaque base64 cursor, default 20 / max
// 50 — following feed-query.dto.ts / list-banter-rooms-query.dto.ts
// verbatim. `status` is an OPTIONAL exact-match equality filter against
// Report's own pre-existing three-value status enum, ANDed alongside the
// (createdAt, id) cursor filter — the same treatment
// ListBanterRoomsQueryDto gives `scopeType`. A bad status is a 400.
export class ListReportsQueryDto {
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
  @IsIn(['open', 'reviewed', 'actioned'])
  status?: string;
}
