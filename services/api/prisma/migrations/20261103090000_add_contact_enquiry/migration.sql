-- backend/w7-contact-us-enquiry (B-046; Decision Log #440, #444, founder decisions 2026-10-30).
-- Purely additive: one new table with its indexes, foreign keys and CHECK constraints. No existing table,
-- column or row is altered. All three foreign keys are RESTRICT (an escalated enquiry must never be
-- silently un-escalated, and a User row is never deleted from under an enquiry).
--
-- CHECKs (the application also validates; these are the backstop):
--   category is one of the six Contact Us categories.
--   status is new or handled.
--   handledAt and handledByAdminId are both NULL (not handled) or both set (handled).
--
-- ROLLBACK (manual):
--   DROP TABLE "ContactEnquiry";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back deletes every stored enquiry, so roll back only together with the code that reads them.

-- CreateTable
CREATE TABLE "ContactEnquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledByAdminId" TEXT,
    "escalatedReportId" TEXT,

    CONSTRAINT "ContactEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactEnquiry_lastMessageAt_idx" ON "ContactEnquiry"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ContactEnquiry_userId_idx" ON "ContactEnquiry"("userId");

-- CreateIndex
CREATE INDEX "ContactEnquiry_status_createdAt_idx" ON "ContactEnquiry"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_handledByAdminId_fkey" FOREIGN KEY ("handledByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_escalatedReportId_fkey" FOREIGN KEY ("escalatedReportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (not expressible in schema.prisma; same practice as earlier migrations)
ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_category_check"
  CHECK ("category" IN ('technical_issues', 'editorial_complaints', 'data', 'livescores_issues', 'suggestions', 'enquiries_feedback'));

ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_status_check"
  CHECK ("status" IN ('new', 'handled'));

ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_handled_together_check"
  CHECK (
    ("handledAt" IS NULL AND "handledByAdminId" IS NULL)
    OR ("handledAt" IS NOT NULL AND "handledByAdminId" IS NOT NULL)
  );
