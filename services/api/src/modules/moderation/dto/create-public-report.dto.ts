import { IsBoolean, IsEmail, IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { REPORT_TARGET_TYPES, ReportTargetType } from '../moderation.constants';

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

  @IsIn(REPORT_TARGET_TYPES)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  // Whether the reported content/behaviour concerns a minor — maps
  // straight onto Report.concernsMinor (see that field's own schema
  // comment). Required, not defaulted, on this route specifically: a
  // non-authenticated reporter flagging content about themselves or
  // their child is exactly the caller who can state this reliably, so
  // there's no reason to let it silently default false the way it does
  // for every OTHER route that doesn't set it yet.
  @IsBoolean()
  concernsMinor!: boolean;
}
