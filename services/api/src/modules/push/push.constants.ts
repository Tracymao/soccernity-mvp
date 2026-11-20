// backend/b285-web-push (B-285; Decision Log #472 adopted default (e)). Every figure below that the founder did not
// state is a DEFAULT, founder-veto-able.

/** The coded 503 body when the VAPID keys are not set (the feature reports itself unavailable). */
export const PUSH_NOT_CONFIGURED_CODE = 'push_not_configured';

/** The ONLY text a push ever carries: no names, no content, no type (Decision Log #472 (e)). */
export const PUSH_TITLE = 'Soccernity';
export const PUSH_BODY = 'You have a new notification';

/** DEFAULT: a notification older than this when the sweep looks is never pushed (a stale buzz is worse than none). */
export const PUSH_WINDOW_MS = 10 * 60 * 1000;

/** DEFAULT: the push service may drop an undelivered push after this many seconds (matches the window). */
export const PUSH_TTL_SECONDS = 10 * 60;

/** DEFAULT: at most this many unpushed notification rows are read per run (the rest wait for the next minute). */
export const PUSH_MAX_ROWS_PER_RUN = 5000;

/** Browser limits for the subscription body: a real endpoint is well under 1 KB; p256dh is 87 characters, auth 22. */
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;
export const PUSH_KEY_MAX_LENGTH = 256;

/** A push service answering with one of these has forgotten the subscription: delete our row. */
export const PUSH_GONE_STATUS_CODES: readonly number[] = [404, 410];

/**
 * DEFAULT, founder-veto-able: web push is only ever sent to the push services the browsers themselves use. A stored
 * endpoint is an address THIS SERVER later posts to, so accepting any https address would let a signed-in person
 * point it anywhere. A host is accepted when it equals an entry or ends with "." plus an entry. A new browser vendor's
 * push service has to be added here.
 */
export const PUSH_ENDPOINT_HOST_SUFFIXES: readonly string[] = [
  'fcm.googleapis.com', // Chrome, Edge, Brave, Opera (Firebase Cloud Messaging)
  'push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com and regional hosts)
  'mozaws.net', // older Firefox hosts
  'notify.windows.com', // Edge on Windows (WNS)
  'push.apple.com', // Safari (web.push.apple.com)
];
