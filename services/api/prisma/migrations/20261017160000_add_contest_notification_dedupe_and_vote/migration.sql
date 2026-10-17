-- backend/w3c-contest-notifications (B-122, Decision Log #404 item 16). Purely additive: one nullable column + its unique index
-- (the scheduled Contest fan-out's idempotency key) and one new table (the minimal vote fact the votes-closing reminder reads).

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "ContestVote" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContestVote_entryId_idx" ON "ContestVote"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestVote_roundId_voterId_key" ON "ContestVote"("roundId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- AddForeignKey
ALTER TABLE "ContestVote" ADD CONSTRAINT "ContestVote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ContestRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestVote" ADD CONSTRAINT "ContestVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestVote" ADD CONSTRAINT "ContestVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ContestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

