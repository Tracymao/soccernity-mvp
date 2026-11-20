// Build Plan Section 8.3 ("Guardian-details capture" — name, email,
// relationship) and Section 3 (Guardian.relationship). This exact,
// ordered list is load-bearing: F3 (signup screens, built in parallel
// with this PR) builds its guardian-relationship dropdown to match this
// list exactly. Do not rename, reorder, or add/remove values here without
// coordinating that change with the frontend.
//
// The Guardian.relationship column in prisma/schema.prisma is a plain
// String (not a Postgres/Prisma enum) specifically so this starter list
// can grow later without a schema migration — see the schema's own
// inline comment. That extensibility is a schema-design property, not
// permission to casually change the *current* four values.
export const GUARDIAN_RELATIONSHIPS = ['Parent', 'Legal Guardian', 'Grandparent', 'Other'] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];
