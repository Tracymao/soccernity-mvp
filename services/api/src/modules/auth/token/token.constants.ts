// Build Plan Section 5.7: "Access token — 15 minutes... Refresh token —
// 7–30 days, rotated on every use, revocable server-side." Defaults below
// sit inside that spec; both are overridable via env for ops tuning
// without a code change.
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30; // upper bound of the 7–30 day range

// How long a just-rotated (consumed) refresh token's identity is kept as a
// tombstone, purely so a near-simultaneous reuse of the same token can be
// recognized as a theft signal and revoke the rest of its family. Not a
// grace period for reuse — the token is invalid the instant it's consumed.
export const REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
