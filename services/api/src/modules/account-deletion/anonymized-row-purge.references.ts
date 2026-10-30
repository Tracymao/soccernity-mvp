import { Prisma } from '@prisma/client';

// backend/w6-purge-anonymised-rows (B-043; Decision Log #375, supersedes #344, builds on #341).
//
// Everything that still points at a User row, and what the purge timer does about it. The purge
// (AnonymizedRowPurgeService) hard-deletes an anonymised User row only if NOTHING here still refers to
// it. The "is there anything left" test is explicit -- one lookup per reference, never "try the DELETE and
// see what the database says" -- because five of the foreign keys into User CASCADE (ContestEntry,
// ContestRoundWinner, ContestStanding, PointsLedgerEntry, CommunityGroup.createdById), so a DELETE would
// silently destroy their rows instead of refusing, and because several references have no foreign key at
// all (Report.targetId, RevokedUsername.userId, AdminActionLog.targetId, ...), so no DELETE would ever
// complain about them.
//
// THE FOREIGN-KEY LIST IS DERIVED, NOT TYPED. userForeignKeyRelations() reads Prisma.dmmf, so a model
// added next year with a relation to User is checked automatically (fail safe: it blocks the purge) with
// no edit here. The two classification lists below exist so a human has to DECIDE what each relation is:
// anonymized-row-purge.references.spec.ts fails the build when a derived relation is in neither list.
//
// Both lists BLOCK the purge. They differ only in why a surviving row is expected or not:
//   CONTENT_RELATIONS               a record the anonymiser deliberately leaves behind (it keeps content
//                                   other users depend on, #341). A row here is the NORMAL reason an
//                                   anonymised user is not purged.
//   ANONYMISER_DELETES_RELATIONS    rows AccountDeletionSweepService.anonymizeUser removes (or nulls)
//                                   itself, in the same transaction that sets anonymizedAt. A row still
//                                   here 30 days later is an ANOMALY (something wrote to an anonymised
//                                   account). It also blocks -- a DELETE would fail on RESTRICT or
//                                   silently cascade -- but is logged as an anomaly, not as content.

/** "Model.field" of a relation FIELD on the model that owns the foreign key. */
export type RelationKey = string;

export interface UserForeignKeyRelation {
  model: string;
  /** The relation field, e.g. "author". */
  field: string;
  /** The foreign-key scalar on `model`, e.g. "authorId". */
  fkField: string;
  /** Prisma delegate name, e.g. "post". */
  delegate: string;
  key: RelationKey;
}

export function userForeignKeyRelations(): UserForeignKeyRelation[] {
  const out: UserForeignKeyRelation[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const f of model.fields) {
      if (f.kind !== 'object' || f.type !== 'User') continue;
      const from = f.relationFromFields ?? [];
      if (from.length !== 1) continue; // the inverse (list) side, or a composite key (none exists)
      out.push({
        model: model.name,
        field: f.name,
        fkField: from[0],
        delegate: model.name.charAt(0).toLowerCase() + model.name.slice(1),
        key: `${model.name}.${f.name}`,
      });
    }
  }
  return out;
}

/**
 * Implicit many-to-many relations User takes part in (Prisma's `_<RelationName>` join tables). There is
 * no model for them in the dmmf, so they are listed by relation name. Today: ClubMembership.
 */
export function userImplicitManyToManyRelations(): string[] {
  const user = Prisma.dmmf.datamodel.models.find((m) => m.name === 'User');
  const names: string[] = [];
  for (const f of user?.fields ?? []) {
    if (f.kind !== 'object' || !f.isList) continue;
    const other = Prisma.dmmf.datamodel.models.find((m) => m.name === f.type);
    const back = other?.fields.find((o) => o.relationName === f.relationName && o.type === 'User');
    if (back?.isList) names.push(f.relationName ?? '');
  }
  return names.sort();
}

// ---- classification (a human decision per relation; the spec enforces completeness) ----

