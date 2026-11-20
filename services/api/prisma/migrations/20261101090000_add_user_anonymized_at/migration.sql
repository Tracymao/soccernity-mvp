-- backend/w6-purge-anonymised-rows (B-043; Decision Log #375).
-- Purely additive: one nullable column and one index on "User". No existing column or row is altered.
-- NO BACKFILL (the platform is not live): rows anonymised before this migration keep "anonymizedAt" NULL and
-- are never selected by the purge timer.
--
-- ROLLBACK (manual):
--   DROP INDEX "User_accountStatus_anonymizedAt_idx";
--   ALTER TABLE "User" DROP COLUMN "anonymizedAt";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back forgets when each row was anonymised; it changes no account status.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_accountStatus_anonymizedAt_idx" ON "User"("accountStatus", "anonymizedAt");
