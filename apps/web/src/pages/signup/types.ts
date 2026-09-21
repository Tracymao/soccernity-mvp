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

// sprint-1/coppa-card-verification -- the child's SELF-DECLARED country of
// residence, ISO-3166 alpha-2. Never derived from IP. It only decides which
// consent path applies (an under-13 in the US needs an extra card step).
// "ZZ" is the ISO user-assigned code, used here for "somewhere not listed";
// it is treated as non-US by the API.
export const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "NG", label: "Nigeria" },
  { code: "ZZ", label: "Another country" },
] as const;

export interface GuardianDetailsValues {
  firstName: string;
  lastName: string;
  email: string;
  relationship: GuardianRelationship | "";
  country: string;
}

export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
