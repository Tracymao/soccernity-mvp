-- sprint-1/age-reclassification-sweep (Decision Log #349): append-only audit
-- of isMinor / isUnder16 reclassifications. Purely additive.
CREATE TABLE "AgeReclassificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" BOOLEAN NOT NULL,
    "toValue" BOOLEAN NOT NULL,
    "ageAtChange" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeReclassificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgeReclassificationLog_userId_idx" ON "AgeReclassificationLog"("userId");
CREATE INDEX "AgeReclassificationLog_occurredAt_idx" ON "AgeReclassificationLog"("occurredAt");
