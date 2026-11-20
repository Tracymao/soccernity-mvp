-- backend/w12-points (B-093; Decision Log #382, #383, #384, #385; docs/contest-spec.md sections 9a-9d).
-- The leaderboard points engine: points are stored in QUARTER-POINT units (1 point = 4 units), the
-- ledger gains the columns that giver/receiver rows, revocation and "post removed" / "account
-- restricted" need, and the leaderboard stores the same exact unit.
--
-- Migrates in place (the platform is not live, but nothing is lost): every existing value is multiplied
-- by 4, so one point stays one point. Additive apart from two column RENAMEs ("points" ->
-- "quarterPoints" on both tables), done so that no reader can mistake a unit for a point.
--
-- ROLLBACK (manual; run in reverse, then delete this migration's row from "_prisma_migrations"):
--   ALTER TABLE "PointsLedgerEntry" DROP CONSTRAINT "PointsLedgerEntry_quarterPoints_nonnegative";
--   DROP INDEX "PointsLedgerEntry_counterpartId_idx";
--   DROP INDEX "PointsLedgerEntry_postId_idx";
--   UPDATE "PointsLedgerEntry" SET "source" = 'engagement_like' WHERE "source" = 'engagement_like_given';
--   ALTER TABLE "PointsLedgerEntry" DROP COLUMN "revokedAt", DROP COLUMN "counterpartId", DROP COLUMN "postId";
--   UPDATE "PointsLedgerEntry" SET "quarterPoints" = "quarterPoints" / 4;
--   ALTER TABLE "PointsLedgerEntry" RENAME COLUMN "quarterPoints" TO "points";
--   UPDATE "LeaderboardEntry" SET "quarterPoints" = "quarterPoints" / 4;
--   ALTER TABLE "LeaderboardEntry" RENAME COLUMN "quarterPoints" TO "points";
-- Rolling back loses every received (0.25) row and every revocation mark: rows with a "_received"
-- source cannot be expressed in whole points and should be deleted before the divide.

-- LeaderboardEntry: points -> quarterPoints (x4). A derived rollup table, recomputed every 15 minutes.
ALTER TABLE "LeaderboardEntry" RENAME COLUMN "points" TO "quarterPoints";
UPDATE "LeaderboardEntry" SET "quarterPoints" = "quarterPoints" * 4;

-- PointsLedgerEntry: points -> quarterPoints (x4), plus the new columns.
ALTER TABLE "PointsLedgerEntry" RENAME COLUMN "points" TO "quarterPoints";
UPDATE "PointsLedgerEntry" SET "quarterPoints" = "quarterPoints" * 4;

ALTER TABLE "PointsLedgerEntry"
  ADD COLUMN "postId" TEXT,
  ADD COLUMN "counterpartId" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3);

-- The old single like source becomes the giver side of the new per-kind sources; its refId already
-- is the Post id.
UPDATE "PointsLedgerEntry"
   SET "source" = 'engagement_like_given', "postId" = "refId"
 WHERE "source" = 'engagement_like';

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_postId_idx" ON "PointsLedgerEntry"("postId");
CREATE INDEX "PointsLedgerEntry_counterpartId_idx" ON "PointsLedgerEntry"("counterpartId");

-- A revoked row is a marked row, never a negative one: a quarter-point count is never negative.
ALTER TABLE "PointsLedgerEntry"
  ADD CONSTRAINT "PointsLedgerEntry_quarterPoints_nonnegative" CHECK ("quarterPoints" >= 0);
