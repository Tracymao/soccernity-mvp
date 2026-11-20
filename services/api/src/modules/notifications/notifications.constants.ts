// Build Plan Section 4.7 (Content, Messaging, Notification & Search
// Services) — the Notifications read-side. Section 5.5: every list
// endpoint is keyset-paginated, opaque base64 cursor, default 20 / max 50.
// Reused verbatim from feed/clubs/grassroots/banter/messaging for
// consistency — Section 5.5 doesn't specify numbers.
export const NOTIFICATIONS_DEFAULT_PAGE_SIZE = 20;
export const NOTIFICATIONS_MAX_PAGE_SIZE = 50;
