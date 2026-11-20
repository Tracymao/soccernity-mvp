-- Fixes a real keyset-pagination bug in feed.service.ts: GET /posts/feed,
-- GET /clubs/:id/feed, GET /banter-rooms/:id/posts (Post), GET
-- /posts/:id/comments (Comment), and GET /users/:id/saved-posts
-- (SavedPost) all tiebroke same-millisecond `createdAt`/`savedAt` ties
-- using a random UUID (`id`/`postId`) that has no relation to insertion
-- order. Each of these three tables gets a genuinely monotonic
-- Postgres-assigned `sequence` column instead, purely additive -- no
-- existing column touched, no data migration needed (SERIAL backfills
-- existing rows in their current row order automatically).

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "sequence" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "sequence" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "SavedPost" ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Comment_sequence_key" ON "Comment"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Post_sequence_key" ON "Post"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPost_sequence_key" ON "SavedPost"("sequence");
