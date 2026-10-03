-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageView_route_idx" ON "PageView"("route");

-- CreateIndex
CREATE INDEX "PageView_occurredAt_idx" ON "PageView"("occurredAt");
