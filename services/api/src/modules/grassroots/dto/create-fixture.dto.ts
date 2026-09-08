import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// POST /fixtures (Build Plan Section 4.5). Fixture Section 3 fields a
// caller supplies: teamAId, teamBId (nullable), scheduledAt, venue
// (nullable). `status` is @default('scheduled') and never set from the
// body. `result` is created only by POST /fixtures/:id/result.
//
// - teamBId is OPTIONAL and, when omitted, the fixture is the "Opponent
//   to be confirmed" state (Decision Log #256): Fixture.teamBId stays
//   null. There is no free-text opponent-name field on Fixture in Section
//   3, so `teamBId: null` is the only way to record an unregistered
//   opponent — designed and rendered as "Opponent TBC". Confirm-or-add
//   is an open Decision Log candidate (#256).
// - scheduledAt is one ISO timestamp (Section 3's `scheduledAt DateTime`).
//   The Figma form splits date + kick-off time into two inputs and the
//   client combines them; the API takes the combined value.
export class CreateFixtureDto {
  @IsUUID()
  teamAId!: string;

  @IsOptional()
  @IsUUID()
  teamBId?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  venue?: string;
}
