import { IsOptional, IsString, MaxLength } from 'class-validator';

// GET /sports/standings?league=&season= — NO AUTH REQUIRED (Section 4.6's own literal contract
// names only `league`; `season` is an additional, optional param this integration genuinely needs
// — Highlightly's own /standings endpoint requires both leagueId AND season. See
// sports.service.ts's `resolveStandingsSeason` for what happens when `season` is omitted: it
// defaults to whatever season is already cached for that league, falling back to a computed
// current-year guess only if nothing is cached yet at all — flagged as a Decision Log candidate in
// modules/sports/README.md, not silently invented.
export class GetStandingsQueryDto {
  @IsString()
  @MaxLength(64)
  league!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  season?: string;
}
