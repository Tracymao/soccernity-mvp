import { IsBoolean, IsIn } from 'class-validator';
import { HoldReasonDto } from '../../moderation/dto/hold-reason.dto';
import { REPORT_SEVERITIES, ReportSeverity } from '../../moderation/moderation.constants';

// POST /admin/contact-enquiries/:id/escalate (Decision Log #444, #445). Severity and the minor flag are the
// admin's own judgment and are REQUIRED (there is no sender-supplied value to default from). The reason reuses
// the existing 10-to-500-character reason pattern (HoldReasonDto, the same bound as the hold and username-revoke
// reasons); it goes to the audit row, not to the Report.
export class EscalateContactEnquiryDto extends HoldReasonDto {
  @IsIn(REPORT_SEVERITIES)
  severity!: ReportSeverity;

  @IsBoolean()
  concernsMinor!: boolean;
}
