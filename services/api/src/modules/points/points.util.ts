import { Prisma } from '@prisma/client';
import { PointsSource } from './points.constants';

// sprint-2/contest-data-model-backend — the single primitive for writing
// to the append-only PointsLedgerEntry table.
//
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
  points: number;
  // Snapshot of the user's represented club at award time. Always
  // undefined today (Decision Log #74/#128 — the field doesn't exist);
  // wired through so award sites need no signature change when it lands.
  clubId?: string | null;
  // Defaults to now(). Passed explicitly where the "real" event time
  // differs from the write time (e.g. a post's own createdAt).
  occurredAt?: Date;
}

// Idempotent: PointsLedgerEntry has @@unique([source, refId, userId]), so
// a second award for the same (source, refId, user) — a re-like of a
// post already liked once, or re-running round judging — is swallowed as
// a no-op rather than double-paying or throwing. Returns true if a row
// was actually written, false if it was a duplicate no-op.
export async function awardPoints(
  tx: Prisma.TransactionClient,
  input: AwardPointsInput,
): Promise<boolean> {
  try {
    await tx.pointsLedgerEntry.create({
      data: {
        userId: input.userId,
        source: input.source,
        refId: input.refId,
        points: input.points,
        clubId: input.clubId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}
