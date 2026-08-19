import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Build Plan Section 5.5: every list endpoint must be paginated — GET
// /clubs is a browsable catalog (Build Plan Section 4.4), and this DTO
// follows feed/dto/feed-query.dto.ts's exact precedent: cursor-based
// (keyset), not offset-based, opaque base64 cursor, default/max page
// size of 20/50 (the same deliberate numbers feed-query.dto.ts chose —
// reused here for consistency across every list endpoint in this
// codebase, not re-derived from scratch; Section 5.5 doesn't specify
// numbers either way). Deliberately re-declared here rather than
// importing FEED_DEFAULT_PAGE_SIZE/FEED_MAX_PAGE_SIZE from the feed
// module — same "small, deliberate duplicate over a cross-module import"
// precedent users/README.md documented for FOLLOW_USER_SELECT.
//
// `league` and `country` are optional equality filters — both already
// exist on ClubPage (schema.prisma) and don't complicate the keyset
// cursor: they're plain WHERE-clause equality conditions ANDed alongside
// the (name, id) cursor filter, not part of the ordering/tiebreak logic
// itself, so adding them doesn't touch the cursor's own correctness.
export class ListClubsQueryDto {
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
  @IsString()
  league?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export const CLUBS_DEFAULT_PAGE_SIZE = 20;
export const CLUBS_MAX_PAGE_SIZE = 50;
