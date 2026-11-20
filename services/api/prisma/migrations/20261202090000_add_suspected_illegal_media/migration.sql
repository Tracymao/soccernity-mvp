-- backend/suspected-illegal-imagery-path (B-206). Additive: one new table, no change to any existing table.
-- The record of one uploaded file a child-safety-vetted admin set aside as suspected illegal imagery, plus its
-- filing record. No foreign keys on purpose (the record outlives the PostMedia row, post, account and report).
-- Rollback: DROP TABLE "SuspectedIllegalMedia";

-- CreateTable
CREATE TABLE "SuspectedIllegalMedia" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "postId" TEXT,
    "reportId" TEXT,
    "objectKey" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "uploaderCountry" TEXT,
    "uploaderIsMinor" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'set_aside',
    "setAsideByAdminId" TEXT NOT NULL,
    "setAsideAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preserveUntil" TIMESTAMP(3) NOT NULL,
    "decidedByAdminId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "bodyKey" TEXT,
    "bodyOther" TEXT,
    "reference" TEXT,
    "filedAt" TIMESTAMP(3),
    "note" TEXT,
    "notFiledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspectedIllegalMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuspectedIllegalMedia_mediaId_key" ON "SuspectedIllegalMedia"("mediaId");

-- CreateIndex
CREATE INDEX "SuspectedIllegalMedia_status_idx" ON "SuspectedIllegalMedia"("status");

-- CreateIndex
CREATE INDEX "SuspectedIllegalMedia_preserveUntil_idx" ON "SuspectedIllegalMedia"("preserveUntil");

-- CreateIndex
CREATE INDEX "SuspectedIllegalMedia_reportId_idx" ON "SuspectedIllegalMedia"("reportId");

-- CreateIndex
CREATE INDEX "SuspectedIllegalMedia_uploaderId_idx" ON "SuspectedIllegalMedia"("uploaderId");

-- CreateIndex
CREATE INDEX "SuspectedIllegalMedia_postId_idx" ON "SuspectedIllegalMedia"("postId");

-- The status vocabulary, and the filing columns only on a decided record.
ALTER TABLE "SuspectedIllegalMedia" ADD CONSTRAINT "SuspectedIllegalMedia_status_check"
  CHECK ("status" IN ('set_aside', 'filed', 'not_filed'));
ALTER TABLE "SuspectedIllegalMedia" ADD CONSTRAINT "SuspectedIllegalMedia_decision_shape_check"
  CHECK (
    ("status" = 'set_aside' AND "decidedAt" IS NULL AND "decidedByAdminId" IS NULL AND "bodyKey" IS NULL AND "reference" IS NULL AND "notFiledReason" IS NULL)
    OR ("status" = 'filed' AND "decidedAt" IS NOT NULL AND "decidedByAdminId" IS NOT NULL AND "bodyKey" IS NOT NULL AND "reference" IS NOT NULL AND "filedAt" IS NOT NULL AND "notFiledReason" IS NULL)
    OR ("status" = 'not_filed' AND "decidedAt" IS NOT NULL AND "decidedByAdminId" IS NOT NULL AND "notFiledReason" IS NOT NULL AND "bodyKey" IS NULL AND "reference" IS NULL AND "filedAt" IS NULL)
  );
