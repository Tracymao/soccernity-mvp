-- backend/w6-username-cover-block (B-196; Decision Log #411 item 4, #371, #394 A2).
-- Purely additive: three nullable columns on "User" and two CHECK constraints, the
-- same shape as the avatar columns (migration 20261020151920). No existing column
-- or table is altered or dropped.
--
-- ROLLBACK (manual, no data loss outside what this migration adds):
--   ALTER TABLE "User"
--     DROP CONSTRAINT "User_cover_coherent", DROP CONSTRAINT "User_coverStatus_valid",
--     DROP COLUMN "coverKey", DROP COLUMN "coverStatus", DROP COLUMN "coverUrl";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back discards every stored cover reference; a cover OBJECT already
-- uploaded stays in the bucket (delete it by key first if that matters).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "coverStatus" TEXT,
ADD COLUMN     "coverUrl" TEXT;

-- Defence in depth: the application validates all of this, the database refuses
-- a malformed row from any other writer.
-- The cover columns move together: all NULL (no cover) or all set.
ALTER TABLE "User" ADD CONSTRAINT "User_cover_coherent" CHECK (
  ("coverUrl" IS NULL AND "coverKey" IS NULL AND "coverStatus" IS NULL)
  OR ("coverUrl" IS NOT NULL AND "coverKey" IS NOT NULL AND "coverStatus" IS NOT NULL)
);
ALTER TABLE "User" ADD CONSTRAINT "User_coverStatus_valid" CHECK (
  "coverStatus" IS NULL OR "coverStatus" IN ('pending', 'approved', 'rejected')
);
