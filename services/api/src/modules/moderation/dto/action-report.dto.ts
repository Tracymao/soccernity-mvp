import { IsIn } from 'class-validator';
import { REPORT_ACTIONS, ReportAction } from '../moderation.constants';

// PATCH /admin/moderation/reports/:id — Section 4.8's literal
// `PATCH /admin/moderation/reports` line, given a real request shape.
export class ActionReportDto {
  @IsIn(REPORT_ACTIONS)
  action!: ReportAction;
}
