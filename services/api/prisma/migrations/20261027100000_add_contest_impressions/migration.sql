-- backend/w11-exposure (B-092; Decision Log #388, #400, #403 item 11, #404 items 6 and 15,
-- #405 items 1 and 7; docs/contest-spec.md section 10b). The impression model behind the
-- Week-4 finalist exposure engine.
--
-- Purely additive: one new table ("ContestImpression", with a unique index and two plain
-- indexes) and one nullable column on "ContestEntry". No existing column, table, constraint
-- or row is altered or dropped; the new column starts NULL.
--
-- ROLLBACK (manual; discards only what this migration adds):
--   DROP TABLE "ContestImpression";
--   ALTER TABLE "ContestEntry" DROP COLUMN "impressionTotal";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back discards every stored impression and every folded per-entry total. The balanced
-- rotation then has no history and starts from zero; entries, votes, tallies and results are
-- untouched.

-- AlterTable
ALTER TABLE "ContestEntry" ADD COLUMN     "impressionTotal" INTEGER;

-- CreateTable
CREATE TABLE "ContestImpression" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestImpression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContestImpression_entryId_idx" ON "ContestImpression"("entryId");

-- CreateIndex
CREATE INDEX "ContestImpression_viewerId_entryId_dayKey_idx" ON "ContestImpression"("viewerId", "entryId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "ContestImpression_viewerId_entryId_eventId_key" ON "ContestImpression"("viewerId", "entryId", "eventId");

-- AddForeignKey
ALTER TABLE "ContestImpression" ADD CONSTRAINT "ContestImpression_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ContestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestImpression" ADD CONSTRAINT "ContestImpression_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defence in depth: the application validates all of this, the database refuses a malformed row
-- from any other writer. dayKey is a London calendar day.
ALTER TABLE "ContestImpression" ADD CONSTRAINT "ContestImpression_dayKey_valid" CHECK ("dayKey" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_impressionTotal_valid" CHECK ("impressionTotal" IS NULL OR "impressionTotal" >= 0);
