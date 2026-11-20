-- AlterTable
ALTER TABLE "MatchData" ADD COLUMN     "boxScore" JSONB,
ADD COLUMN     "boxScoreUpdatedAt" TIMESTAMP(3);
