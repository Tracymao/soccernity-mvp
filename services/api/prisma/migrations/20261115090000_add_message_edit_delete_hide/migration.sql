-- backend/b067-message-edit-delete-hide (B-067, Decision Log #472 (b)).
-- Additive: three nullable columns on "Message" and two new tables. No backfill, no data change.
--
-- Rollback:
--   DROP TABLE "ConversationHide";
--   DROP TABLE "MessageHide";
--   ALTER TABLE "Message" DROP COLUMN "deletedForEveryoneAt";
--   ALTER TABLE "Message" DROP COLUMN "originalContentText";
--   ALTER TABLE "Message" DROP COLUMN "editedAt";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "originalContentText" TEXT,
ADD COLUMN "deletedForEveryoneAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageHide" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageHide_pkey" PRIMARY KEY ("userId","messageId")
);

-- CreateTable
CREATE TABLE "ConversationHide" (
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationHide_pkey" PRIMARY KEY ("userId","conversationId")
);

-- CreateIndex
CREATE INDEX "MessageHide_messageId_idx" ON "MessageHide"("messageId");

-- CreateIndex
CREATE INDEX "ConversationHide_conversationId_idx" ON "ConversationHide"("conversationId");

-- AddForeignKey
ALTER TABLE "MessageHide" ADD CONSTRAINT "MessageHide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageHide" ADD CONSTRAINT "MessageHide_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationHide" ADD CONSTRAINT "ConversationHide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationHide" ADD CONSTRAINT "ConversationHide_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
