-- backend/b036-avatar-cover-check (build register B-036; Decision Log #411 item 1, #394 A2, #468). Additive only: one
-- new table. Nothing is altered or dropped.
--   * "ProfileImageCheck": the automatic image check's retry state for ONE avatar or cover of one user (primary key
--     "userId" + "kind"). It exists only so a failing check can retry with back-off and then stop, and so an
--     uncertain result is not re-checked forever. "objectKey" ties the row to the stored file it describes: a
--     re-upload has a new key, so a row for an older key is stale and is overwritten. No foreign key on purpose
--     (it holds retry bookkeeping, not content, and is deleted when the account is anonymised).
--   * state 'retry'    -> checked and failed (or claimed); "nextAttemptAt" says when to try again
--     state 'review'   -> checked, result between the thresholds: stays pending for the moderator queue (B-037)
--     state 'gave_up'  -> failed the configured number of times: stays pending for a moderator
-- Rollback (nothing else depends on it):
--   DROP TABLE "ProfileImageCheck";

CREATE TABLE "ProfileImageCheck" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'retry',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),

    CONSTRAINT "ProfileImageCheck_pkey" PRIMARY KEY ("userId", "kind")
);

CREATE INDEX "ProfileImageCheck_state_nextAttemptAt_idx" ON "ProfileImageCheck"("state", "nextAttemptAt");

ALTER TABLE "ProfileImageCheck" ADD CONSTRAINT "ProfileImageCheck_kind_check"
    CHECK ("kind" IN ('avatar', 'cover'));
ALTER TABLE "ProfileImageCheck" ADD CONSTRAINT "ProfileImageCheck_state_check"
    CHECK ("state" IN ('retry', 'review', 'gave_up'));
ALTER TABLE "ProfileImageCheck" ADD CONSTRAINT "ProfileImageCheck_attempts_check"
    CHECK ("attempts" >= 0);
