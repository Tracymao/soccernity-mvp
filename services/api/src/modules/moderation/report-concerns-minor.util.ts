import { CHILD_SAFETY_REASON_CATEGORY } from './moderation.constants';

// backend/b284-child-safety-category-flag (Decision Log #466, founder decision 2026-11-03). The ONE place that
// decides Report.concernsMinor at submission. A report whose reason category is 'child_safety_concern' is ALWAYS
// stored with concernsMinor = true, whatever else the reporter sent. The category can only RAISE the flag, never
// lower it: a reporter's own true (the public route's dto.concernsMinor) stays true under any category.
//
// Used by both ModerationService.createReport (POST /reports, which has no concernsMinor field, so pass false) and
// createPublicReport (POST /reports/public). Severity is not touched by the category.
//
// Reports already filed are not changed (none carries a category, and nothing here backfills).
export function resolveConcernsMinor(reasonCategory: string, reporterConcernsMinor: boolean): boolean {
  return reasonCategory === CHILD_SAFETY_REASON_CATEGORY || reporterConcernsMinor;
}
