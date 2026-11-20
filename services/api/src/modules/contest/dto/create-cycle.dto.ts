import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// backend/w7-contest (B-091; docs/contest-spec.md sections 4, 4a; Decision Log #399, #402).
//
// The admin form. Dates are NOT a field: a contest runs in one London calendar month and every
// instant (the openings, Phase 1 end, the vote lock, the reveal, the month end) is derived from
// `month`. Dates are never editable (section 4a) -- UpdateCycleDto has no `month` and the global
// ValidationPipe (forbidNonWhitelisted) rejects one.

// Title max 80 (#399 E1). The task / description limits are this code's own (the spec gives none).
export const CONTEST_TITLE_MAX_LENGTH = 80;
export const CONTEST_TASK_MAX_LENGTH = 2000;
export const CONTEST_DESCRIPTION_MAX_LENGTH = 5000;
// #399 E5: the validation ranges.
export const WATCH_LIMIT_MIN_SECONDS = 3;
export const WATCH_LIMIT_MAX_SECONDS = 120;
export const EXPOSURE_RANGE_MIN = 1;
export const EXPOSURE_RANGE_MAX = 50;

// One of weeks 1-3: its free-text task and its REQUIRED view-qualifying watch limit (#393, #399 E5).
export class ContestWeekInputDto {
  @IsInt()
  @Min(1)
  @Max(3)
  weekNumber!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(CONTEST_TASK_MAX_LENGTH)
  task!: string;

  @IsInt()
  @Min(WATCH_LIMIT_MIN_SECONDS)
  @Max(WATCH_LIMIT_MAX_SECONDS)
  viewWatchLimitSeconds!: number;
}

// Placement points for 1st / 2nd / 3rd (section 9d). Optional: the spec's defaults apply.
export class PlacementPointsDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsInt({ each: true })
  @Min(0, { each: true })
  weekly?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsInt({ each: true })
  @Min(0, { each: true })
  monthly?: number[];
}

// POST /admin/contest/cycles -- create the contest for one London calendar month.
export class CreateCycleDto {
  /** "YYYY-MM". The month must not have started (its week 1 opens at 08:00 on day 1). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(CONTEST_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CONTEST_DESCRIPTION_MAX_LENGTH)
  description?: string;

  /** Exactly weeks 1, 2 and 3. */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ContestWeekInputDto)
  weeks!: ContestWeekInputDto[];

  /** The final's task text. Optional at creation, editable until week 4 starts. */
  @IsOptional()
  @IsString()
  @MaxLength(CONTEST_TASK_MAX_LENGTH)
  finalTask?: string;

  /** x: REQUIRED, no default (section 4). At least 1 (a finalist who never uploads scores 0 and must fall below it). */
  @IsInt()
  @Min(1)
  minimumTally!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlacementPointsDto)
  placementPoints?: PlacementPointsDto;

  /** Week 4 only (#399 E2). */
  @IsOptional()
  @IsBoolean()
  followersExcludedWeek4?: boolean;

  /** Week 4 only (#402). Percent, 1-50. */
  @IsOptional()
  @IsInt()
  @Min(EXPOSURE_RANGE_MIN)
  @Max(EXPOSURE_RANGE_MAX)
  exposureTolerancePercent?: number;

  /** Week 4 only (#402). Views of one finalist video per viewer per day, 1-50. */
  @IsOptional()
  @IsInt()
  @Min(EXPOSURE_RANGE_MIN)
  @Max(EXPOSURE_RANGE_MAX)
  exposureViewerDailyCap?: number;
}
