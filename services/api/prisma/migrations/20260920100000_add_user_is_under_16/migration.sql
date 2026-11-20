-- sprint-1/under-16-restrictions: derived under-16 tier, layered on isMinor.
ALTER TABLE "User" ADD COLUMN "isUnder16" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing accounts from the declared date of birth (same source
-- isMinor was originally derived from).
UPDATE "User" SET "isUnder16" = true
WHERE "dateOfBirth" IS NOT NULL AND "dateOfBirth" > (CURRENT_DATE - INTERVAL '16 years');
