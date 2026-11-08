// backend/b061-dm-permission-media-sensitive (build register B-061; Decision Log #472 adopted
// defaults (d) and (i)).

// Who may START a new conversation with this user. It can only TIGHTEN the safeguarding rules in
// MessagingService.startConversation (under-16, adult-to-minor, restricted-pending, Block), never
// loosen them. 'following' = the RECIPIENT follows the sender. Mirrored by the CHECK constraint in
// migration 20261116090000_add_dm_permission_and_media_sensitive.
export const DM_PERMISSIONS = ['everyone', 'following', 'none'] as const;
export type DmPermission = (typeof DM_PERMISSIONS)[number];
export const DEFAULT_DM_PERMISSION: DmPermission = 'everyone';

// Read receipts (Decision Log #472; founder decision 2026-11-08). The column User.readReceipts is NULLABLE:
// NULL means "use the age default", decided at READ time from the stored isMinor flag (so an account that
// turns 18 changes default without a backfill). DEFAULT, founder-veto-able: ON for an adult account, OFF for
// an under-18 account. An explicit true or false (set through PATCH /users/me/settings) always wins.
export function effectiveReadReceipts(stored: boolean | null | undefined, isMinor: boolean): boolean {
  return stored ?? !isMinor;
}

export interface UserSettings {
  dmPermission: DmPermission;
  mediaSensitive: boolean;
  // The EFFECTIVE value (explicit choice, else the age default), never the raw nullable column.
  readReceipts: boolean;
}
