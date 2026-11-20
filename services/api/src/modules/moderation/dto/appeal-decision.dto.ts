import { IsIn } from 'class-validator';
import { APPEAL_DECISIONS, AppealDecision } from '../moderation.constants';

// PATCH /admin/moderation/reports/:id/appeal — the second reviewer's
// upheld/overturned decision. Decision Log #138 (who may review) is
// enforced in ModerationService, not here — this DTO only guarantees the
// value is a syntactically valid decision.
export class AppealDecisionDto {
  @IsIn(APPEAL_DECISIONS)
  decision!: AppealDecision;
}
