import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  REPORT_REASON_CATEGORIES,
  REPORT_SEVERITIES,
  PUBLIC_REPORT_TARGET_TYPES,
  ReportReasonCategory,
  ReportSeverity,
  PublicReportTargetType,
} from '../moderation.constants';

// POST /reports/public — a public, unauthenticated report route for a
// non-Soccernity-account party (a parent, a school, a member of the
// public with no account at all) to flag content that depicts them or
// their child, without first having to register. This is the
// application half of the groundwork
// schema/report-severity-escalation-admin-vetting laid on Report
// (reporterId/reporter made optional, reporterContactEmail added,
// concernsMinor added) and flagged there as "no application code
// wiring such a route... yet" — see that migration's own comment on
// Report for the full reasoning, and README.md for this route's own
// Decision Log candidate.
//
// reporterContactEmail is REQUIRED here (unlike Report.reporterContactEmail
// itself, which stays nullable at the schema level so a genuinely
// anonymous tip with no application route can still exist in principle)
// — this endpoint's whole purpose is to let Soccernity follow up and to
// send the acknowledgment email this route triggers, so a submission
// with no way to reach the reporter back would defeat the point of this
// specific endpoint. reporterContactName is deliberately NOT collected
// here — Report.reporterContactName stays available on the schema for a
// future route that wants it, but this one doesn't ask for it.
export class CreatePublicReportDto {
  @IsEmail()
  reporterContactEmail!: string;

  @IsIn(PUBLIC_REPORT_TARGET_TYPES as unknown as string[])
  targetType!: PublicReportTargetType;

  @IsUUID()
  targetId!: string;

  // B-284 (Decision Log #465): REQUIRED. The fixed list is REPORT_REASON_CATEGORIES.
  // Decision Log #466: 'child_safety_concern' forces the stored concernsMinor to true, even if concernsMinor
  // below is sent false. The category can only raise the flag, never lower it.
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

  // Whether the reported content/behaviour concerns a minor — maps
  // straight onto Report.concernsMinor (see that field's own schema
  // comment). Required, not defaulted, on this route specifically: a
  // non-authenticated reporter flagging content about themselves or
  // their child is exactly the caller who can state this reliably, so
  // there's no reason to let it silently default false the way it does
  // for every OTHER route that doesn't set it yet. The stored value is
  // this one OR'd with the 'child_safety_concern' category (see above).
  @IsBoolean()
  concernsMinor!: boolean;

  // Optional — defaults to 'medium' at the service layer when omitted,
  // same as CreateReportDto's own severity field (see
  // moderation.constants.ts's DEFAULT_REPORT_SEVERITY). Left optional
  // here too rather than required: a non-authenticated reporter can
  // reliably say WHETHER a minor is concerned (concernsMinor, required),
  // but assessing an abstract severity tier is a different, harder ask —
  // that's precisely what the moderation queue/vetted-admin review this
  // report enters is for.
  @IsOptional()
  @IsIn(REPORT_SEVERITIES)
  severity?: ReportSeverity;
}
