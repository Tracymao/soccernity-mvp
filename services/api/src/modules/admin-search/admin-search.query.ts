import { BadRequestException } from '@nestjs/common';
import {
  ADMIN_SEARCH_MAX_LENGTH,
  ADMIN_SEARCH_MIN_LENGTH,
  ADMIN_SEARCH_QUERY_INVALID_CODE,
  ADMIN_SEARCH_QUERY_TOO_LONG_CODE,
  ADMIN_SEARCH_QUERY_TOO_SHORT_CODE,
} from './admin-search.constants';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A whole email address, nothing else. Deliberately strict: the exact-email matchers only run on this shape.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A username as the platform stores it (UpdateUserDto: [A-Za-z0-9_], 3-30; stored lowercase, Decision Log #364).
const USERNAME_SHAPED = /^[A-Za-z0-9_]+$/;
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
    isEmail: EMAIL.test(text),
    isUsernameShaped: USERNAME_SHAPED.test(text),
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
