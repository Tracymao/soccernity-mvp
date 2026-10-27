import { Prisma } from '@prisma/client';
import { PointsSource } from './points.constants';

// sprint-2/contest-data-model-backend — the primitive for writing a ONE-OFF row to the append-only
// PointsLedgerEntry table: the contest placement prizes (ContestLifecycleService). The everyday giver/
// receiver engagement rows (backend/w12-points) have their own, richer path with caps and revocation:
// engagement-points.util.ts. Both write quarter-point units.
// A plain function, not a NestJS service, deliberately: it is called from
// FeedService (post create, like), UsersService (follow) and
// ContestService (weekly wins, crown) — a shared *service* would force
// FeedModule/UsersModule to import a PointsModule for a one-line write.
// This mirrors the exact precedent set by the notification wiring
// (`tx.notification.create(...)` written directly inside FeedService /
// UsersService's own transaction callbacks, no NotificationService), and
// by cursor.util.ts (a shared stateless util, not a provider).
//
// Always called with a transaction client (`Prisma.TransactionClient`) —
// every award site already runs inside a $transaction so the points row
// lands atomically with the thing it's paying for (the Like row, the
// Follow row, the ContestRoundWinner rows). If the surrounding
// transaction rolls back, so does the award.

export interface AwardPointsInput {
  userId: string;
  source: PointsSource;
  // The domain row this award is for — a Post id, a ContestRound id or a
  // ContestCycle id, depending on source. See PointsLedgerEntry.refId.
  refId: string;
  // QUARTER-POINT units (backend/w12-points): 1 point = 4 units, see quarter-points.util.ts.
  quarterPoints: number;
  // Snapshot of the user's represented club at award time (Decision Log
  // #128). Left undefined by every award site: awardPoints reads
  // User.representedClubId inside the same transaction. Passed explicitly
  // only by a caller that already knows the club to attribute to.
  clubId?: string | null;
  // Defaults to now(). Passed explicitly where the "real" event time
  // differs from the write time (e.g. a post's own createdAt).
  occurredAt?: Date;
}

// Idempotent: PointsLedgerEntry has @@unique([source, refId, userId]), so
// a second award for the same (source, refId, user) -- a re-like of a
// post already liked once, or re-running round judging -- is swallowed as
// a no-op rather than double-paying or throwing. Returns true if a row
// was actually written, false if it was a duplicate no-op.
//
// IMPLEMENTATION NOTE (backend/w7-contest): this used to be `create()` inside a
// try/catch that swallowed P2002. That is WRONG inside a transaction: a failed
// statement aborts the whole Postgres transaction, so the caller's later statements
// and its COMMIT silently became a ROLLBACK -- a like -> unlike -> re-like returned
// 200 `liked: true` but wrote no Like row and moved no counter (found by the Contest
// e2e: the re-liked entry never re-counted). `createMany({ skipDuplicates: true })`
// is `INSERT ... ON CONFLICT DO NOTHING`: a duplicate is a no-op that does NOT abort
// the transaction. Every call site runs inside a $transaction, so this is the only
// correct form.
export async function awardPoints(
  tx: Prisma.TransactionClient,
  input: AwardPointsInput,
): Promise<boolean> {
  const clubId =
    input.clubId !== undefined
      ? input.clubId
      : ((await tx.user.findUnique({ where: { id: input.userId }, select: { representedClubId: true } }))
          ?.representedClubId ?? null);
  const result = await tx.pointsLedgerEntry.createMany({
    data: [
      {
        userId: input.userId,
        source: input.source,
        refId: input.refId,
        quarterPoints: input.quarterPoints,
        clubId,
        occurredAt: input.occurredAt ?? new Date(),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}
