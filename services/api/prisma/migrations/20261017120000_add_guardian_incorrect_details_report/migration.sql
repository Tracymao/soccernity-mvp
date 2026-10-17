-- B-029 (Decision Log #372): "Report incorrect details" flag on the guardian
-- consent request. Purely additive: one nullable column, no backfill, no drop.
ALTER TABLE "Guardian" ADD COLUMN "incorrectDetailsReportedAt" TIMESTAMP(3);
