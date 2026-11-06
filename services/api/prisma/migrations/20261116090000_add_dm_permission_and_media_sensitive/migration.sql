-- backend/b061-dm-permission-media-sensitive (build register B-061; Decision Log #472 adopted defaults (d) and (i)).
-- Additive only: two columns on "User" with defaults, so every existing row keeps today's behaviour. Nothing is
-- altered or dropped, nothing is backfilled.
--   * "dmPermission": who may START a new conversation with this user. everyone (default) | following | none.
--     It can only tighten the safeguarding rules, never loosen them. CHECK-constrained.
--   * "mediaSensitive": the author's toggle that blurs their post pictures and videos behind "tap to view".
-- Rollback (nothing else depends on them):
--   ALTER TABLE "User" DROP CONSTRAINT "User_dmPermission_check";
--   ALTER TABLE "User" DROP COLUMN "dmPermission", DROP COLUMN "mediaSensitive";

ALTER TABLE "User" ADD COLUMN "dmPermission" TEXT NOT NULL DEFAULT 'everyone',
ADD COLUMN "mediaSensitive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD CONSTRAINT "User_dmPermission_check"
  CHECK ("dmPermission" IN ('everyone', 'following', 'none'));
