-- backend/w6-hold-rule-extension (B-044; Decision Log #376, extends #341 / #345; #398 D1, #403 item 8).
-- Purely additive: one new table and its indexes, foreign keys and CHECK constraints. No existing table,
-- column or row is altered. The foreign keys are RESTRICT (a hold is audit evidence and must outlive
-- nothing it points at being deleted by accident).
--
-- CHECKs (the application also validates; these are the backstop):
--   type is legal_hold or bad_faith.
--   liftedAt, liftedByAdminId and liftReason are all NULL (active) or all set (lifted).
--   a bad_faith hold has an expiresAt and a report; a legal_hold has no expiresAt (it ends only when lifted).
--   a hold with no report can only be a legal_hold.
--
-- ROLLBACK (manual):
--   DROP TABLE "AccountHold";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back forgets which accounts were held; with the table gone the sweep's admin-hold check would
-- have nothing to read, so roll back only together with the code that reads it.

-- CreateTable
CREATE TABLE "AccountHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reportId" TEXT,
    "placedByAdminId" TEXT NOT NULL,
    "placeReason" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "liftedByAdminId" TEXT,
    "liftReason" TEXT,

    CONSTRAINT "AccountHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountHold_userId_liftedAt_idx" ON "AccountHold"("userId", "liftedAt");

-- CreateIndex
CREATE INDEX "AccountHold_reportId_idx" ON "AccountHold"("reportId");

-- AddForeignKey
ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_placedByAdminId_fkey" FOREIGN KEY ("placedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_liftedByAdminId_fkey" FOREIGN KEY ("liftedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (not expressible in schema.prisma; same practice as earlier migrations)
ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_type_check"
  CHECK ("type" IN ('legal_hold', 'bad_faith'));

ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_lifted_together_check"
  CHECK (
    ("liftedAt" IS NULL AND "liftedByAdminId" IS NULL AND "liftReason" IS NULL)
    OR ("liftedAt" IS NOT NULL AND "liftedByAdminId" IS NOT NULL AND "liftReason" IS NOT NULL)
  );

ALTER TABLE "AccountHold" ADD CONSTRAINT "AccountHold_type_shape_check"
  CHECK (
    ("type" = 'bad_faith' AND "expiresAt" IS NOT NULL AND "reportId" IS NOT NULL)
    OR ("type" = 'legal_hold' AND "expiresAt" IS NULL)
  );
