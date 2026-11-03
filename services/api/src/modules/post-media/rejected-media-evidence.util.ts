import { Prisma } from '@prisma/client';
import { resolveReportAppealWindowDays } from '../account-hold/account-hold.config';
import { findActiveAccountHold, reportClosedAt } from '../account-hold/account-hold.rules';

// backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464).
//
// THE PROTECTION RULE for the private object of a REJECTED media file. Every lifecycle path now deletes it
// (post deleted, upload deleted, quarantine purge, unattached purge, account anonymised, account purged), EXCEPT
// when either of these holds, in which case the deletion is skipped and retried later:
//
//   1. the uploader has an ACTIVE ADMIN HOLD (a legal hold or a bad-faith hold, findActiveAccountHold -- the one
//      read of that rule, not a copy of it); or
//   2. the post the file is attached to has a report that is NOT YET CLOSED (reportClosedAt, the one closure
//      predicate of the hold rules, so the appeal window counts as "not yet closed").
//
// WHY A RECORD: when a post or an upload is deleted its PostMedia row goes with it, so a skipped deletion has
// nothing left to retry from. The skip is therefore written to PostMediaDeferredDeletion (in the SAME transaction
// as the delete, when the caller has one) and RejectedMediaSweepService.processDeferred finishes the job once
// neither protection applies.
//
// WHAT THIS DOES NOT PROTECT: a stray object with no row and no record cannot be tied to a report (the key names
// only the uploader and the media id), so for it the minimum object age is the only protection; its uploader's
// hold IS checked, because the key names the uploader.

export interface EvidenceItem {
  mediaId: string;
  uploaderId: string;
  postId: string | null;
  key: string;
}

type HoldDb = Pick<Prisma.TransactionClient, 'accountHold'>;
type ReportDb = Pick<Prisma.TransactionClient, 'report'>;
type DeferDb = Pick<Prisma.TransactionClient, 'postMediaDeferredDeletion'>;

/** The uploaders (of those given) that have an active admin hold right now. */
export async function uploadersUnderHold(db: HoldDb, uploaderIds: readonly string[], now: Date): Promise<Set<string>> {
  const held = new Set<string>();
  for (const id of new Set(uploaderIds)) {
    if (await findActiveAccountHold(db, id, now)) held.add(id);
  }
  return held;
}

/** The posts (of those given) with a report that is not yet closed (open, appeal pending or appeal window running). */
export async function postsWithUnclosedReport(
  db: ReportDb,
  postIds: readonly string[],
  now: Date,
  appealWindowDays: number = resolveReportAppealWindowDays(),
): Promise<Set<string>> {
  const ids = [...new Set(postIds)];
  const open = new Set<string>();
  if (ids.length === 0) return open;
  const reports = await db.report.findMany({
    where: { targetType: 'post', targetId: { in: ids } },
    select: { targetId: true, status: true, appealStatus: true, reviewedAt: true, appealReviewedAt: true },
  });
  for (const r of reports) {
    const closure = reportClosedAt(r, appealWindowDays);
    if (closure === null || now.getTime() < closure.getTime()) open.add(r.targetId);
  }
  return open;
}

export interface EvidencePartition {
  /** Neither protection applies: the object may be deleted now. */
  free: EvidenceItem[];
  /** The uploader is under a hold, or the post has an unclosed report: do not delete. */
  protectedItems: EvidenceItem[];
}

export async function partitionEvidence(
  db: HoldDb & ReportDb,
  items: readonly EvidenceItem[],
  now: Date,
): Promise<EvidencePartition> {
  if (items.length === 0) return { free: [], protectedItems: [] };
  const held = await uploadersUnderHold(
    db,
    items.map((i) => i.uploaderId),
    now,
  );
  const reported = await postsWithUnclosedReport(
    db,
    items.flatMap((i) => (i.postId ? [i.postId] : [])),
    now,
  );
  const free: EvidenceItem[] = [];
  const protectedItems: EvidenceItem[] = [];
  for (const item of items) {
    if (held.has(item.uploaderId) || (item.postId !== null && reported.has(item.postId))) protectedItems.push(item);
    else free.push(item);
  }
  return { free, protectedItems };
}

/** Records the deferred deletions. Idempotent (one record per object key). */
export async function recordDeferrals(db: DeferDb, items: readonly EvidenceItem[]): Promise<void> {
  if (items.length === 0) return;
  await db.postMediaDeferredDeletion.createMany({
    data: items.map((i) => ({ objectKey: i.key, mediaId: i.mediaId, uploaderId: i.uploaderId, postId: i.postId })),
    skipDuplicates: true,
  });
}

/**
 * The one call the delete paths make for the rejected files they are removing: returns the keys that may be
 * deleted now, and records a deferral for every object the protection rule holds back.
 */
export async function evidenceKeysToDeleteNow(
  db: HoldDb & ReportDb & DeferDb,
  items: readonly EvidenceItem[],
  now: Date,
): Promise<string[]> {
  const { free, protectedItems } = await partitionEvidence(db, items, now);
  await recordDeferrals(db, protectedItems);
  return free.map((i) => i.key);
}
