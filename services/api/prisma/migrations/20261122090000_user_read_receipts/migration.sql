-- backend/b061-read-receipts (build register B-061; Decision Log #472, founder decision 2026-11-08).
-- One additive nullable column. NULL = use the age default (ON adult, OFF under-18), decided at read time.
-- Rollback: ALTER TABLE "User" DROP COLUMN "readReceipts";
ALTER TABLE "User" ADD COLUMN "readReceipts" BOOLEAN;
