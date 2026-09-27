import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { REPORT_SEVERITIES, REPORT_TARGET_TYPES, ReportSeverity, ReportTargetType } from '../moderation.constants';

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

  // Optional — defaults to 'medium' at the service layer when omitted
  // (see moderation.constants.ts's DEFAULT_REPORT_SEVERITY). A reporter
  // rarely has the context to assess severity accurately, so this is
  // deliberately optional rather than required, unlike concernsMinor on
  // the public route (which IS required there because a non-authenticated
  // reporter flagging their own/their child's content is exactly the
  // caller who CAN state that reliably).
  @IsOptional()
  @IsIn(REPORT_SEVERITIES)
  severity?: ReportSeverity;
}
