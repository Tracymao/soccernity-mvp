-- backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464).
-- One new table: a stored media object whose deletion was deferred because the uploader had an active hold or the
-- post had a report that was not yet closed when its PostMedia row was removed. Purely additive: no existing table,
-- column or constraint is touched and no backfill is needed. uploaderId and postId carry NO foreign key on purpose
-- (the record must outlive the account and the post it describes).
--
-- ROLLBACK (manual; every deferred deletion is forgotten, so the objects it named become strays that the daily
-- stray sweep deletes after the minimum object age, without the hold/report protection -- check the table first
-- if any account is under a legal hold):
--   DROP TABLE "PostMediaDeferredDeletion";
--   then delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "PostMediaDeferredDeletion" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMediaDeferredDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostMediaDeferredDeletion_objectKey_key" ON "PostMediaDeferredDeletion"("objectKey");

-- CreateIndex
CREATE INDEX "PostMediaDeferredDeletion_createdAt_idx" ON "PostMediaDeferredDeletion"("createdAt");
