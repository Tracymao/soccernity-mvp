-- backend/w7-contest (B-091; Decision Log #381, #386, #387, #399, #400, #404, #405, #406).
--
-- The Contest stops being admin-judged and runs itself on the fixed Europe/London calendar
-- (docs/contest-spec.md). PURELY ADDITIVE: new nullable / defaulted columns, two new tables,
-- indexes and CHECK constraints. No existing column is altered, dropped or backfilled, so every
-- legacy admin-judged cycle (monthKey NULL) is untouched and keeps working as a read-only record.
--
-- ROLLBACK (run in this order; safe because nothing outside this PR reads the new objects, and the
-- rows in them are derived data):
--   ALTER TABLE "ContestRound" DROP CONSTRAINT "ContestRound_week_and_limit_check";
--   ALTER TABLE "ContestCycle" DROP CONSTRAINT "ContestCycle_new_model_invariants_check";
--   DROP TABLE "ContestEngagement";
--   DROP TABLE "ContestVoteEvent";
--   DROP INDEX "ContestEntry_cycleId_idx";
--   ALTER TABLE "ContestEntry" DROP COLUMN "phase1Tally", DROP COLUMN "phase1Rank", DROP COLUMN "qualified",
--     DROP COLUMN "finalTally", DROP COLUMN "finalRank", DROP COLUMN "pinnedUntil", DROP COLUMN "pinRemovedAt";
--   ALTER TABLE "ContestRound" DROP COLUMN "task", DROP COLUMN "viewWatchLimitSeconds", DROP COLUMN "forfeited",
--     DROP COLUMN "forfeitReason", DROP COLUMN "phase1ClosedAt";
--   DROP INDEX "ContestCycle_monthKey_key";
--   ALTER TABLE "ContestCycle" DROP COLUMN "monthKey", DROP COLUMN "description", DROP COLUMN "minimumTally",
--     DROP COLUMN "weeklyPoints1", DROP COLUMN "weeklyPoints2", DROP COLUMN "weeklyPoints3",
--     DROP COLUMN "monthlyPoints1", DROP COLUMN "monthlyPoints2", DROP COLUMN "monthlyPoints3",
--     DROP COLUMN "followersExcludedWeek4", DROP COLUMN "exposureTolerancePercent", DROP COLUMN "exposureViewerDailyCap",
--     DROP COLUMN "finalistsSelectedAt", DROP COLUMN "revealedAt", DROP COLUMN "pinsRemovedAt", DROP COLUMN "noWinner";
--   ALTER TABLE "Post" DROP COLUMN "visibleFrom", DROP COLUMN "communityFeedFrom";
-- (Rolling back while a new-model contest is mid-month discards its configuration: do it only before
-- the first contest is created.)

-- ---- ContestCycle ---------------------------------------------------------------------------
ALTER TABLE "ContestCycle"
  ADD COLUMN "monthKey" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "minimumTally" INTEGER,
  ADD COLUMN "weeklyPoints1" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "weeklyPoints2" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "weeklyPoints3" INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN "monthlyPoints1" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN "monthlyPoints2" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "monthlyPoints3" INTEGER NOT NULL DEFAULT 600,
  ADD COLUMN "followersExcludedWeek4" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "exposureTolerancePercent" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "exposureViewerDailyCap" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "finalistsSelectedAt" TIMESTAMP(3),
  ADD COLUMN "revealedAt" TIMESTAMP(3),
  ADD COLUMN "pinsRemovedAt" TIMESTAMP(3),
  ADD COLUMN "noWinner" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "ContestCycle_monthKey_key" ON "ContestCycle"("monthKey");

-- A new-model cycle (monthKey set) must satisfy the spec's validation ranges (section 4, #399 E5).
-- Legacy rows (monthKey NULL) are exempt: they pre-date every one of these rules.
ALTER TABLE "ContestCycle" ADD CONSTRAINT "ContestCycle_new_model_invariants_check" CHECK (
  "monthKey" IS NULL OR (
    "monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND char_length("title") BETWEEN 1 AND 80
    AND "minimumTally" IS NOT NULL AND "minimumTally" >= 1
    AND "exposureTolerancePercent" BETWEEN 1 AND 50
    AND "exposureViewerDailyCap" BETWEEN 1 AND 50
    AND "weeklyPoints1" >= 0 AND "weeklyPoints2" >= 0 AND "weeklyPoints3" >= 0
    AND "monthlyPoints1" >= 0 AND "monthlyPoints2" >= 0 AND "monthlyPoints3" >= 0
  )
);

-- ---- ContestRound ---------------------------------------------------------------------------
ALTER TABLE "ContestRound"
  ADD COLUMN "task" TEXT,
  ADD COLUMN "viewWatchLimitSeconds" INTEGER,
  ADD COLUMN "forfeited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "forfeitReason" TEXT,
  ADD COLUMN "phase1ClosedAt" TIMESTAMP(3);

ALTER TABLE "ContestRound" ADD CONSTRAINT "ContestRound_week_and_limit_check" CHECK (
  "weekNumber" BETWEEN 1 AND 4
  AND ("viewWatchLimitSeconds" IS NULL OR "viewWatchLimitSeconds" BETWEEN 3 AND 120)
);

-- ---- ContestEntry ---------------------------------------------------------------------------
ALTER TABLE "ContestEntry"
  ADD COLUMN "phase1Tally" INTEGER,
  ADD COLUMN "phase1Rank" INTEGER,
  ADD COLUMN "qualified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "finalTally" INTEGER,
  ADD COLUMN "finalRank" INTEGER,
  ADD COLUMN "pinnedUntil" TIMESTAMP(3),
  ADD COLUMN "pinRemovedAt" TIMESTAMP(3);

CREATE INDEX "ContestEntry_cycleId_idx" ON "ContestEntry"("cycleId");

-- ---- Post -----------------------------------------------------------------------------------
ALTER TABLE "Post"
  ADD COLUMN "visibleFrom" TIMESTAMP(3),
  ADD COLUMN "communityFeedFrom" TIMESTAMP(3);

-- ---- ContestVoteEvent (append-only history of casts and retractions) ------------------------
CREATE TABLE "ContestVoteEvent" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "voterId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContestVoteEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContestVoteEvent_action_check" CHECK ("action" IN ('cast', 'retract'))
);

CREATE INDEX "ContestVoteEvent_roundId_voterId_occurredAt_idx"
  ON "ContestVoteEvent"("roundId", "voterId", "occurredAt");

-- ---- ContestEngagement (qualifying engagement on contest entries) ---------------------------
CREATE TABLE "ContestEngagement" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "followedAtEngagement" BOOLEAN NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContestEngagement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContestEngagement_kind_check" CHECK ("kind" IN ('like', 'comment', 'view'))
);

CREATE UNIQUE INDEX "ContestEngagement_entryId_userId_kind_key"
  ON "ContestEngagement"("entryId", "userId", "kind");
CREATE INDEX "ContestEngagement_entryId_occurredAt_idx"
  ON "ContestEngagement"("entryId", "occurredAt");

ALTER TABLE "ContestEngagement"
  ADD CONSTRAINT "ContestEngagement_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "ContestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContestEngagement"
  ADD CONSTRAINT "ContestEngagement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
