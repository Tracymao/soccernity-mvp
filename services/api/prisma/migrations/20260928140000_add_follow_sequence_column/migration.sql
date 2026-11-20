-- Fixes the same real keyset-pagination bug
-- fix/feed-pagination-tiebreaker (20260928120000) fixed for Post/Comment/
-- SavedPost, now for Follow: users.service.ts's getFollowers/getFollowing
-- tiebroke same-millisecond `createdAt` ties on Follow.id, a random UUID
-- with no relation to insertion order. Purely additive -- no existing
-- column touched, no data migration needed (SERIAL backfills existing
-- rows in their current row order automatically).

-- AlterTable
ALTER TABLE "Follow" ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Follow_sequence_key" ON "Follow"("sequence");
