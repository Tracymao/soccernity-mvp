-- B-032 / B-033 (Decision Log #369, #398 D3, #402 item 3). Purely additive: one
-- nullable column and one new table. No existing column or table is altered
-- or dropped, and no data is rewritten.

-- When the current username was last changed from another value (starts the
-- change cooldown). NULL for every existing account: nobody is in a cooldown
-- on the day this ships.
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);

-- One row per admin-revoked username: a 30-day hold for everyone, and a
-- permanent bar on that user re-picking it. userId is deliberately NOT a
-- foreign key (see the model comment in schema.prisma).
CREATE TABLE "RevokedUsername" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holdUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevokedUsername_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevokedUsername_username_userId_key" ON "RevokedUsername"("username", "userId");

CREATE INDEX "RevokedUsername_username_holdUntil_idx" ON "RevokedUsername"("username", "holdUntil");
