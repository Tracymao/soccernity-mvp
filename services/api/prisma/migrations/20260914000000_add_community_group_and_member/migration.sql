-- CreateTable
CREATE TABLE "CommunityGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "city" TEXT,
    "positionPlayed" TEXT,
    "careerTrack" TEXT,
    "createdById" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityGroupMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityGroupId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityGroup_nameNormalized_key" ON "CommunityGroup"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityGroupMember_userId_communityGroupId_key" ON "CommunityGroupMember"("userId", "communityGroupId");

-- AddForeignKey
ALTER TABLE "CommunityGroup" ADD CONSTRAINT "CommunityGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGroupMember" ADD CONSTRAINT "CommunityGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGroupMember" ADD CONSTRAINT "CommunityGroupMember_communityGroupId_fkey" FOREIGN KEY ("communityGroupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

