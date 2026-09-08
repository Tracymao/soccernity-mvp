import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// POST /fixtures (Build Plan Section 4.5). Fixture Section 3 fields a
// caller supplies: teamAId, teamBId (nullable), scheduledAt, venue
// (nullable). `status` is @default('scheduled') and never set from the
// body. `result` is created only by POST /fixtures/:id/result.
//
// - The away side of a fixture is exactly one of three states (Decision
//   Log #256, backend half by sprint-5/grassroots-opponent-name):
//     * `teamBId` set        — the opponent is a registered Soccernity team.
//     * `opponentName` set    — the opponent is NOT on Soccernity; the name
//                               is persisted free-text (e.g. "Riverside FC").
//     * neither set           — the fully-TBD "Opponent to be confirmed"
//                               state; both columns stay null.
//   Supplying BOTH `teamBId` and a non-empty `opponentName` is rejected
//   with a 400 in GrassrootsService.createFixture (a cross-field rule, not
//   expressible on a single-field decorator). An `opponentName` that is
//   empty or whitespace-only after trimming is treated as absent (stored
//   as null, never ""). The "Opponent TBC" display string for the
//   neither-set case is a FRONTEND concern — the API returns the raw
//   `opponentName: string | null` only.
// - scheduledAt is one ISO timestamp (Section 3's `scheduledAt DateTime`).
//   The Figma form splits date + kick-off time into two inputs and the
//   client combines them; the API takes the combined value.
export class CreateFixtureDto {
  @IsUUID()
  teamAId!: string;

  @IsOptional()
  @IsUUID()
  teamBId?: string;

  // No @Transform trim here — this module's DTOs do not use a transform
  // convention (create-team.dto.ts is plain class-validator too), so the
  // trim + empty-to-absent normalisation happens in
  // GrassrootsService.createFixture, alongside the teamBId/opponentName
  // cross-field rule.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  opponentName?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  venue?: string;
}