export const CONTENT_RELATIONS: readonly RelationKey[] = [
  'Result.enteredBy',
  'Post.author',
  'Comment.author',
  'CommunityGroup.createdBy', // CASCADE: a DELETE would take the whole group
  'Message.sender',
  'PostView.viewer',
  'Report.reporter',
  'LeaderboardEntry.user',
  'ContestEntry.user', // CASCADE
  'ContestRoundWinner.user', // CASCADE
  'ContestVote.voter',
  'ContestEngagement.user',
  'ContestStanding.user', // CASCADE
  'PointsLedgerEntry.user', // CASCADE
  'PostMediaReport.reporter',
  // B-044: an admin legal / bad-faith hold is audit evidence of who held whom and why. It survives the
  // account, so it blocks the purge (veto-able default).
  'AccountHold.user',
  // B-046 (#444): anonymizeUser deletes the user's enquiries EXCEPT an escalated one, which follows the linked
  // report's retention; so what is left is escalated by design and blocks the purge, like a report.
  'ContactEnquiry.user',
];

export const ANONYMISER_DELETES_RELATIONS: readonly RelationKey[] = [
  'Guardian.minorUser', // snapshotted into ConsentAuditRecord, then deleted
  'GrassrootsTeam.createdBy', // nulled
  'BanterRoomMember.user', // CASCADE; deleted
  'CommunityGroupMember.user', // CASCADE; deleted
  'Notification.user',
  'SavedPost.user',
  'Like.user',
  'Follow.follower',
  'Follow.followee',
  'Block.blocker',
  'Block.blocked',
  'MatchSubscription.user',
  'ContestImpression.viewer',
  'PostMedia.uploader', // rows deleted (the files follow, rejected private objects excepted, B-206)
];

/** Implicit m2m relations the anonymiser clears itself (ClubPage membership). */
export const ANONYMISER_DELETES_IMPLICIT_M2M: readonly string[] = ['ClubMembership'];

/**
 * Relations that are in the schema but in NEITHER classification list. Empty when every relation has been
 * decided. The spec asserts it is empty (so a new model with a relation to User fails the build until
 * someone classifies it); `relations` is a parameter only so the spec can prove that it notices.
 */
export function unclassifiedRelationKeys(relations: readonly { key: RelationKey }[] = userForeignKeyRelations()): RelationKey[] {
  const known = new Set<RelationKey>([...CONTENT_RELATIONS, ...ANONYMISER_DELETES_RELATIONS]);
  return relations.map((r) => r.key).filter((k) => !known.has(k));
}

// ---- references with NO foreign key (found by reading the schema; the spec scans for new ones) ----

export type PlainReferenceClass = 'content' | 'excluded' | 'tolerated';

/**
 * "Model.field" -> what to do. 'content' blocks the purge. 'excluded' is intentionally not checked and
 * survives the purge by design. 'tolerated' is an opaque id on ANOTHER user's row that is allowed to dangle.
 */
export const PLAIN_USER_REFERENCES: Readonly<Record<string, PlainReferenceClass>> = {
  'Report.targetId': 'content', // targetType 'user', or a post/comment the user authored
  // B-139 (founder decision 2026-10-30): blocks only while a hold is RUNNING. The record is deleted once its
  // user is anonymised and holdUntil has passed (AccountDeletionSweepService.anonymizeUser at anonymisation,
  // AnonymizedRowPurgeService.cleanupRevokedUsernames afterwards, and purgeOne for this row just before it
  // looks), so any record this check still finds is a running hold: it blocks this run, retried next run.
  'RevokedUsername.userId': 'content',
  'AdminActionLog.targetId': 'content', // targetType 'user'; veto-able default
  'ContestVoteEvent.voterId': 'content', // append-only audit of this user's votes
  'AgeReclassificationLog.userId': 'content', // append-only audit; veto-able default
  'BanterRoom.createdBy': 'content', // the room survives its creator (a bare string, no FK)
  'Conversation.participantIds': 'content', // a thread this user is a party to
  'ConsentAuditRecord.minorUserId': 'excluded', // survives on its OWN 6-month clock (#42, #375)
  'Notification.actorId': 'tolerated', // another user's notification naming this user as the actor
};

