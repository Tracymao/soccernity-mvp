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

// BanterRoom.description (founder decision 2026-11-14, Decision Log #404 item 10).
// Optional, text-only, set at creation. 1-500 characters when present (blank = absent).
// DEFAULT, founder-veto-able: the Dev session chose 500 (the same figure as a report
// description / CreatePublicReportDto.reason); the founder did not state it.
export const BANTER_ROOM_DESCRIPTION_MAX_LENGTH = 500;

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// the rest of this codebase's list endpoints use (feed, clubs,
// grassroots) — Section 5.5 doesn't specify numbers, so these are reused
// for consistency rather than re-derived.
export const BANTER_ROOMS_DEFAULT_PAGE_SIZE = 20;
export const BANTER_ROOMS_MAX_PAGE_SIZE = 50;

// GET /banter-rooms/topics — the topics catalog (sprint-3/banter-room-topics,
// Decision Log #276). Same Section 5.5 bounds; a separate pair of
// constants (not a reuse of the rooms ones above) since the two surfaces
// paginate genuinely different tables and could plausibly diverge later —
// matching the COMMUNITY_GROUP_MEMBERS_*_PAGE_SIZE / COMMUNITY_GROUPS_*_PAGE_SIZE
// split community-groups.constants.ts already makes for its own two list
// surfaces.
export const BANTER_TOPICS_DEFAULT_PAGE_SIZE = 20;
export const BANTER_TOPICS_MAX_PAGE_SIZE = 50;

// BanterRoom.status (Decision Log #357) — the Figma Bants room status dot.
// Plain String column, service-enforced allow-list, same as scopeType.
export const BANTER_ROOM_STATUSES = ['active', 'inactive'] as const;
export type BanterRoomStatus = (typeof BANTER_ROOM_STATUSES)[number];
