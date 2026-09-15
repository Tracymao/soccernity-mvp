import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { REPORT_TARGET_TYPES, ReportTargetType } from '../moderation.constants';

// POST /reports — a genuine spec-gap addition, not a literal Section 4
// line item. Section 4's API Contract Sketch never defines a
// report-submission route at all (only the two admin-side lines in
// 4.8), even though Section 2's Community feature list names
// "report/block" as in-scope and Section 8.4's own workflow text ("a
// report is submitted... creating a Report record") assumes one exists.
// Flagged as a Decision Log candidate in README.md, not treated as
// self-evidently correct.
export class CreateReportDto {
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
