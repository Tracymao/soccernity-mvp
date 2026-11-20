import { Prisma } from '@prisma/client';
import { formatProfileItemId } from '../admin-media-review/profile-image-item-id';
import { suspectedMediaUnderProtection } from '../post-media/rejected-media-evidence.util';
import type { ProfileImageKind } from './user-image-review.service';

// backend/suspected-illegal-profile-images (B-206; founder decision 2026-11-15, extending PR #800).
//
// THE ONE PLACE a path that is about to delete the STORED OBJECT of a profile picture or cover asks whether the file
// is set aside as suspected illegal imagery. It is the SAME evidence rule post media uses (the SuspectedIllegalMedia
// record, read through rejected-media-evidence.util's suspectedMediaUnderProtection), not a second mechanism: a
// profile picture's record is keyed by its profile ITEM ID (avatar:<userId>:<file>, the id the moderator was shown),
// which names the FILE and so is the same whether the file sits at the private or at the public key.
//
// A protected deletion is written to PostMediaDeferredDeletion (the same table post media uses; its columns express
// a profile item with postId null) and RejectedMediaSweepService.processDeferred finishes it later, once the record
// is decided AND its preserveUntil has passed. Without a record the answer is always "delete now": a picture that was
// never set aside behaves exactly as before.
//
// Protection is FILE-LEVEL only. It does not stop the person replacing or deleting the picture, or deleting their
// account: the picture and the account behave as they always did; the stored FILE is kept.
//
// FAIL CLOSED: if the lookup throws, the caller must not delete (the callers below do exactly that).

export interface ProfileObjectRef {
  kind: ProfileImageKind;
  userId: string;
  key: string;
}

type EvidenceDb = Pick<Prisma.TransactionClient, 'suspectedIllegalMedia' | 'postMediaDeferredDeletion'>;

/**
 * Of the given profile objects, returns the keys that may be deleted NOW, and records a deferral for every object a
 * set-aside record holds back. Does nothing (and touches no table) for an empty list.
 */
export async function profileKeysToDeleteNow(
  db: EvidenceDb,
  refs: readonly ProfileObjectRef[],
  now: Date,
): Promise<string[]> {
  if (refs.length === 0) return [];
  const withIds = refs.map((r) => ({ ...r, itemId: formatProfileItemId(r.kind, r.userId, r.key) }));
  const protectedIds = await suspectedMediaUnderProtection(
    db,
    withIds.map((r) => r.itemId),
    now,
  );
  const held = withIds.filter((r) => protectedIds.has(r.itemId));
  if (held.length > 0) {
    await db.postMediaDeferredDeletion.createMany({
      data: held.map((r) => ({ objectKey: r.key, mediaId: r.itemId, uploaderId: r.userId, postId: null })),
      skipDuplicates: true,
    });
  }
  return withIds.filter((r) => !protectedIds.has(r.itemId)).map((r) => r.key);
}

/** True when the file is set aside and still protected (used where a caller only needs the yes/no, e.g. a private-original delete). */
export async function isProfileFileProtected(
  db: Pick<Prisma.TransactionClient, 'suspectedIllegalMedia'>,
  ref: ProfileObjectRef,
  now: Date,
): Promise<boolean> {
  const id = formatProfileItemId(ref.kind, ref.userId, ref.key);
  return (await suspectedMediaUnderProtection(db, [id], now)).has(id);
}
