-- backend/b292-staff-recorded-appeal (B-292, Decision Log #485 (f), #492). Additive: one nullable column, an index
-- and a foreign key, the same style and ON DELETE SET NULL as Report.reviewedByAdminId. NULL = the person appealed
-- themselves.
--
-- Rollback:
--   ALTER TABLE "Report" DROP CONSTRAINT "Report_appealRecordedByAdminId_fkey";
--   DROP INDEX "Report_appealRecordedByAdminId_idx";
--   ALTER TABLE "Report" DROP COLUMN "appealRecordedByAdminId";

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "appealRecordedByAdminId" TEXT;

-- CreateIndex
CREATE INDEX "Report_appealRecordedByAdminId_idx" ON "Report"("appealRecordedByAdminId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_appealRecordedByAdminId_fkey" FOREIGN KEY ("appealRecordedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
