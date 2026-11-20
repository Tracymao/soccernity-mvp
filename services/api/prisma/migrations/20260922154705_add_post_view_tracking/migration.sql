-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PostView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "viewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostView_viewerId_postId_key" ON "PostView"("viewerId", "postId");

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
