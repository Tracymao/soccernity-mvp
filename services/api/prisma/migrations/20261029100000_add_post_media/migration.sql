-- backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419).
-- Purely additive: one new table "PostMedia" with its indexes, two foreign keys and CHECK
-- constraints. No existing table, column or row is altered.
--
-- ROLLBACK (manual; destroys every PostMedia row, which are only references to stored files):
--   DROP TABLE "PostMedia";
--   then delete this migration's row from "_prisma_migrations".
-- Rolling back does NOT delete the uploaded objects from the object store, and any Post.mediaUrls
-- entry that was copied from PostMedia.publicUrl keeps pointing at them; remove those by hand first
-- if the files must go.

-- CreateTable
CREATE TABLE "PostMedia" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "declaredContentType" TEXT NOT NULL,
    "declaredSize" INTEGER NOT NULL,
    "uploadState" TEXT NOT NULL DEFAULT 'awaiting_upload',
    "processingUntil" TIMESTAMP(3),
    "quarantineKey" TEXT,
    "publicKey" TEXT,
    "publicUrl" TEXT,
    "byteSize" INTEGER,
    "contentType" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decisionSource" TEXT,
    "rejectionReason" TEXT,
    "checkLabels" JSONB,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "checkState" TEXT NOT NULL DEFAULT 'not_queued',
    "checkAttempts" INTEGER NOT NULL DEFAULT 0,
    "checkNextAt" TIMESTAMP(3),
    "checkLeaseUntil" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "checkError" TEXT,
    "postId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_sequence_key" ON "PostMedia"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_quarantineKey_key" ON "PostMedia"("quarantineKey");

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_publicKey_key" ON "PostMedia"("publicKey");

-- CreateIndex
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");

-- CreateIndex
CREATE INDEX "PostMedia_uploaderId_createdAt_idx" ON "PostMedia"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "PostMedia_status_checkState_checkNextAt_idx" ON "PostMedia"("status", "checkState", "checkNextAt");

-- CreateIndex
CREATE INDEX "PostMedia_createdAt_idx" ON "PostMedia"("createdAt");

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defence in depth: the application validates all of this; the database refuses a malformed row from
-- any other writer.
ALTER TABLE "PostMedia"
  ADD CONSTRAINT "PostMedia_kind_valid" CHECK ("kind" IN ('image', 'video')),
  ADD CONSTRAINT "PostMedia_uploadState_valid" CHECK ("uploadState" IN ('awaiting_upload', 'processing', 'ready')),
  ADD CONSTRAINT "PostMedia_status_valid" CHECK ("status" IN ('pending', 'approved', 'rejected')),
  ADD CONSTRAINT "PostMedia_decisionSource_valid" CHECK ("decisionSource" IS NULL OR "decisionSource" IN ('auto', 'moderator')),
  ADD CONSTRAINT "PostMedia_checkState_valid" CHECK ("checkState" IN ('not_queued', 'queued', 'checking', 'done', 'gave_up')),
  -- A decision exists exactly when the status is not 'pending': pending carries no decision source or time,
  -- approved/rejected carry both. A rejection always carries a non-blank reason.
  ADD CONSTRAINT "PostMedia_decision_coherent" CHECK (
    ("status" = 'pending' AND "decisionSource" IS NULL AND "decidedAt" IS NULL)
    OR ("status" IN ('approved', 'rejected') AND "decisionSource" IS NOT NULL AND "decidedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "PostMedia_rejectionReason_valid" CHECK (
    ("status" = 'rejected' AND "rejectionReason" IS NOT NULL AND char_length(btrim("rejectionReason")) > 0)
    OR ("status" <> 'rejected' AND "rejectionReason" IS NULL)
  ),
  -- A file can only be approved (or even be attached) once it has been verified, stripped and stored.
  ADD CONSTRAINT "PostMedia_ready_before_decision" CHECK (
    "uploadState" = 'ready'
    OR ("status" = 'pending' AND "postId" IS NULL AND "publicKey" IS NULL AND "publicUrl" IS NULL)
  ),
  ADD CONSTRAINT "PostMedia_size_positive" CHECK ("declaredSize" > 0 AND ("byteSize" IS NULL OR "byteSize" > 0));
