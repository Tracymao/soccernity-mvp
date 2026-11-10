-- backend/b289-content-removal (build register B-289, Decision Log #483). Additive: six nullable columns and three
-- indexes. A moderator's content_removed is now ENFORCED for a post, a comment or a message: the row and its text
-- stay (evidence), the *RemovedByModerationAt column hides it from every user-facing read. removedByReportId points
-- at the report that removed it; RESTRICT so a report that removed content is never deleted from under it.
-- Rollback: ALTER TABLE "Post" DROP COLUMN "removedByReportId", DROP COLUMN "removedByModerationAt"; (same for
-- "Comment" and "Message"); the indexes and foreign keys go with the columns.
ALTER TABLE "Post" ADD COLUMN "removedByModerationAt" TIMESTAMP(3), ADD COLUMN "removedByReportId" TEXT;
ALTER TABLE "Comment" ADD COLUMN "removedByModerationAt" TIMESTAMP(3), ADD COLUMN "removedByReportId" TEXT;
ALTER TABLE "Message" ADD COLUMN "removedByModerationAt" TIMESTAMP(3), ADD COLUMN "removedByReportId" TEXT;

CREATE INDEX "Post_removedByReportId_idx" ON "Post"("removedByReportId");
CREATE INDEX "Comment_removedByReportId_idx" ON "Comment"("removedByReportId");
CREATE INDEX "Message_removedByReportId_idx" ON "Message"("removedByReportId");

ALTER TABLE "Post" ADD CONSTRAINT "Post_removedByReportId_fkey" FOREIGN KEY ("removedByReportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_removedByReportId_fkey" FOREIGN KEY ("removedByReportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_removedByReportId_fkey" FOREIGN KEY ("removedByReportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
