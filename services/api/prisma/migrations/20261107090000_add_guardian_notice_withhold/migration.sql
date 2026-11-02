-- backend/b280-withhold-guardian-notices (B-280; Decision Log #458, on #455 / #456).
-- One new table: the "withhold guardian notices" flag on a minor's account. One row per account while the flag is ON;
-- the row is deleted when it is cleared (history lives in "AdminActionLog"). Purely additive: no existing table,
-- column or constraint is touched and no backfill is needed. A table, not columns on "User", so no existing User
-- select or serialiser can leak the flag or its reason.
--
-- ROLLBACK (manual; every active flag is lost, so guardians of those accounts start receiving notices again --
-- record the affected accounts first if that matters):
--   DROP TABLE "GuardianNoticeWithhold";
--   then delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "GuardianNoticeWithhold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setByAdminId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "lastReviewNote" TEXT,

    CONSTRAINT "GuardianNoticeWithhold_pkey" PRIMARY KEY ("id"),
    -- A review time and a review note exist together.
    CONSTRAINT "GuardianNoticeWithhold_review_check" CHECK (("lastReviewedAt" IS NULL) = ("lastReviewNote" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardianNoticeWithhold_userId_key" ON "GuardianNoticeWithhold"("userId");

-- CreateIndex
CREATE INDEX "GuardianNoticeWithhold_setByAdminId_idx" ON "GuardianNoticeWithhold"("setByAdminId");

-- AddForeignKey
ALTER TABLE "GuardianNoticeWithhold" ADD CONSTRAINT "GuardianNoticeWithhold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianNoticeWithhold" ADD CONSTRAINT "GuardianNoticeWithhold_setByAdminId_fkey" FOREIGN KEY ("setByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
