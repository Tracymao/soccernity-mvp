-- CreateTable
CREATE TABLE "ContestCycle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "finalOpenedAt" TIMESTAMP(3),
    "crownedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestRound" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "judgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestEntry" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestRoundWinner" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestRoundWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestStanding" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestStanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "clubId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContestCycle_status_idx" ON "ContestCycle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContestRound_cycleId_weekNumber_key" ON "ContestRound"("cycleId", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_postId_key" ON "ContestEntry"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_roundId_userId_key" ON "ContestEntry"("roundId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestRoundWinner_entryId_key" ON "ContestRoundWinner"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestStanding_cycleId_userId_key" ON "ContestStanding"("cycleId", "userId");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_userId_occurredAt_idx" ON "PointsLedgerEntry"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointsLedgerEntry_source_refId_userId_key" ON "PointsLedgerEntry"("source", "refId", "userId");

-- AddForeignKey
ALTER TABLE "ContestRound" ADD CONSTRAINT "ContestRound_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ContestCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ContestCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ContestRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRoundWinner" ADD CONSTRAINT "ContestRoundWinner_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ContestRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRoundWinner" ADD CONSTRAINT "ContestRoundWinner_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ContestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRoundWinner" ADD CONSTRAINT "ContestRoundWinner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStanding" ADD CONSTRAINT "ContestStanding_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ContestCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStanding" ADD CONSTRAINT "ContestStanding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
