-- backend/b060-data-export (B-060; Decision Log #472 adopted default (g)). Additive: one new table.
-- Rollback: DROP TABLE "DataExportRequest";  (stored files under the data-export/ prefix are removed by the
-- expiry sweep, or by hand.)

CREATE TABLE "DataExportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "fileKey" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

-- The status vocabulary is closed, and a ready request always has its file and its expiry.
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_status_check"
    CHECK ("status" IN ('preparing', 'ready', 'failed'));
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_ready_check"
    CHECK ("status" <> 'ready' OR ("readyAt" IS NOT NULL AND "fileKey" IS NOT NULL AND "expiresAt" IS NOT NULL));

CREATE INDEX "DataExportRequest_userId_createdAt_idx" ON "DataExportRequest"("userId", "createdAt");
CREATE INDEX "DataExportRequest_status_expiresAt_idx" ON "DataExportRequest"("status", "expiresAt");

ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
