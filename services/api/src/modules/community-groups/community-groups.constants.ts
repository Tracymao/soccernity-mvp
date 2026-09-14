// Build Plan Sprint 3 — Community Groups (Decision Log #281). Section 5.5:
// every list endpoint is paginated. Same default 20 / max 50 the rest of
// this codebase's list endpoints use (feed, clubs, banter, grassroots) —
// Section 5.5 doesn't specify numbers, so these are reused for
// consistency rather than re-derived.
export const COMMUNITY_GROUPS_DEFAULT_PAGE_SIZE = 20;
export const COMMUNITY_GROUPS_MAX_PAGE_SIZE = 50;

export const COMMUNITY_GROUP_MEMBERS_DEFAULT_PAGE_SIZE = 20;
export const COMMUNITY_GROUP_MEMBERS_MAX_PAGE_SIZE = 50;
