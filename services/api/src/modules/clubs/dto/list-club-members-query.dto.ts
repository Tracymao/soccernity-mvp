import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Build Plan Section 5.5: every list endpoint must be paginated. GET
// /clubs/:id/members (sprint-2/club-fan-page-backend) is a browsable
// roster, so — like GET /clubs itself — it pages alphabetically by the
// member's displayName (User has no "joined this club at" timestamp: the
// implicit _ClubMembership join table carries only the A/B id columns,
// no createdAt), with the User id as the keyset tiebreaker. The cursor
// therefore reuses clubs/cursor.util.ts's { name, id } envelope verbatim
// (name = displayName) rather than inventing a third cursor shape — see
// ClubsService.getClubMembers.
//
// Same { cursor, limit } shape as FeedQueryDto / ListClubsQueryDto, same
// default 20 / max 50 page size the rest of this codebase's list
// endpoints use (Section 5.5 doesn't specify numbers). Deliberately a
// small local DTO rather than importing FeedQueryDto across the module
// boundary — its cursor is a feed { createdAt, id } cursor, semantically
// wrong here — matching the same "small deliberate duplicate over a
// forced cross-module fit" precedent ListClubsQueryDto set.
export class ListClubMembersQueryDto {
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

export const CLUB_MEMBERS_DEFAULT_PAGE_SIZE = 20;
export const CLUB_MEMBERS_MAX_PAGE_SIZE = 50;
