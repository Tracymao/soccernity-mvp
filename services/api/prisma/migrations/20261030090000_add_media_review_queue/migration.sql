-- backend/w15-media-review-queue (B-037; Decision Log #419 item 4).
-- Purely additive: four nullable/defaulted columns on "PostMedia" and one new table "PostMediaReport".
-- No existing column or row is altered.
--
-- ROLLBACK (manual):
--   DROP TABLE "PostMediaReport";
--   ALTER TABLE "PostMedia" DROP COLUMN "reviewEnteredAt", DROP COLUMN "reviewEntrySource",
--     DROP COLUMN "reportCount", DROP COLUMN "hiddenPendingReview";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back loses the queue bookkeeping and every user report; it does not change any PostMedia
-- status, so no already-approved or rejected file changes visibility.

-- AlterTable
ALTER TABLE "PostMedia" ADD COLUMN "reviewEnteredAt" TIMESTAMP(3),
ADD COLUMN "reviewEntrySource" TEXT,
ADD COLUMN "reportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hiddenPendingReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PostMediaReport" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PostMediaReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostMedia_reviewEnteredAt_idx" ON "PostMedia"("reviewEnteredAt");

-- CreateIndex
CREATE INDEX "PostMedia_reportCount_idx" ON "PostMedia"("reportCount");

-- CreateIndex
CREATE INDEX "PostMediaReport_createdAt_idx" ON "PostMediaReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostMediaReport_mediaId_reporterId_key" ON "PostMediaReport"("mediaId", "reporterId");

-- AddForeignKey
ALTER TABLE "PostMediaReport" ADD CONSTRAINT "PostMediaReport_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "PostMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMediaReport" ADD CONSTRAINT "PostMediaReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defence in depth (the application validates all of this).
ALTER TABLE "PostMedia"
  ADD CONSTRAINT "PostMedia_reviewEntrySource_valid" CHECK ("reviewEntrySource" IS NULL OR "reviewEntrySource" IN ('auto_check', 'user_report')),
  ADD CONSTRAINT "PostMedia_reviewEntry_coherent" CHECK (("reviewEnteredAt" IS NULL) = ("reviewEntrySource" IS NULL)),
  ADD CONSTRAINT "PostMedia_reportCount_nonnegative" CHECK ("reportCount" >= 0),
  -- An open report exists only on an approved item (the one thing a user can report), so a hold or a
  -- count on a pending or rejected item is a bug.
  ADD CONSTRAINT "PostMedia_reports_only_on_approved" CHECK ("status" = 'approved' OR ("reportCount" = 0 AND "hiddenPendingReview" = false));
