import { IsIn } from 'class-validator';
import { PATCHABLE_FIXTURE_STATUSES, PatchableFixtureStatus } from '../grassroots.constants';

// PATCH /fixtures/:id/status — the dedicated status-transition endpoint
// resolving Decision Log #254. A deliberately narrow sub-resource, NOT a
// general PATCH /fixtures/:id (avoids scope creep — nothing else about a
// fixture is editable) and NOT a derived rule (`live` is a real organiser
// action — "Start match" — that cannot be inferred from any timestamp).
//
// `status` must be one of `live` | `full_time`. `scheduled` is rejected
// (you cannot move a fixture back to scheduled). The legal-machine
// enforcement — which current->target pairs are actually allowed — lives
// in GrassrootsService.updateFixtureStatus, not here; this DTO only
// guarantees the value is a syntactically valid target.
export class UpdateFixtureStatusDto {
  @IsIn(PATCHABLE_FIXTURE_STATUSES)
  status!: PatchableFixtureStatus;
}
