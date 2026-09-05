import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class RoundWinnerDto {
  @IsUUID()
  entryId!: string;

  // 1 | 2 | 3. Ties are allowed (Decision Log #61(c)) — two entries may
  // share a position; both are awarded that position's weekly-win points.
  @IsInt()
  @Min(1)
  @Max(3)
  position!: number;
}

// POST /admin/contest/cycles/:id/rounds/:week/results — close a weekly
// round and record its top 3. `winners` MAY be empty (a "thin week" with
// no entries worth placing — Decision Log #61(b)); the round still closes.
// Max 6 covers ties across all three positions.
export class RoundResultsDto {
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => RoundWinnerDto)
  winners!: RoundWinnerDto[];
}
