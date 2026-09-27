-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "childSafetyVetted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vettedAt" TIMESTAMP(3),
ADD COLUMN     "vettedByAdminId" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "concernsMinor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedByAdminId" TEXT,
ADD COLUMN     "escalatedToAuthority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalationNotes" TEXT,
ADD COLUMN     "reporterContactEmail" TEXT,
ADD COLUMN     "reporterContactName" TEXT,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'medium',
ALTER COLUMN "reporterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_escalatedByAdminId_fkey" FOREIGN KEY ("escalatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_vettedByAdminId_fkey" FOREIGN KEY ("vettedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
