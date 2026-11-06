-- backend/b062-notification-preferences (build register B-062; Decision Log #472 adopted default (c)).
-- Additive only: one new table, nothing altered or dropped, nothing backfilled. No row means every option is off.
--   * "NotificationPreference": one row per user ("userId" is the primary key) holding the Quality filter and the
--     three mute options of Settings > Notification Preferences.
--   * FK to "User" with ON DELETE CASCADE (like the other per-account rows); the anonymiser also deletes the row.
-- Rollback (nothing else depends on it):
--   DROP TABLE "NotificationPreference";

CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "qualityFilter" BOOLEAN NOT NULL DEFAULT false,
    "muteNonFollowing" BOOLEAN NOT NULL DEFAULT false,
    "muteNonFollowers" BOOLEAN NOT NULL DEFAULT false,
    "muteNewAccounts" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
