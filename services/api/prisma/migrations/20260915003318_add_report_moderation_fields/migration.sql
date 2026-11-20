-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "actionTaken" TEXT,
ADD COLUMN     "appealReason" TEXT,
ADD COLUMN     "appealReviewedAt" TIMESTAMP(3),
ADD COLUMN     "appealReviewedByAdminId" TEXT,
ADD COLUMN     "appealStatus" TEXT,
ADD COLUMN     "appealedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_appealReviewedByAdminId_fkey" FOREIGN KEY ("appealReviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
