-- B-084 (Decision Log #378, #468): the link between an account and a Google / Facebook identity.
-- Purely additive: one new table, one unique index, one index, one cascading FK. No existing table is altered.
--
-- ROLLBACK (manual; safe at any time, it only removes social sign-in links -- an account created through a social
-- sign-in keeps its row and an unusable password, and can regain access through forgot-password):
--   DROP TABLE "SocialIdentity";

-- CreateTable
CREATE TABLE "SocialIdentity" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialIdentity_provider_providerAccountId_key" ON "SocialIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "SocialIdentity_userId_idx" ON "SocialIdentity"("userId");

-- AddForeignKey
ALTER TABLE "SocialIdentity" ADD CONSTRAINT "SocialIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
