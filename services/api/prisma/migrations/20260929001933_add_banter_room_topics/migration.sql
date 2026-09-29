-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanterRoomTopic" (
    "id" TEXT NOT NULL,
    "banterRoomId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BanterRoomTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Topic_nameNormalized_key" ON "Topic"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "BanterRoomTopic_banterRoomId_topicId_key" ON "BanterRoomTopic"("banterRoomId", "topicId");

-- AddForeignKey
ALTER TABLE "BanterRoomTopic" ADD CONSTRAINT "BanterRoomTopic_banterRoomId_fkey" FOREIGN KEY ("banterRoomId") REFERENCES "BanterRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanterRoomTopic" ADD CONSTRAINT "BanterRoomTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
