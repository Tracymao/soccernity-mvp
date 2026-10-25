-- backend/w8-image-rejection-reason (B-214; Decision Log #412 item 2, #398 D2, #371).
-- Purely additive: two nullable columns on "User" and two CHECK constraints. No
-- existing column or table is altered or dropped, and no existing row changes
-- (both columns start NULL, which satisfies the constraints for every row).
--
-- ROLLBACK (manual, no data loss outside what this migration adds):
--   ALTER TABLE "User"
--     DROP CONSTRAINT "User_avatarRejectionReason_valid",
--     DROP CONSTRAINT "User_coverRejectionReason_valid",
--     DROP COLUMN "avatarRejectionReason",
--     DROP COLUMN "coverRejectionReason";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back discards every stored rejection reason; the images, their
-- 'rejected' status and any Notification rows already written are untouched.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarRejectionReason" TEXT,
ADD COLUMN     "coverRejectionReason" TEXT;

-- Defence in depth: the application validates all of this, the database refuses a
-- malformed row from any other writer. A reason exists ONLY on a rejected image
-- (so a new upload, a delete and anonymization -- which move the status away from
-- 'rejected' -- cannot leave a stale reason behind) and is never blank. 'rejected'
-- is already inside the existing "User_avatarStatus_valid" / "User_coverStatus_valid"
-- value lists, so those constraints are unchanged. The 300-character maximum is an
-- application rule (adopted default, veto-able) and is deliberately not frozen here.
ALTER TABLE "User" ADD CONSTRAINT "User_avatarRejectionReason_valid" CHECK (
  "avatarRejectionReason" IS NULL
  OR ("avatarStatus" = 'rejected' AND char_length(btrim("avatarRejectionReason")) > 0)
);
ALTER TABLE "User" ADD CONSTRAINT "User_coverRejectionReason_valid" CHECK (
  "coverRejectionReason" IS NULL
  OR ("coverStatus" = 'rejected' AND char_length(btrim("coverRejectionReason")) > 0)
);
