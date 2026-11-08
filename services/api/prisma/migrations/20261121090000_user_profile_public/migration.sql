-- backend/b060-public-profile-toggle (build register B-060; founder decision 2026-11-08).
-- One additive NOT NULL column with a default, so every existing row is "public" and nothing changes for anyone
-- until they turn it off. Rollback: ALTER TABLE "User" DROP COLUMN "isProfilePublic";
ALTER TABLE "User" ADD COLUMN "isProfilePublic" BOOLEAN NOT NULL DEFAULT true;