// ---- the check ----

type Delegate = { findFirst: (args: unknown) => Promise<unknown> };

export interface Blocker {
  /** A stable label, e.g. "Post.author", "Report.targetId", "_ClubMembership". */
  label: string;
  kind: 'content' | 'anomaly';
}

/**
 * The first reference that stops this user's row being purged, or null if the row is clear. Order: content
 * first (the expected reasons), then anomalies. Every lookup is a plain read.
 */
export async function findFirstBlocker(db: Prisma.TransactionClient, userId: string): Promise<Blocker | null> {
  const relations = userForeignKeyRelations();
  const contentSet = new Set(CONTENT_RELATIONS);
  // Anything not classified as content is checked as an anomaly, INCLUDING a relation nobody classified
  // yet (fail safe; anonymized-row-purge.references.spec.ts makes that a build failure).
  const contentRelations = relations.filter((r) => contentSet.has(r.key));
  const otherRelations = relations.filter((r) => !contentSet.has(r.key));

  for (const r of contentRelations) {
    if (await hasRow(db, r, userId)) return { label: r.key, kind: 'content' };
  }
  const plain = await plainContentBlocker(db, userId);
  if (plain) return { label: plain, kind: 'content' };
  for (const r of otherRelations) {
    if (await hasRow(db, r, userId)) return { label: r.key, kind: 'anomaly' };
  }
  const club = await db.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found FROM "_ClubMembership" WHERE "B" = ${userId} LIMIT 1
  `;
  if (club.length > 0) return { label: '_ClubMembership', kind: 'anomaly' };
  return null;
}

async function hasRow(db: Prisma.TransactionClient, r: UserForeignKeyRelation, userId: string): Promise<boolean> {
  const delegate = (db as unknown as Record<string, Delegate | undefined>)[r.delegate];
  if (!delegate) throw new Error(`Purge check: no Prisma delegate for ${r.model}`);
  const row = await delegate.findFirst({ where: { [r.fkField]: userId }, select: { [r.fkField]: true } });
  return row != null;
}

/** The label of the first no-foreign-key 'content' reference that still names this user, or null. */
async function plainContentBlocker(db: Prisma.TransactionClient, userId: string): Promise<string | null> {

  // Report: filed AGAINST the user, or against a post/comment they authored. Any status counts (a closed
  // report is still the moderation record). The reporter side is the Report.reporter foreign key.
  const reports = await db.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found
    FROM "Report" r
    WHERE (r."targetType" = 'user' AND r."targetId" = ${userId})
       OR (r."targetType" = 'post' AND EXISTS (
             SELECT 1 FROM "Post" p WHERE p."id" = r."targetId" AND p."authorId" = ${userId}))
       OR (r."targetType" = 'comment' AND EXISTS (
             SELECT 1 FROM "Comment" c WHERE c."id" = r."targetId" AND c."authorId" = ${userId}))
    LIMIT 1
  `;
  if (reports.length > 0) return 'Report.targetId';

  const checks: [string, () => Promise<unknown>][] = [
    ['RevokedUsername.userId', () => db.revokedUsername.findFirst({ where: { userId }, select: { id: true } })],
    [
      'AdminActionLog.targetId',
      () => db.adminActionLog.findFirst({ where: { targetType: 'user', targetId: userId }, select: { id: true } }),
    ],
    [
      'ContestVoteEvent.voterId',
      () => db.contestVoteEvent.findFirst({ where: { voterId: userId }, select: { id: true } }),
    ],
    [
      'AgeReclassificationLog.userId',
      () => db.ageReclassificationLog.findFirst({ where: { userId }, select: { id: true } }),
    ],
    ['BanterRoom.createdBy', () => db.banterRoom.findFirst({ where: { createdBy: userId }, select: { id: true } })],
    [
      'Conversation.participantIds',
      () => db.conversation.findFirst({ where: { participantIds: { has: userId } }, select: { id: true } }),
    ],
  ];
  for (const [label, run] of checks) {
    if ((await run()) != null) return label;
  }
  return null;
}
