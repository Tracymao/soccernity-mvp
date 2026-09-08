import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { GRASSROOTS_LEAGUE_TYPES, GrassrootsLeagueType } from '../grassroots.constants';

// POST /teams (Build Plan Section 4.5). GrassrootsTeam Section 3 fields
// that a caller supplies: name, city, leagueType. `createdById` is taken
// from the access token, never the body. `verified` is @default(false)
// and has no endpoint that sets it in MVP (an operations/trust decision,
// not self-service — flagged in grassroots/README.md).
//
// `leagueType` is validated against the exact three-value allow-list in
// grassroots.constants.ts (matching the schema comment and the Figma
// segmented control), the same @IsIn precedent guardian-details.dto.ts
// uses for Guardian.relationship.
export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @IsIn(GRASSROOTS_LEAGUE_TYPES)
  leagueType!: GrassrootsLeagueType;
}
