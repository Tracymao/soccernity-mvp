-- backend/b037-profile-image-review (build register B-037; Decision Log #411 item 1, #468). Additive only: two
-- nullable columns on "User". Nothing is altered or dropped, nothing is backfilled.
--   * "avatarUploadedAt" / "coverUploadedAt": when the CURRENT avatar / cover file was stored. The moderator media
--     review queue lists pending profile pictures beside post media and orders and pages them by this time. Set by
--     the upload routes, cleared with the picture. A picture uploaded before this migration has NULL (age unknown;
--     the queue lists it as the oldest).
-- Rollback (nothing else depends on them):
--   ALTER TABLE "User" DROP COLUMN "avatarUploadedAt", DROP COLUMN "coverUploadedAt";

ALTER TABLE "User" ADD COLUMN "avatarUploadedAt" TIMESTAMP(3),
ADD COLUMN "coverUploadedAt" TIMESTAMP(3);
