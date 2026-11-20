// Build Plan Section 4.7 (Content, Messaging, Notification & Search
// Services) — the Messaging slice. Section 5.5: every list endpoint is
// keyset-paginated, opaque base64 cursor, default 20 / max 50. Reused
// verbatim from feed-query.dto.ts / clubs / grassroots / banter for
// consistency rather than re-derived — Section 5.5 doesn't specify
// numbers.
export const MESSAGING_DEFAULT_PAGE_SIZE = 20;
export const MESSAGING_MAX_PAGE_SIZE = 50;

// contentText bounds — the same 1–3000 range CreatePostDto /
// CreateBanterPostDto use for the same kind of thing (a chunk of
// user-authored text). A DM and a post are the same category of content
// as far as length goes.
export const MESSAGE_TEXT_MIN_LENGTH = 1;
export const MESSAGE_TEXT_MAX_LENGTH = 3000;

// backend/b067-message-edit-delete-hide (B-067, Decision Log #472 (b)).
// DEFAULT, founder-veto-able: the sender may edit their own text message for 15 minutes after it was sent,
// measured on the server clock. The figure is borrowed from other messaging apps; Decision Log #472 (b) states
// the rule and the build adopts the figure as written. Exactly 15:00 is inside the window, one millisecond later
// is not.
export const MESSAGE_EDIT_WINDOW_MINUTES = 15;
export const MESSAGE_EDIT_WINDOW_MS = MESSAGE_EDIT_WINDOW_MINUTES * 60 * 1000;

// Stable error codes of the edit and delete routes (the web reads these, never the message text).
export const MESSAGE_EDIT_WINDOW_CLOSED_CODE = 'message_edit_window_closed';
export const MESSAGE_NOT_EDITABLE_CODE = 'message_not_editable'; // deleted for everyone, or not a text message
export const MESSAGE_EDIT_NOT_SENDER_CODE = 'message_edit_not_sender';
export const MESSAGE_DELETE_NOT_SENDER_CODE = 'message_delete_not_sender';
// B-289 (Decision Log #483): the sender tried to edit or delete a message a moderator removed.
export const MESSAGE_REMOVED_CODE = 'message_removed';

// backend/b287-message-retention (B-287, Decision Log #478, the founder's own decision like the Contact Us
// figure of #440): a message is deleted this many calendar months after it was SENT, for everyone including
// minors. Configuration (MESSAGE_RETENTION_MONTHS); this is the fallback.
export const DEFAULT_MESSAGE_RETENTION_MONTHS = 12;

// DEFAULT, founder-veto-able: at most this many messages per daily run, oldest first. Messages are far more
// numerous than Contact Us enquiries (cap 200), so the cap is larger; a backlog drains over several nights.
export const MESSAGE_RETENTION_MAX_PER_RUN = 500;
