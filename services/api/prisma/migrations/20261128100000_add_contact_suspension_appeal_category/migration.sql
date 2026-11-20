-- backend/b298-contact-appeal-category (B-298; Decision Log #492 (b), (e)).
-- A seventh Contact Us category, suspension_appeal ("Appeal a suspension"), last in the list. Only the CHECK
-- constraint on "ContactEnquiry"."category" is replaced: the six existing values are kept exactly as
-- 20261104090000_contact_enquiry_categories set them. No column, index or foreign key changes and no rows are
-- touched (every existing row already holds one of the six).
--
-- ROLLBACK (manual): rows already stored as suspension_appeal must be moved or deleted first (there is no
-- lossless target category; 'enquiries' is the nearest), then the old CHECK restored:
--   UPDATE "ContactEnquiry" SET "category" = 'enquiries' WHERE "category" = 'suspension_appeal';
--   ALTER TABLE "ContactEnquiry" DROP CONSTRAINT "ContactEnquiry_category_check";
--   ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_category_check"
--     CHECK ("category" IN ('technical_issues', 'editorial_complaints', 'data', 'suggestions', 'enquiries', 'feedback'));
--   then delete this migration's row from "_prisma_migrations".

ALTER TABLE "ContactEnquiry" DROP CONSTRAINT "ContactEnquiry_category_check";

ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_category_check"
  CHECK ("category" IN ('technical_issues', 'editorial_complaints', 'data', 'suggestions', 'enquiries', 'feedback', 'suspension_appeal'));
