-- Additive and safe on a populated table: one nullable column, no default, no backfill
-- (existing rooms read as NULL).
-- Rollback: ALTER TABLE "BanterRoom" DROP COLUMN "description";

-- AlterTable
ALTER TABLE "BanterRoom" ADD COLUMN     "description" TEXT;
