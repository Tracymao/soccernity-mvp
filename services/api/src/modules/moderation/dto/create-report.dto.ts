import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  MESSAGE_REPORT_CONTEXT_MAX,
  REPORT_REASON_CATEGORIES,
  REPORT_SEVERITIES,
  REPORT_TARGET_TYPES,
  ReportReasonCategory,
  ReportSeverity,
  ReportTargetType,
} from '../moderation.constants';

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

  // B-284 (Decision Log #465): REQUIRED. The fixed list is REPORT_REASON_CATEGORIES.
  // Decision Log #466: 'child_safety_concern' makes the stored report concernsMinor = true. This route has no
  // concernsMinor field of its own, so the category is the only way to raise that flag here.
  @IsIn(REPORT_REASON_CATEGORIES)
  reasonCategory!: ReportReasonCategory;

  // The free-text description. OPTIONAL, except for reasonCategory 'other' where the service requires a
  // non-blank one (coded 400, REPORT_REASON_REQUIRED_CODE). When omitted it is stored as
  // the empty string, so every reader of Report.reason keeps getting a string. The 500-character limit is
  // unchanged. Validation is skipped only for an omitted (or null) value; a provided value must still be a
  // string of 1 to 500 characters, as before, so an explicit "" stays a 400 (the existing behaviour).
  @ValidateIf((o: { reason?: unknown }) => o.reason !== undefined && o.reason !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;

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

  // backend/b286-message-report-context (Decision Log #477): ONLY for targetType 'message'. Ids of other messages in
  // the same conversation to attach as context (at most 20, within 10 messages before or after the reported one,
  // visible to the reporter). With any other targetType the field is a 400 (checked in ModerationService, coded).
  // Duplicates are dropped in the service. Every other rule is enforced in ONE place in the service, and every
  // failure there is the same 404 'Message not found'.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MESSAGE_REPORT_CONTEXT_MAX)
  @IsUUID('all', { each: true })
  contextMessageIds?: string[];
}
