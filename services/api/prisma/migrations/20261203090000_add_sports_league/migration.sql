-- Rollback: DROP TABLE "SportsLeague";
CREATE TABLE "SportsLeague" (
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryName" TEXT,
    "countryCode" TEXT,
    "logo" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SportsLeague_pkey" PRIMARY KEY ("leagueId")
);
