-- Decision Log #128 -- per-club Leaderboard boards. Purely additive: existing
-- rows get clubId '' (the global board), so no data moves.
ALTER TABLE "LeaderboardEntry" ADD COLUMN "clubId" TEXT NOT NULL DEFAULT '';

DROP INDEX "LeaderboardEntry_userId_period_key";
CREATE UNIQUE INDEX "LeaderboardEntry_userId_period_clubId_key" ON "LeaderboardEntry"("userId", "period", "clubId");
