-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "consentAutoResentAt" TIMESTAMP(3),
ADD COLUMN     "withdrawalToken" TEXT,
ADD COLUMN     "withdrawalTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_withdrawalToken_key" ON "Guardian"("withdrawalToken");

-- CreateIndex
CREATE INDEX "Guardian_consentStatus_consentTokenExpiresAt_idx" ON "Guardian"("consentStatus", "consentTokenExpiresAt");

