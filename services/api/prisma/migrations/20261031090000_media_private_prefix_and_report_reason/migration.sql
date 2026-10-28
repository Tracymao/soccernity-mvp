-- backend/media-privacy-vetting-followups (B-257, B-259; Decision Log #430 items 2 and 4).
-- Purely additive: two nullable columns on "PostMedia" (a private object key and a "published" timestamp)
-- and one nullable column on "PostMediaReport" (the reporter's optional reason). No existing column or
-- row is altered, and the platform is not live, so no existing object is moved.
--
-- ROLLBACK (manual):
--   ALTER TABLE "PostMedia" DROP COLUMN "privateKey", DROP COLUMN "publishedAt";
--   ALTER TABLE "PostMediaReport" DROP COLUMN "reason";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back forgets where each processed file is stored (the objects stay in the bucket) and drops every
-- report reason; it does not change any PostMedia status.

-- AlterTable
ALTER TABLE "PostMedia" ADD COLUMN "privateKey" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PostMediaReport" ADD COLUMN "reason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_privateKey_key" ON "PostMedia"("privateKey");

-- CreateIndex (the reconciler and the unattached purge scan by these)
CREATE INDEX "PostMedia_publishedAt_idx" ON "PostMedia"("publishedAt");
