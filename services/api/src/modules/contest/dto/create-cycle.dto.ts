import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// One explicitly-provided weekly round window. Optional as a group — if
// `rounds` is omitted entirely, ContestService.createCycle generates
// three 7-day rounds starting at `startsAt`.
export class CreateCycleRoundDto {
  @IsInt()
  @Min(1)
  @Max(3)
  weekNumber!: number;

  @IsDateString()
  opensAt!: string;

  @IsDateString()
  closesAt!: string;
}

// POST /admin/contest/cycles — create the (single) running Contest cycle.
// Rejected if a cycle with status 'active' or 'final' already exists
// (ContestService.createCycle) — one cycle at a time.
export class CreateCycleDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  // Exactly three rounds (weeks 1, 2, 3) when provided. Omit to
  // auto-generate them as three consecutive 7-day windows from startsAt.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CreateCycleRoundDto)
  rounds?: CreateCycleRoundDto[];
}
