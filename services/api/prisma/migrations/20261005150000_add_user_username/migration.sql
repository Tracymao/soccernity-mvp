-- profile/username-column-and-display-convention (Decision Log #364).
-- Purely additive: one nullable column plus a unique index. Postgres treats
-- NULLs as distinct in a unique index, so users without a username never
-- collide ("unique where set"). Values are stored lowercase by the app.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
