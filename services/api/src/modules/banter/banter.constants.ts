// Build Plan Section 4.4 (Club & Banter Service) + Section 3
// (BanterRoom.scopeType). The underlying column is a plain Postgres
// `String` (schema.prisma), not a Prisma/Postgres enum, so this
// allow-list can grow later without a migration — the same extensibility
// choice already made for Guardian.relationship, User.role and
// GrassrootsTeam.leagueType (grassroots.constants.ts). Not licence to
// casually change the current values: the well-developed Figma Banter
// frames (Log Book Section 23.1) build their scope filter bar against
// exactly these four.
//
// BanterRoom.scopeType — the schema comment lists `club | league |
// country | topic`. This is the enforced allow-list for POST
// /banter-rooms and the optional `?scopeType=` filter on the two list
// endpoints.
export const BANTER_ROOM_SCOPE_TYPES = ['club', 'league', 'country', 'topic'] as const;
export type BanterRoomScopeType = (typeof BANTER_ROOM_SCOPE_TYPES)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// the rest of this codebase's list endpoints use (feed, clubs,
// grassroots) — Section 5.5 doesn't specify numbers, so these are reused
// for consistency rather than re-derived.
export const BANTER_ROOMS_DEFAULT_PAGE_SIZE = 20;
export const BANTER_ROOMS_MAX_PAGE_SIZE = 50;
