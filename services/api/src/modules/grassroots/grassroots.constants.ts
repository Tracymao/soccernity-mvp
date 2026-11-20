// Build Plan Section 4.5 (Grassroots Records Service) + Section 3
// (GrassrootsTeam.leagueType, Fixture.status). Both underlying columns are
// plain Postgres `String`s (schema.prisma), not Prisma/Postgres enums, so
// these starter lists can grow later without a migration — the same
// extensibility choice already made for Guardian.relationship
// (guardian-relationship.constants.ts) and User.role. That is a
// schema-design property, not licence to casually change the current
// values: the Figma design (docs/sprint-5-grassroots-record-keeping-
// screens-report.md) builds its `leagueType` segmented control and its
// three-state status pill against exactly these values.

// GrassrootsTeam.leagueType — the schema comment lists `informal | school
// | academy`. This is the enforced allow-list for POST /teams.
export const GRASSROOTS_LEAGUE_TYPES = ['informal', 'school', 'academy'] as const;
export type GrassrootsLeagueType = (typeof GRASSROOTS_LEAGUE_TYPES)[number];

// Fixture.status — the schema comment lists `scheduled | live | full_time`.
// A new Fixture always starts `scheduled` (schema @default). The legal
// forward transitions, enforced by PATCH /fixtures/:id/status and (for the
// scheduled|live -> full_time move) by POST /fixtures/:id/result:
//
//   scheduled --("Start match")--> live
//   live      --("End match")-----> full_time
//   scheduled ------------(result logged)------> full_time
//
// Everything else — any backwards move, full_time -> anything, a no-op
// same-status PATCH, or reaching full_time via PATCH rather than a real
// result — is rejected. There is deliberately NO `postponed` / `cancelled`
// value: Section 3's enum has only these three, and this PR does not add a
// fourth speculatively (flagged as an open Decision Log candidate, #256's
// sibling — see grassroots/README.md and Decision Log #255's entry).
export const FIXTURE_STATUSES = ['scheduled', 'live', 'full_time'] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

// The subset of FixtureStatus a client may target via PATCH
// /fixtures/:id/status. `scheduled` is excluded — you cannot move a
// fixture *back* to scheduled, and it is already the creation default, so
// there is never a reason to PATCH to it.
export const PATCHABLE_FIXTURE_STATUSES = ['live', 'full_time'] as const;
export type PatchableFixtureStatus = (typeof PATCHABLE_FIXTURE_STATUSES)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// the rest of this codebase's list endpoints use (feed, clubs) — Section
// 5.5 doesn't specify numbers, so these are reused for consistency.
export const GRASSROOTS_DEFAULT_PAGE_SIZE = 20;
export const GRASSROOTS_MAX_PAGE_SIZE = 50;
