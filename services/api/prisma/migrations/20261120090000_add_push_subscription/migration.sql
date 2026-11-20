-- backend/b285-web-push (build register B-285; Decision Log #472 adopted default (e)).
-- Additive only: one new table and one new nullable column, nothing altered or dropped, nothing backfilled.
--   * "PushSubscription": one row per browser that opted in to web push ("endpoint" is unique). FK to "User" with
--     ON DELETE CASCADE (like the other per-account rows); the anonymiser also deletes the rows.
--   * "Notification"."pushSentAt": set by the per-minute push sweep once the generic push for the row has been sent
--     (or claimed). NULL for every existing row; rows older than the sweep window are never pushed.
-- Rollback (nothing else depends on either):
--   DROP TABLE "PushSubscription";
--   ALTER TABLE "Notification" DROP COLUMN "pushSentAt";

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD COLUMN "pushSentAt" TIMESTAMP(3);
