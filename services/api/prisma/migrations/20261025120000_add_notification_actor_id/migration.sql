-- backend/notification-actor-id (Decision Log #412 item 1, #411 item 5, #290).
-- Purely additive: one nullable column and one index on "Notification". No existing
-- column or table is altered or dropped. No backfill: the platform is not live, so no
-- like/comment row without an actor exists in any real environment (a row that did
-- predate this column would simply stay NULL and stay visible, as before).
--
-- ROLLBACK (manual, no data loss outside what this migration adds):
--   DROP INDEX "Notification_userId_actorId_idx";
--   ALTER TABLE "Notification" DROP COLUMN "actorId";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back discards only the actor attribution of like/comment rows.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actorId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_actorId_idx" ON "Notification"("userId", "actorId");
