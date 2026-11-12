-- backend/b300-contest-entry-removal (Decision Log #488). Additive only.
--   ContestCycle.finalistsFrozenAt + table ContestFinalist: the finalist set frozen when Week 4 opens.
--   PointsLedgerEntry.revokedForRemovalAt: marks the baseline rows a moderator's content_removed revoked,
--   so an overturned appeal restores exactly those.
--   ContestVoteEvent_action_check widened to allow 'release' and 'restore' (votes freed by a removal and given back).
-- Rollback (nothing else depends on these):
--   DROP TABLE "ContestFinalist";
--   ALTER TABLE "ContestCycle" DROP COLUMN "finalistsFrozenAt";
--   ALTER TABLE "PointsLedgerEntry" DROP COLUMN "revokedForRemovalAt";
--   (and, once no 'release'/'restore' event rows exist: restore the old CHECK, IN ('cast', 'retract'))
-- No backfill: this is not live data, and a cycle that already passed Week 4 opening has no frozen set,
-- so its finalists keep being derived from its weekly winners.

-- AlterTable
ALTER TABLE "ContestCycle" ADD COLUMN     "finalistsFrozenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PointsLedgerEntry" ADD COLUMN     "revokedForRemovalAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContestFinalist" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestFinalist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContestFinalist_cycleId_userId_key" ON "ContestFinalist"("cycleId", "userId");

-- AddForeignKey
ALTER TABLE "ContestFinalist" ADD CONSTRAINT "ContestFinalist_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ContestCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestFinalist" ADD CONSTRAINT "ContestFinalist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vote event vocabulary: 'release' (a removal freed the vote) and 'restore' (an overturned appeal returned it).
ALTER TABLE "ContestVoteEvent" DROP CONSTRAINT "ContestVoteEvent_action_check";
ALTER TABLE "ContestVoteEvent" ADD CONSTRAINT "ContestVoteEvent_action_check" CHECK ("action" IN ('cast', 'retract', 'release', 'restore'));
