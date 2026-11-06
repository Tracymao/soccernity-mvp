// backend/b061-dm-permission-media-sensitive (build register B-061; Decision Log #472 adopted
// defaults (d) and (i)).

// Who may START a new conversation with this user. It can only TIGHTEN the safeguarding rules in
// MessagingService.startConversation (under-16, adult-to-minor, restricted-pending, Block), never
// loosen them. 'following' = the RECIPIENT follows the sender. Mirrored by the CHECK constraint in
// migration 20261116090000_add_dm_permission_and_media_sensitive.
export const DM_PERMISSIONS = ['everyone', 'following', 'none'] as const;
export type DmPermission = (typeof DM_PERMISSIONS)[number];
export const DEFAULT_DM_PERMISSION: DmPermission = 'everyone';

export interface UserSettings {
  dmPermission: DmPermission;
  mediaSensitive: boolean;
}
