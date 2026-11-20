-- backend/b286-message-report-context (build register B-286, Decision Log #477). Additive: one new table.
-- Messages a reporter attached as context to a 'message' report. messageId is RESTRICT on purpose (evidence is never
-- deleted from under a report); deleting a Report removes its rows.
-- Rollback: DROP TABLE "ReportContextMessage";
CREATE TABLE "ReportContextMessage" (
    "reportId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportContextMessage_pkey" PRIMARY KEY ("reportId","messageId")
);

CREATE INDEX "ReportContextMessage_messageId_idx" ON "ReportContextMessage"("messageId");

ALTER TABLE "ReportContextMessage" ADD CONSTRAINT "ReportContextMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportContextMessage" ADD CONSTRAINT "ReportContextMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
