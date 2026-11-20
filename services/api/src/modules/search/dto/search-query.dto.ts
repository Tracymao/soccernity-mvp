import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SEARCH_MAX_PAGE_SIZE, SEARCH_SCOPES, SearchScope } from '../search.constants';

// GET /search?q=&scope=&cursor=&limit= (Build Plan Section 4.7 —
// resolves Decision Log #139's parked people-search need; see
// search.service.ts / search/README.md for the full design).
//
// `q` — REQUIRED, 2-100 chars, trimmed. Validated here on the RAW
// (untrimmed) string, same as every other required-string DTO field in
// this codebase (e.g. CreateTeamDto.name/city in
// grassroots/dto/create-team.dto.ts) — this module does not use a
// @Transform trim convention (see
// grassroots/dto/create-fixture.dto.ts's own comment on why: the
// trim + business-rule check lives in the service, not the DTO).
// SearchService.normalizeQuery trims it and re-checks the TRIMMED
// length is still >= 2 (a raw string like "  a" passes MinLength(2)
// here — its raw length is 3 — but trims to a 1-char "a") before it is
// ever used in a query; MaxLength(100) here is sufficient on its own for
// the upper bound, since trimming can only shorten a string.
//
// `scope` — OPTIONAL, one of 'users' | 'clubs' | 'posts'; omitted means
// "all three, grouped in the response" (search.service.ts). A bad scope
// is a 400 (IsIn).
//
// `cursor`/`limit` — the same keyset-pagination shape as every other
// list DTO in this codebase (feed/dto/feed-query.dto.ts,
// leaderboard/dto/leaderboard-query.dto.ts,
// clubs/dto/list-clubs-query.dto.ts). `cursor` is only meaningful when
// `scope` is also given — a single opaque cursor can't disambiguate
// "continue paging which of the three lists" — SearchService rejects
// cursor+no-scope with a 400 rather than silently ignoring the cursor
// (a cross-field rule, not expressible on a single decorator here, same
// as GrassrootsService.createFixture's teamBId/opponentName check).
export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @IsIn(SEARCH_SCOPES)
  scope?: SearchScope;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_PAGE_SIZE)
  limit?: number;
}
