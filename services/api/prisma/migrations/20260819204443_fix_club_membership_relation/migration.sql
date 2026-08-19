-- CreateTable
CREATE TABLE "_ClubMembership" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ClubMembership_AB_unique" ON "_ClubMembership"("A", "B");

-- CreateIndex
CREATE INDEX "_ClubMembership_B_index" ON "_ClubMembership"("B");

-- AddForeignKey
ALTER TABLE "_ClubMembership" ADD CONSTRAINT "_ClubMembership_A_fkey" FOREIGN KEY ("A") REFERENCES "ClubPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClubMembership" ADD CONSTRAINT "_ClubMembership_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
