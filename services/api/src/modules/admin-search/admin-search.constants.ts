import { CONTACT_EMAIL_MAX_LENGTH } from '../contact/contact.constants';
import { ADMIN_USERS_DEFAULT_PAGE_SIZE } from '../admin-users/admin-users.constants';

// GET /admin/search (backend/b114-admin-search; B-114, Decision Log #463). Every figure below is an ADOPTED
// DEFAULT, veto-able, with where it comes from. None is stated by the founder.

// Shortest query accepted. 3 is the shortest username (UpdateUserDto: 3-30 of [A-Za-z0-9_]), so a username PREFIX
// shorter than that cannot be a useful lookup, and it is also the point below which a "contains" match on a
// subject or title would return noise. Reused from the username rule, not invented.
export const ADMIN_SEARCH_MIN_LENGTH = 3;

// Longest query accepted: the longest email address the platform stores or accepts (a Contact Us sender address,
// CONTACT_EMAIL_MAX_LENGTH, itself the ChangeGuardianEmailDto bound). Counted on the TRIMMED text.
export const ADMIN_SEARCH_MAX_LENGTH = CONTACT_EMAIL_MAX_LENGTH;

// Results returned per group. Section 5.5's default page size (every list endpoint here defaults to 20; this
// is tied to ADMIN_USERS_DEFAULT_PAGE_SIZE by a test so the two cannot drift). One more row is read to report
// `truncated`; the extra row is never returned.
export const ADMIN_SEARCH_GROUP_CAP = ADMIN_USERS_DEFAULT_PAGE_SIZE;

// How many of a user's own posts and comments are looked up to find reports ABOUT them. The reports list this
// feeds is itself capped at ADMIN_SEARCH_GROUP_CAP, so this bounds the work, not the answer. Same order of
// magnitude as INCORRECT_DETAILS_LIST_CAP (a safety cap on a read that is expected to be small).
export const ADMIN_SEARCH_OWNED_CONTENT_ID_CAP = 200;

// Per-IP, per-handler limit, applied with the existing @AuthRateLimit({ limit, windowMs }) override (the form the
// admin login uses). NEW FIGURE: there is no existing admin read limit to reuse. 30 a minute is one search every
// two seconds, well above a person typing into a submit-to-search bar and far below scripted enumeration.
export const ADMIN_SEARCH_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

export const ADMIN_SEARCH_QUERY_TOO_SHORT_CODE = 'admin_search_query_too_short';
export const ADMIN_SEARCH_QUERY_TOO_LONG_CODE = 'admin_search_query_too_long';
export const ADMIN_SEARCH_QUERY_INVALID_CODE = 'admin_search_query_invalid';

export const ADMIN_SEARCH_GROUPS = ['users', 'reports', 'contactEnquiries', 'articles', 'staff', 'media'] as const;
export type AdminSearchGroup = (typeof ADMIN_SEARCH_GROUPS)[number];
