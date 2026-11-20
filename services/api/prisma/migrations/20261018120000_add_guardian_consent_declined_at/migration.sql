-- B-126 / B-131 (Decision Log #406 items 1 and 11): when a guardian-consent
-- row last became 'declined'. Purely additive: one nullable column and one
-- index. No column is dropped or altered.
ALTER TABLE "Guardian" ADD COLUMN "consentDeclinedAt" TIMESTAMP(3);

CREATE INDEX "Guardian_consentStatus_consentDeclinedAt_idx"
  ON "Guardian"("consentStatus", "consentDeclinedAt");

-- Data backfill (not a schema change). The original decline time of existing
-- rows is not recoverable. Rows that are still REOPENABLE (an explicit decline
-- with fewer than three recorded) are stamped with the migration time, so the
-- stale-decline window starts at deploy rather than never starting. Every other
-- declined row (withdrawal, expiry, the third decline) is on the deletion path
-- and is left NULL.
UPDATE "Guardian"
   SET "consentDeclinedAt" = NOW()
 WHERE "consentStatus" = 'declined'
   AND "consentDeclineSource" = 'guardian_explicit'
   AND "declineCount" < 3;
