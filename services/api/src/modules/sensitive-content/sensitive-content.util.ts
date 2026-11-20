// Pre-publication sensitive-content screen (Decision Log "Pre-publication
// sensitive-content screen (Russmedia obligation)").
//
// A 2026 CJEU ruling (Russmedia) treats a platform that publishes
// structured, distributed user content as a joint controller with a duty to
// screen for special-category disclosures BEFORE publication, not only
// moderate after a report. This is the screen. It is deliberately a
// LOW-PRECISION keyword/pattern list: a false positive costs the submitter
// one confirmation click, a false negative is the exact risk this exists to
// reduce. Do not "tighten" it to cut false positives without a safeguarding
// decision.
//
// Categories follow UK/EU GDPR Art. 9(1) special-category data: health,
// religion/belief, racial or ethnic origin, sexual orientation / sex life,
// political opinion, trade-union membership, genetic/biometric data.
//
// This module is pure (no I/O, no Nest). It is the only place the word
// lists live; call sites (currently GrassrootsService) pass in free-text
// fields and act on the result. There was no pre-existing text-flagging
// utility in the moderation module to reuse (the Report queue is
// user-submitted, not content-scanned), so the Moderation Queue is reused
// for LOGGING (see GrassrootsService), not for detection.

export const SENSITIVE_CATEGORIES = [
  'health',
  'religion',
  'ethnicity',
  'sexual_orientation',
  'politics',
  'trade_union',
  'biometric_genetic',
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

// Each entry is a regex fragment, matched case-insensitively at a word
// START only (`\b` + term), so inflections match (diabet -> diabetes /
// diabetic, christian -> christians) but an unrelated word that merely
// contains a term does not. Prefix matching over-matches by design.
// Written with String.raw so `\b` reaches the RegExp as a word boundary.
const CATEGORY_TERMS: Record<SensitiveCategory, string[]> = {
  health: [
    'diabet', 'cancer', 'tumou?r', 'chemo', 'leuk[a]?emi', 'asthma', 'epilep', 'seizure', String.raw`hiv\b`, String.raw`aids\b`,
    'hepatitis', 'tubercul', 'covid', 'coronavirus', 'sickle', 'disabilit', 'disabled', 'wheelchair', 'autis',
    'adhd', 'dyslex', 'depress', 'anxiety', 'bipolar', 'schizo', 'mental health', 'suicid', '(self[- ]harm)',
    'anorexi', 'bulimi', 'eating disorder', 'pregnan', 'miscarriage', 'heart (condition|disease|attack|problem)',
    'cardiac', 'medical (condition|history|record|issue)', 'diagnos', 'illness', 'terminally', 'rehab',
    'addict', 'surgery', 'medication', 'prescription', 'concuss',
  ],
  religion: [
    'muslim', 'islam', 'christian', 'catholic', 'protestant', 'pentecostal', 'anglican', 'church', 'mosque',
    'jewish', 'judaism', 'synagogue', 'hindu', 'sikh', 'buddhis', 'atheis', 'agnostic', 'jehovah', 'mormon',
    'rastafari', 'pastor', 'imam', 'rabbi', 'prayer', 'ramadan', 'sabbath', 'religio', 'faith', 'pagan',
  ],
  ethnicity: [
    'ethnic', 'racial', String.raw`race\b`, 'racist',
    '(black|white|asian) (player|boy|girl|kid|guy|man|men|people)',
    'tribe', 'tribal', 'igbo', 'yoruba', 'hausa', 'fulani',
    'caucasian', 'african[- ]american', 'hispanic', 'latino', String.raw`roma\b`, 'gypsy', 'immigrant', 'refugee',
    'asylum', 'indigenous', 'minority',
  ],
  sexual_orientation: [
    String.raw`gay\b`, 'lesbian', 'bisexual', 'homosexual', 'lgbt', 'queer', 'transgender',
    'trans (boy|girl|man|woman|player)', 'sexual orientation', 'coming out', 'came out',
    'straight (boy|girl|man|woman|player)', 'sex life', 'sexuality',
  ],
  politics: [
    'politic', 'party member', 'election', 'voted', 'labour party', 'conservative party', 'tory',
    String.raw`apc\b`, String.raw`pdp\b`, 'democrat', 'republican', 'communist', 'socialis', 'far[- ]right',
    'far[- ]left', 'nationalis', 'activist', 'protester', 'protestor',
  ],
  trade_union: ['trade union', 'trades union', 'union member', 'union rep', 'shop steward'],
  biometric_genetic: ['biometric', 'fingerprint', String.raw`dna\b`, 'genetic', 'genome', 'facial recognition', 'retina'],
};

const COMPILED: Array<{ category: SensitiveCategory; regex: RegExp }> = (
  Object.entries(CATEGORY_TERMS) as Array<[SensitiveCategory, string[]]>
).map(([category, terms]) => ({
  category,
  regex: new RegExp(String.raw`\b(?:${terms.join('|')})`, 'i'),
}));

export interface SensitiveFieldFlag {
  // The submitted field name (e.g. "venue"), never its content.
  field: string;
  categories: SensitiveCategory[];
}

// Returns one flag per field that matches at least one category. The
// matched text is deliberately NOT returned or logged: it is the
// potentially-sensitive disclosure itself.
export function screenSensitiveContent(fields: Record<string, string | null | undefined>): SensitiveFieldFlag[] {
  const flags: SensitiveFieldFlag[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    const categories = COMPILED.filter(({ regex }) => regex.test(value)).map(({ category }) => category);
    if (categories.length > 0) {
      flags.push({ field, categories });
    }
  }
  return flags;
}

export const SENSITIVE_CONTENT_REVIEW_REQUIRED_CODE = 'sensitive_content_review_required';

export const SENSITIVE_CONTENT_REVIEW_MESSAGE =
  'This looks like it may mention something sensitive about someone — are you sure you want to share this publicly?';

// Prefix on the Report.reason of an auto-logged flagged-and-confirmed
// submission. Report has no `source` column (no schema change was made for
// this feature), and a system-generated report is the only kind with
// reporterId null AND reporterContactEmail null (a public report requires
// the email), so this prefix is how a moderator recognises one at a glance.
export const SENSITIVE_CONTENT_REPORT_REASON_PREFIX = '[Automated: pre-publication sensitive-content screen]';

export function buildSensitiveContentReportReason(flags: SensitiveFieldFlag[]): string {
  const detail = flags.map((f) => `${f.field} (${f.categories.join(', ')})`).join('; ');
  return `${SENSITIVE_CONTENT_REPORT_REASON_PREFIX} Submitter was warned and chose to publish. Flagged fields: ${detail}.`;
}
