-- backend/b291-suspension-on-report (build register B-291, Decision Log #485). Additive: one nullable column, one
-- index, one foreign key. User.suspendedByReportId records the report whose user_suspended action suspended the
-- account, so only that report's overturned appeal reinstates it. ON DELETE SET NULL: the report-retention sweep
-- will later delete reports, and a deleted report must not block that or leave a dangling pointer.
-- Rollback: ALTER TABLE "User" DROP COLUMN "suspendedByReportId"; (the index and foreign key go with the column).
ALTER TABLE "User" ADD COLUMN "suspendedByReportId" TEXT;

CREATE INDEX "User_suspendedByReportId_idx" ON "User"("suspendedByReportId");

ALTER TABLE "User" ADD CONSTRAINT "User_suspendedByReportId_fkey" FOREIGN KEY ("suspendedByReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
