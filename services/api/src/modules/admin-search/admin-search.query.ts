import { BadRequestException } from '@nestjs/common';
import {
  ADMIN_SEARCH_MAX_LENGTH,
  ADMIN_SEARCH_MIN_LENGTH,
  ADMIN_SEARCH_QUERY_INVALID_CODE,
  ADMIN_SEARCH_QUERY_TOO_LONG_CODE,
  ADMIN_SEARCH_QUERY_TOO_SHORT_CODE,
} from './admin-search.constants';
import {
  REPORT_REASON_CATEGORIES,
  REPORT_REASON_CATEGORY_LABELS,
  ReportReasonCategory,
} from '../moderation/moderation.constants';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A whole email address, nothing else. Deliberately strict: the exact-email matchers only run on this shape.
// Checked by hand, not with a regex: the usual `[^\s@]+@[^\s@]+\.[^\s@]+` has two overlapping quantifiers around
// the dot and CodeQL flags it as polynomial ReDoS (js/polynomial-redos). This is a single linear pass.
// Shape: no whitespace, exactly one '@' with something before it, and a dot in the domain that has at least one
// character on each side.
export function isEmailShaped(text: string): boolean {
  if (/\s/.test(text)) return false;
  const at = text.indexOf('@');
  if (at < 1 || at !== text.lastIndexOf('@')) return false;
  const domain = text.slice(at + 1);
  for (let i = 1; i < domain.length - 1; i += 1) {
    if (domain[i] === '.') return true;
  }
  return false;
}
// A username as the platform stores it (UpdateUserDto: [A-Za-z0-9_], 3-30; stored lowercase, Decision Log #364).
const USERNAME_SHAPED = /^[A-Za-z0-9_]+$/;
// The short report reference an admin sees on screen: the first 8 characters of the report's uuid.
const REPORT_REFERENCE = /^[0-9a-f]{8}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export interface ParsedAdminSearchQuery {
  /** Trimmed, as typed. */
  text: string;
  /** Lowercased; what the lowercase-stored columns (User.email, User.username, ids) are compared with. */
  lower: string;
  isUuid: boolean;
  /** A whole email address: the only shape the exact-email matchers run on. */
  isEmail: boolean;
  /** Could be a username prefix. */
  isUsernameShaped: boolean;
  /** Exactly 8 hex characters: the short report reference shown on screen (first 8 characters of a report id). */
  isReportReference: boolean;
  /** Contains an '@', even if not a whole address: a half-typed address is personal data too, so it is audited. */
  containsAt: boolean;
}

function reject(code: string, message: string): never {
  throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message });
}

/** Trim, validate and classify the raw `q`. Throws a coded 400 for an empty / short / long / control-character query. */
export function parseAdminSearchQuery(raw: string | undefined): ParsedAdminSearchQuery {
  const text = (raw ?? '').trim();
  if (text.length < ADMIN_SEARCH_MIN_LENGTH) {
    reject(ADMIN_SEARCH_QUERY_TOO_SHORT_CODE, `Type at least ${ADMIN_SEARCH_MIN_LENGTH} characters to search.`);
  }
  if (text.length > ADMIN_SEARCH_MAX_LENGTH) {
    reject(ADMIN_SEARCH_QUERY_TOO_LONG_CODE, `Search text can be at most ${ADMIN_SEARCH_MAX_LENGTH} characters.`);
  }
  // A NUL byte would make Postgres reject the parameter (a 500); other control characters are never a real search.
  if (CONTROL_CHARACTERS.test(text)) {
    reject(ADMIN_SEARCH_QUERY_INVALID_CODE, 'Search text contains characters that cannot be searched.');
  }
  return {
    text,
    lower: text.toLowerCase(),
    isUuid: UUID.test(text),
    isEmail: isEmailShaped(text),
    isUsernameShaped: USERNAME_SHAPED.test(text),
    isReportReference: REPORT_REFERENCE.test(text),
    containsAt: text.includes('@'),
  };
}

/**
 * Escape LIKE wildcards. Prisma passes the value of `contains` / `startsWith` to Postgres as-is and appends / wraps
 * its own '%', so a typed '%' or '_' would otherwise act as a wildcard (verified against the real engine: the
 * generated parameter for startsWith 'a_b%' is 'a_b%%'). Postgres's default LIKE escape character is the backslash.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

/**
 * B-284 (Decision Log #465): the report reason categories whose LABEL, as an admin reads it, starts with the typed
 * text (case-insensitive, runs of whitespace treated as one space). "harass" finds harassment_or_bullying; "hate or"
 * finds hate_or_abusive_language. A prefix of the label only: a word from the middle ("bullying") does not match, so
 * a loose query cannot pull in every report. Reads the one label map in moderation.constants.ts.
 */
export function matchReasonCategories(text: string): ReportReasonCategory[] {
  const typed = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (typed.length === 0) return [];
  return REPORT_REASON_CATEGORIES.filter((key) => REPORT_REASON_CATEGORY_LABELS[key].toLowerCase().startsWith(typed));
}
