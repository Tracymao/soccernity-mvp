-- backend/b053-leaderboard-periods (B-053, Decision Log #472).
-- Additive: one nullable column on LeaderboardEntry. NULL = "not on that board seven days earlier" (or
-- not computed yet); existing rows stay NULL until the next history rollup tick fills them in.
--
-- Rollback:
--   ALTER TABLE "LeaderboardEntry" DROP COLUMN "rankSevenDaysAgo";
ALTER TABLE "LeaderboardEntry" ADD COLUMN "rankSevenDaysAgo" INTEGER;
