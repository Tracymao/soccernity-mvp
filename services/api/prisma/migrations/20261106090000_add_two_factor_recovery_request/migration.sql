-- backend/b276-two-factor-recovery (B-276; Decision Log #455, #456).
-- One new table for user two-factor recovery requests (lost device AND backup codes). Purely additive: no existing
-- table, column or constraint is touched and no backfill is needed.
--
-- Link and cancel tokens are stored only as SHA-256 hashes. `kind` is 'adult' | 'guardian'; `state` is one of the
-- values in the CHECK below. At most ONE request per account is active (pending or waiting): the partial unique
-- index at the end, which Prisma's schema language cannot express (it is documented on the model).
--
-- ROLLBACK (manual; open recovery requests are lost, nothing else is affected):
--   DROP TABLE "TwoFactorRecoveryRequest";
--   then delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "TwoFactorRecoveryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "linkTokenHash" TEXT NOT NULL,
    "cancelTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "executeAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "TwoFactorRecoveryRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TwoFactorRecoveryRequest_kind_check" CHECK ("kind" IN ('adult', 'guardian')),
    CONSTRAINT "TwoFactorRecoveryRequest_state_check" CHECK ("state" IN ('pending', 'waiting', 'done', 'cancelled', 'declined', 'superseded')),
    -- A waiting request has a confirm time and an execute time; an ended one has an end time.
    CONSTRAINT "TwoFactorRecoveryRequest_waiting_check" CHECK ("state" <> 'waiting' OR ("confirmedAt" IS NOT NULL AND "executeAt" IS NOT NULL)),
    CONSTRAINT "TwoFactorRecoveryRequest_ended_check" CHECK ("state" IN ('pending', 'waiting') OR "doneAt" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryRequest_userId_idx" ON "TwoFactorRecoveryRequest"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryRequest_state_executeAt_idx" ON "TwoFactorRecoveryRequest"("state", "executeAt");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryRequest_state_doneAt_idx" ON "TwoFactorRecoveryRequest"("state", "doneAt");

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryRequest" ADD CONSTRAINT "TwoFactorRecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one ACTIVE (pending or waiting) request per account. Not expressible in schema.prisma.
CREATE UNIQUE INDEX "TwoFactorRecoveryRequest_one_active_per_user" ON "TwoFactorRecoveryRequest"("userId") WHERE "state" IN ('pending', 'waiting');
