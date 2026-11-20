-- backend/w5-profile-block (B-035, B-038, B-039; Decision Log #371, #394, #396,
-- #403 item 17). Purely additive: six nullable columns on "User", one new table
-- "Block", CHECK constraints. No existing column or table is altered or dropped.
--
-- ROLLBACK (manual, no data loss outside what this migration adds):
--   DROP TABLE "Block";
--   ALTER TABLE "User"
--     DROP CONSTRAINT "User_avatar_coherent", DROP CONSTRAINT "User_avatarStatus_valid",
--     DROP CONSTRAINT "User_profileCountry_format", DROP CONSTRAINT "User_bio_length",
--     DROP CONSTRAINT "User_preferredClub_length",
--     DROP COLUMN "avatarKey", DROP COLUMN "avatarStatus", DROP COLUMN "avatarUrl",
--     DROP COLUMN "bio", DROP COLUMN "preferredClub", DROP COLUMN "profileCountry";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back discards every stored bio, preferred club, profile country,
-- avatar reference and block; an avatar OBJECT already uploaded stays in the
-- bucket (delete it by key first if that matters).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "avatarStatus" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "preferredClub" TEXT,
ADD COLUMN     "profileCountry" TEXT;

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Block_sequence_key" ON "Block"("sequence");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defence in depth: the application validates all of these, the database refuses
-- a malformed row from any other writer.
-- The avatar columns move together: all NULL (no avatar) or all set.
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_coherent" CHECK (
  ("avatarUrl" IS NULL AND "avatarKey" IS NULL AND "avatarStatus" IS NULL)
  OR ("avatarUrl" IS NOT NULL AND "avatarKey" IS NOT NULL AND "avatarStatus" IS NOT NULL)
);
ALTER TABLE "User" ADD CONSTRAINT "User_avatarStatus_valid" CHECK (
  "avatarStatus" IS NULL OR "avatarStatus" IN ('pending', 'approved', 'rejected')
);
-- Upper-case ISO-3166 alpha-2 shape only; membership of the real code list is an
-- application rule (the list can change, a CHECK should not).
ALTER TABLE "User" ADD CONSTRAINT "User_profileCountry_format" CHECK (
  "profileCountry" IS NULL OR "profileCountry" ~ '^[A-Z]{2}$'
);
ALTER TABLE "User" ADD CONSTRAINT "User_bio_length" CHECK (
  "bio" IS NULL OR char_length("bio") BETWEEN 1 AND 160
);
ALTER TABLE "User" ADD CONSTRAINT "User_preferredClub_length" CHECK (
  "preferredClub" IS NULL OR char_length("preferredClub") BETWEEN 1 AND 80
);
-- Nobody blocks themselves; the reason, when present, is bounded.
ALTER TABLE "Block" ADD CONSTRAINT "Block_not_self" CHECK ("blockerId" <> "blockedId");
ALTER TABLE "Block" ADD CONSTRAINT "Block_reason_length" CHECK (
  "reason" IS NULL OR char_length("reason") BETWEEN 1 AND 500
);
