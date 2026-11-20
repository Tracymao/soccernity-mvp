-- backend/w7-contact-categories (founder decision 2026-10-30; supersedes the category list of Decision Log #445 (g)).
-- The Contact Us categories become six: technical_issues, editorial_complaints, data, suggestions, enquiries,
-- feedback.
--   livescores_issues is REMOVED (users cannot report on live scores: that data comes from a third-party service);
--   enquiries_feedback is SPLIT into enquiries and feedback.
-- Existing rows are remapped BEFORE the new CHECK is added (livescores_issues -> data, enquiries_feedback ->
-- enquiries; a feedback-only row cannot be told apart from an enquiry, so every old row goes to enquiries).
-- No column, index or foreign key changes; only the CHECK constraint is replaced.
--
-- ROLLBACK (manual): the mapping is lossy (rows already moved to data / enquiries cannot be told apart from
-- rows that were originally in those categories), so a rollback restores the old CHECK only after mapping the
-- new keys back:
--   ALTER TABLE "ContactEnquiry" DROP CONSTRAINT "ContactEnquiry_category_check";
--   UPDATE "ContactEnquiry" SET "category" = 'enquiries_feedback' WHERE "category" IN ('enquiries', 'feedback');
--   ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_category_check"
--     CHECK ("category" IN ('technical_issues', 'editorial_complaints', 'data', 'livescores_issues', 'suggestions', 'enquiries_feedback'));
--   then delete this migration's row from "_prisma_migrations".

ALTER TABLE "ContactEnquiry" DROP CONSTRAINT "ContactEnquiry_category_check";

UPDATE "ContactEnquiry" SET "category" = 'data' WHERE "category" = 'livescores_issues';
UPDATE "ContactEnquiry" SET "category" = 'enquiries' WHERE "category" = 'enquiries_feedback';

ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_category_check"
  CHECK ("category" IN ('technical_issues', 'editorial_complaints', 'data', 'suggestions', 'enquiries', 'feedback'));
