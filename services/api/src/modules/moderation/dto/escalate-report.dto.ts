import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

// PATCH /admin/moderation/reports/:id/escalate — restricted to
// child-safety-vetted admins (see ModerationService.assertChildSafetyVetted),
// regardless of the target report's own concernsMinor value. Sets
// Report.escalatedAt/escalatedByAdminId/escalationNotes/escalatedToAuthority
// (see that model's own schema comment on the escalation-trail fields).
//
// Both fields are admin-supplied on every call, not defaulted — this
// endpoint is deliberately callable more than once (e.g. escalate
// internally first with escalatedToAuthority: false, then call again once
// the admin has actually made an external report to flip it true), each
// call overwriting the escalation trail to reflect the MOST RECENT
// escalation action, the same "no append-only audit trail across multiple
// cycles" disclosed limitation this module's own README already states
// for the review/appeal trail.
export class EscalateReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  escalationNotes!: string;

  // The vetted admin states this themselves, once they have ACTUALLY made
  // an external report (e.g. to a regulator or law enforcement) — this
  // endpoint only records that a human did it; it does not contact
  // anyone. false is a legitimate, common value (escalating internally
  // without yet having contacted an authority).
  @IsBoolean()
  escalatedToAuthority!: boolean;
}
