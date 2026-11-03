// The report reason categories as a person reads them (B-284, Decision Log #465; Figma "Report — In-app form"
// and "Report — Public page", ids in docs/figma-report-reason-categories.md). ONE map, used by both report
// forms (pages/community/ReportAction.tsx and pages/ReportPage.tsx). The keys, their order and the
// "other needs a description" rule come from api/moderation.ts, which mirrors the server.
import {
  REASON_REQUIRED_CATEGORY,
  REPORT_REASON_CATEGORIES,
  type ReportReasonCategory,
} from "../api/moderation";

export const REPORT_REASON_LABELS: Record<ReportReasonCategory, string> = {
  harassment_or_bullying: "Harassment or bullying",
  hate_or_abusive_language: "Hate or abusive language",
  threats_or_violence: "Threats or violence",
  child_safety_concern: "Child safety concern",
  sexual_or_inappropriate_content: "Sexual or inappropriate content",
  impersonation_or_fake_account: "Impersonation or fake account",
  spam_or_scam: "Spam or scam",
  privacy_or_image_misuse: "Privacy or image misuse",
  other: "Other",
};

export const REPORT_REASON_OPTIONS = REPORT_REASON_CATEGORIES.map((value) => ({
  value,
  label: REPORT_REASON_LABELS[value],
}));

/** Only "Other" makes the description required. */
export function detailsRequired(category: ReportReasonCategory | null): boolean {
  return category === REASON_REQUIRED_CATEGORY;
}

/** A report can be sent once a category is chosen, and, for "Other", a description is written. */
export function canSubmitReport(category: ReportReasonCategory | null, details: string): boolean {
  if (category === null) return false;
  return !detailsRequired(category) || details.trim().length > 0;
}

/** The description to send: trimmed, or undefined when empty (the server rejects an explicit ""). */
export function detailsToSend(details: string): string | undefined {
  const trimmed = details.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
