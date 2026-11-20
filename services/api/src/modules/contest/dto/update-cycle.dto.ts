import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CONTEST_DESCRIPTION_MAX_LENGTH,
  CONTEST_TASK_MAX_LENGTH,
  CONTEST_TITLE_MAX_LENGTH,
  EXPOSURE_RANGE_MAX,
  EXPOSURE_RANGE_MIN,
  PlacementPointsDto,
  WATCH_LIMIT_MAX_SECONDS,
  WATCH_LIMIT_MIN_SECONDS,
} from './create-cycle.dto';

// One week's editable fields. Every field is optional: send only what changes.
export class UpdateContestWeekDto {
  @IsInt()
  @Min(1)
  @Max(3)
  weekNumber!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(CONTEST_TASK_MAX_LENGTH)
  task?: string;

  @IsOptional()
  @IsInt()
  @Min(WATCH_LIMIT_MIN_SECONDS)
  @Max(WATCH_LIMIT_MAX_SECONDS)
  viewWatchLimitSeconds?: number;
}

// PATCH /admin/contest/cycles/:id -- edit a contest, within the locking rules of docs/contest-spec.md
// section 4a (enforced in ContestAdminService against the clock, not here):
//   before week 1 opens  everything except the dates
//   after week 1 starts  LOCKED: title, minimum tally, placement points, and the watch limit of any
//                        week that has started; still editable: the description and the task text of
//                        weeks that have not started
//   week-4 settings      the followers switch, tolerance and per-viewer cap lock when week 4 starts
// There is no `month` and no date field: dates are never editable.
export class UpdateCycleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(CONTEST_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CONTEST_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => UpdateContestWeekDto)
  weeks?: UpdateContestWeekDto[];

  @IsOptional()
  @IsString()
  @MaxLength(CONTEST_TASK_MAX_LENGTH)
  finalTask?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumTally?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlacementPointsDto)
  placementPoints?: PlacementPointsDto;

  @IsOptional()
  @IsBoolean()
  followersExcludedWeek4?: boolean;

  @IsOptional()
  @IsInt()
  @Min(EXPOSURE_RANGE_MIN)
  @Max(EXPOSURE_RANGE_MAX)
  exposureTolerancePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(EXPOSURE_RANGE_MIN)
  @Max(EXPOSURE_RANGE_MAX)
  exposureViewerDailyCap?: number;
}
