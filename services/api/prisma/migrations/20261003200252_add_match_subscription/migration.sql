-- CreateTable
CREATE TABLE "MatchSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "MatchSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchSubscription_notifiedAt_externalRef_idx" ON "MatchSubscription"("notifiedAt", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSubscription_userId_externalRef_key" ON "MatchSubscription"("userId", "externalRef");

-- AddForeignKey
ALTER TABLE "MatchSubscription" ADD CONSTRAINT "MatchSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
