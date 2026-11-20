-- B-102 / B-110 (Decision Log #389, #395 B2, #402, #403 items 2 and 15):
-- per-account guardian decline counter. Purely additive: one NOT NULL column
-- with a constant default (existing rows get 0) plus a CHECK that it can
-- never go negative. No column is dropped or altered.
ALTER TABLE "Guardian" ADD COLUMN "declineCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Guardian"
  ADD CONSTRAINT "Guardian_declineCount_nonnegative" CHECK ("declineCount" >= 0);

-- Data backfill (not a schema change): a row already declined by an explicit
-- guardian decline before this counter existed had, by definition, been
-- declined once. Counting it keeps "three in total, ever" honest if such an
-- account is ever reopened (for example an admin moving a pending_deletion
-- account back to active). The only effect on live behaviour is nil: these
-- rows' accounts were closed (pending_deletion) by the old terminal decline.
UPDATE "Guardian"
   SET "declineCount" = 1
 WHERE "consentStatus" = 'declined'
   AND "consentDeclineSource" = 'guardian_explicit';
