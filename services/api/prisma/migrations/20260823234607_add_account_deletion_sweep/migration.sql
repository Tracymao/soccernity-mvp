-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingDeletionAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConsentAuditRecord" (
    "id" TEXT NOT NULL,
    "minorUserId" TEXT NOT NULL,
    "consentStatus" TEXT NOT NULL,
    "consentConfirmedAt" TIMESTAMP(3),
    "consentMethod" TEXT NOT NULL DEFAULT 'guardian-consent-link',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentAuditRecord_createdAt_idx" ON "ConsentAuditRecord"("createdAt");

-- CreateIndex
CREATE INDEX "User_accountStatus_pendingDeletionAt_idx" ON "User"("accountStatus", "pendingDeletionAt");
