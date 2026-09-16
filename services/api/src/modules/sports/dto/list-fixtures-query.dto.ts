import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { SPORTS_MAX_PAGE_SIZE } from '../sports.constants';

// GET /sports/fixtures?date=&league=&cursor=&limit= — NO AUTH REQUIRED (Section 4.6; matches this
// codebase's SportsHubPage.tsx own already-shipped "no login gate" precedent, same category as the
// Blog feed). `date` is required (Section 4.6's own literal contract); `league` (Highlightly's own
// leagueId) is an additional, optional filter beyond the literal spec — flagged the same way blog's
// categoryId/categorySlug filters were.
export class ListFixturesQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  league?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPORTS_MAX_PAGE_SIZE)
  limit?: number;
}
