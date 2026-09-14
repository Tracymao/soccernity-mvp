import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /community-groups (Build Plan Sprint 3, Decision Log #281). Section
// 5.5: every list endpoint is keyset-paginated, opaque base64 cursor,
// default 20 / max 50 — following feed-query.dto.ts /
// list-clubs-query.dto.ts / list-banter-rooms-query.dto.ts verbatim.
//
// Three OPTIONAL, combinable, exact-match equality filters — city,
// positionPlayed, careerTrack — the Leaderboard-style combinable-filter
// pattern the Figma design (docs/sprint-3-community-groups-design-report.md)
// cites, NOT a text-search `?q=` (the design's filter bar is labelled
// dropdowns per dimension, not a free-text search box — unlike Banter
// Rooms' own `?q=` search route, which Section 4.4 explicitly names).
// Each is a plain WHERE-clause condition ANDed alongside the (createdAt,
// id) cursor filter, not part of ordering/tiebreak — the same treatment
// ListClubsQueryDto gives league/country and ListTeamsQueryDto gives
// city.
export class ListCommunityGroupsQueryDto {
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
  city?: string;

  @IsOptional()
  @IsString()
  positionPlayed?: string;

  @IsOptional()
  @IsString()
  careerTrack?: string;
}
