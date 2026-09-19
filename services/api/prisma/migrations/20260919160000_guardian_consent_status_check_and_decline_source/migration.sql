-- Decision Log #338. Purely additive: one nullable column plus two CHECK
-- constraints; no existing column, row or index is altered. Existing rows
-- only ever hold pending|confirmed|declined, and consentDeclineSource is NULL
-- for all of them, so both constraints validate cleanly.

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "consentDeclineSource" TEXT;

-- Prisma cannot model CHECK constraints; deliberately not a Prisma enum.
ALTER TABLE "Guardian"
  ADD CONSTRAINT "Guardian_consentStatus_check"
  CHECK ("consentStatus" IN ('pending', 'confirmed', 'declined'));

ALTER TABLE "Guardian"
  ADD CONSTRAINT "Guardian_consentDeclineSource_check"
  CHECK ("consentDeclineSource" IS NULL
    OR "consentDeclineSource" IN ('guardian_explicit', 'guardian_withdrawal', 'expiry_timeout'));
