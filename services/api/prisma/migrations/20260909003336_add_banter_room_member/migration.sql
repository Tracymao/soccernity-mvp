-- CreateTable
CREATE TABLE "BanterRoomMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "banterRoomId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BanterRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BanterRoomMember_userId_banterRoomId_key" ON "BanterRoomMember"("userId", "banterRoomId");

-- AddForeignKey
ALTER TABLE "BanterRoomMember" ADD CONSTRAINT "BanterRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanterRoomMember" ADD CONSTRAINT "BanterRoomMember_banterRoomId_fkey" FOREIGN KEY ("banterRoomId") REFERENCES "BanterRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
