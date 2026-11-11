-- backend/b299-report-retention-6-7-years (B-299; Decision Log #490, #493).
-- When the report retention job deletes a report, the AccountHold rows that point at it are DETACHED
-- (reportId set to NULL; the rows themselves stay: a hold is audit evidence). A bad_faith hold is always
-- placed with a report, so the original shape CHECK ("bad_faith" requires "reportId" IS NOT NULL) would refuse
-- that update. Only that one CHECK is replaced: a bad_faith hold must still have an expiresAt, a legal_hold must
-- still have none. The application still always sets reportId when it places a hold; NULL appears only after
-- a purge. No column, index or foreign key changes and no rows are touched.
--
-- ROLLBACK (manual): any bad_faith row whose reportId was detached cannot satisfy the old CHECK; those rows must
-- be deleted first (they are expired history), then the old CHECK restored:
--   DELETE FROM "AccountHold" WHERE "type" = 'bad_faith' AND "reportId" IS NULL;
--   ALTER TABLE "AccountHold" DROP CONSTRAINT "AccountHold_type_shape_check";
--   ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_type_shape_check"
--     CHECK (("type" = 'bad_faith' AND "expiresAt" IS NOT NULL AND "reportId" IS NOT NULL)
--            OR ("type" = 'legal_hold' AND "expiresAt" IS NULL));

ALTER TABLE "AccountHold" DROP CONSTRAINT "AccountHold_type_shape_check";

ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_type_shape_check"
  CHECK (
    ("type" = 'bad_faith' AND "expiresAt" IS NOT NULL)
    OR ("type" = 'legal_hold' AND "expiresAt" IS NULL)
  );
