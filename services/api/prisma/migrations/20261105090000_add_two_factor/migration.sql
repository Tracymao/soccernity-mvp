-- backend/b086-two-factor (B-086, B-270; Decision Log #446, #405 item 8, #404 item 7).
-- Authenticator-app two-factor (TOTP) for users (optional) and admins (mandatory before launch, behind
-- ADMIN_2FA_ENFORCED). Purely additive: six nullable/new columns and two new tables; no existing column, index or
-- constraint is touched and no backfill is needed (every existing account starts with two-factor OFF).
--
-- totpSecretEncrypted holds AES-256-GCM ciphertext ("v1:<iv>:<tag>:<ct>") produced with DOB_ENCRYPTION_KEY, the same
-- key and code as User.dateOfBirth. It is never plaintext.
--
-- ROLLBACK (manual; destroys every enrolled secret and backup code, so every enrolled account is back to
-- password-only and must re-enrol):
--   DROP TABLE "AdminBackupCode";
--   DROP TABLE "UserBackupCode";
--   ALTER TABLE "AdminUser" DROP COLUMN "totpLastUsedStep", DROP COLUMN "totpEnabledAt", DROP COLUMN "totpSecretEncrypted";
--   ALTER TABLE "User" DROP COLUMN "totpLastUsedStep", DROP COLUMN "totpEnabledAt", DROP COLUMN "totpSecretEncrypted";
--   then delete this migration's row from "_prisma_migrations".

-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpSecretEncrypted" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastUsedStep" INTEGER;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "totpSecretEncrypted" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastUsedStep" INTEGER;

-- CreateTable
CREATE TABLE "UserBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminBackupCode" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBackupCode_userId_idx" ON "UserBackupCode"("userId");

-- CreateIndex
CREATE INDEX "AdminBackupCode_adminId_idx" ON "AdminBackupCode"("adminId");

-- AddForeignKey
ALTER TABLE "UserBackupCode" ADD CONSTRAINT "UserBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminBackupCode" ADD CONSTRAINT "AdminBackupCode_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
