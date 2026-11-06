-- backend/email-change (build register B-059; Decision Log #472 adopted default (f)).
-- Additive only: one new table, nothing altered or dropped, nothing backfilled.
--   * "EmailChangeRequest": a pending request to change a user's email. The emailed secret is stored only as a
--     SHA-256 hash ("tokenHash", unique). "usedAt" is set in the transaction that changes "User"."email".
--   * FK to "User" with ON DELETE CASCADE (like the other per-account credential rows).
-- Rollback (nothing else depends on it):
--   DROP TABLE "EmailChangeRequest";

CREATE TABLE "EmailChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailChangeRequest_tokenHash_key" ON "EmailChangeRequest"("tokenHash");

CREATE INDEX "EmailChangeRequest_userId_idx" ON "EmailChangeRequest"("userId");

ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
