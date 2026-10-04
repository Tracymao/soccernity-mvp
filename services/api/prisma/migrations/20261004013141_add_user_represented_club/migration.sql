-- AlterTable
ALTER TABLE "User" ADD COLUMN     "representedClubId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_representedClubId_fkey" FOREIGN KEY ("representedClubId") REFERENCES "ClubPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
