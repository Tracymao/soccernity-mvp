-- backend/b290-removed-post-media (build register B-290, Decision Log #484). Additive: one nullable column.
-- Set when the report that removed a post closed and the media file's private object was deleted.
-- Rollback: ALTER TABLE "PostMedia" DROP COLUMN "deletedByModerationAt";
ALTER TABLE "PostMedia" ADD COLUMN "deletedByModerationAt" TIMESTAMP(3);
