-- backend/b284-report-reason-categories (Decision Log #465, B-284).
-- Additive: one nullable column on "Report". No backfill (existing reports stay NULL = not categorised).
-- Rollback: ALTER TABLE "Report" DROP COLUMN "reasonCategory";
ALTER TABLE "Report" ADD COLUMN "reasonCategory" TEXT;
