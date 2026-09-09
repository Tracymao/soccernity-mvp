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
