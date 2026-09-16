/*
  Warnings:

  - Added the required column `updatedAt` to the `MatchData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MatchData" ADD COLUMN     "awayScore" INTEGER,
ADD COLUMN     "awayTeamId" TEXT,
ADD COLUMN     "awayTeamLogo" TEXT,
ADD COLUMN     "awayTeamName" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "events" JSONB,
ADD COLUMN     "eventsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "h2h" JSONB,
ADD COLUMN     "h2hUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "highlights" JSONB,
ADD COLUMN     "highlightsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "homeScore" INTEGER,
ADD COLUMN     "homeTeamId" TEXT,
ADD COLUMN     "homeTeamLogo" TEXT,
ADD COLUMN     "homeTeamName" TEXT,
ADD COLUMN     "leagueId" TEXT,
ADD COLUMN     "leagueName" TEXT,
ADD COLUMN     "lineups" JSONB,
ADD COLUMN     "lineupsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "round" TEXT,
ADD COLUMN     "season" TEXT,
ADD COLUMN     "statistics" JSONB,
ADD COLUMN     "statisticsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "statusDetail" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "venue" TEXT;

-- CreateTable
CREATE TABLE "Standing" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "table" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Standing_leagueId_season_key" ON "Standing"("leagueId", "season");

-- CreateIndex
CREATE INDEX "MatchData_kickoffTime_idx" ON "MatchData"("kickoffTime");

-- CreateIndex
CREATE INDEX "MatchData_leagueId_idx" ON "MatchData"("leagueId");

-- CreateIndex
CREATE INDEX "MatchData_status_idx" ON "MatchData"("status");
