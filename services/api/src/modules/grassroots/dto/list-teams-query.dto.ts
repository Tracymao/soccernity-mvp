import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /teams?city= (Build Plan Section 4.5). Section 5.5: every list
// endpoint is paginated — keyset (not offset), opaque base64 cursor,
// default 20 / max 50, following feed-query.dto.ts / list-clubs-query.dto.ts
// verbatim.
//
// `city` is an OPTIONAL exact-match equality filter — GrassrootsTeam.city
// is a plain String with no text-search index in Section 3, so this is a
// plain WHERE-clause equality condition ANDed alongside the (name, id)
// cursor filter, not a fuzzy search. It does not participate in ordering
// or tiebreaking, so it doesn't complicate cursor correctness — the same
// treatment ListClubsQueryDto gives `league`/`country`.
//
// NOTE: the existence of this endpoint does NOT close Decision Log #258
// (no teams-browse screen / no Grassroots nav entry point). There is a
// query surface; there is no designed UI for it and no way to reach it.
// See grassroots/README.md.
export class ListTeamsQueryDto {
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
}
