import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class CrownStandingDto {
  @IsUUID()
  userId!: string;

  // 1 | 2 | 3, ties allowed (Decision Log #61(c) / #69 medals).
  @IsInt()
  @Min(1)
  @Max(3)
  position!: number;
}

// POST /admin/contest/cycles/:id/crown — set the monthly top 3 and close
// the cycle. Each userId must be a weekly winner of this cycle
// (ContestService.crownCycle validates against ContestRoundWinner) —
// Decision Log #61: the finalists ARE the weekly winners. At least one
// standing required; max 6 covers ties.
export class CrownCycleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CrownStandingDto)
  standings!: CrownStandingDto[];
}
