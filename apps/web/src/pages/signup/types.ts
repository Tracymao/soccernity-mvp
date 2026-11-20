// Shared types for the signup entry flow (Sprint 1, PR F3).
//
// Kept local to apps/web/src/pages/signup rather than packages/shared --
// B2 (sprint-1/auth-register-verify-email, running in parallel in its own
// worktree) owns the server-side shape of this same data and hasn't merged
// yet. Reconcile with packages/shared once both sides exist, rather than
// risking a collision by claiming shared-package space now.

// Exact starter list, matching B2's server-side relationship options
// (per this PR's brief) -- do not reorder or reword.
export const GUARDIAN_RELATIONSHIP_OPTIONS = [
  "Parent",
  "Legal Guardian",
  "Grandparent",
  "Other",
] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIP_OPTIONS)[number];

export interface AgeGateValues {
  day: string;
  month: string;
  year: string;
}

// The registrant's SELF-DECLARED country of residence, ISO-3166 alpha-2,
// collected once at the Age Gate for every signup (Decision Log #367/#368,
// B-073) and sent as RegisterDto.countryCode. The server derives its own
// authoritative country from the request IP (B-025), so this value is audit
// data and can never loosen a safeguarding decision.
// "ZZ" is the ISO user-assigned code, used here for "somewhere not listed";
// it is treated as non-US by the API.
export const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "NG", label: "Nigeria" },
  { code: "ZZ", label: "Another country" },
] as const;

// B-075 (Decision Log #393 (a), Option A): ONE "Guardian's full name" field,
// matching RegisterDto's single guardian `name`, and no country here --
// country is collected once, at the Age Gate.
export interface GuardianDetailsValues {
  name: string;
  email: string;
  relationship: GuardianRelationship | "";
}

export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
