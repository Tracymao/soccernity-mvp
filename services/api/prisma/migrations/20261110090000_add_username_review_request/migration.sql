-- backend/b139-username-review (build register B-139 part (c); Decision Log #467, founder decision 2026-11-03).
-- Additive only: one nullable column on "RevokedUsername" and one new table. Nothing is altered or dropped.
--   * "RevokedUsername"."revokedByAdminId": the admin who revoked, so the review route can keep "a DIFFERENT admin
--     decides". Nullable, NO backfill: rows written before this column read the revoker from the
--     'user.username_revoked' AdminActionLog row at run time (see username-review/revoker.util.ts).
--   * "UsernameReviewRequest": one request per revocation ("revokedUsernameId" is unique); deleted by cascade with
--     its "RevokedUsername" record.
-- Rollback (nothing else depends on either):
--   DROP TABLE "UsernameReviewRequest";
--   ALTER TABLE "RevokedUsername" DROP COLUMN "revokedByAdminId";

ALTER TABLE "RevokedUsername" ADD COLUMN "revokedByAdminId" TEXT;

CREATE TABLE "UsernameReviewRequest" (
    "id" TEXT NOT NULL,
    "revokedUsernameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,

    CONSTRAINT "UsernameReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsernameReviewRequest_revokedUsernameId_key" ON "UsernameReviewRequest"("revokedUsernameId");
CREATE INDEX "UsernameReviewRequest_status_createdAt_idx" ON "UsernameReviewRequest"("status", "createdAt");
CREATE INDEX "UsernameReviewRequest_userId_idx" ON "UsernameReviewRequest"("userId");

ALTER TABLE "UsernameReviewRequest" ADD CONSTRAINT "UsernameReviewRequest_revokedUsernameId_fkey"
    FOREIGN KEY ("revokedUsernameId") REFERENCES "RevokedUsername"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The vocabulary and the shape the application relies on, enforced in the database too.
ALTER TABLE "UsernameReviewRequest" ADD CONSTRAINT "UsernameReviewRequest_status_check"
    CHECK ("status" IN ('pending', 'reinstated', 'declined'));
ALTER TABLE "UsernameReviewRequest" ADD CONSTRAINT "UsernameReviewRequest_message_length_check"
    CHECK ("message" IS NULL OR (char_length("message") BETWEEN 1 AND 500));
-- A pending request has no decision; a decided one has both when and by whom.
ALTER TABLE "UsernameReviewRequest" ADD CONSTRAINT "UsernameReviewRequest_decision_check"
    CHECK (
      ("status" = 'pending' AND "decidedAt" IS NULL AND "decidedByAdminId" IS NULL)
      OR ("status" <> 'pending' AND "decidedAt" IS NOT NULL AND "decidedByAdminId" IS NOT NULL)
    );
