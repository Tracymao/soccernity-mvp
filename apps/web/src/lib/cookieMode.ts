// B-246 / B-248 -- the header that makes the API's cookie session explicit
// (services/api src/session-cookie/session-cookie.ts, COOKIE_MODE_HEADER). Since
// B-248 cookie mode is the API's DEFAULT for a request from an allowlisted browser
// Origin, so this header is no longer what switches it on. It is kept on purpose:
// with it, an Origin missing from the API's WEB_APP_BASE_URL / ADMIN_APP_BASE_URL
// (a deployment mistake) fails LOUDLY with a 403 on refresh/logout, instead of the
// API silently falling back to body tokens. In cookie mode login / register /
// refresh / reactivate-account set the httpOnly, host-only, SameSite=Strict `sn_rt` cookie and leave the refresh token out of the body;
// refresh and logout read it from the cookie. Every call to those five routes
// also sends `credentials: "include"` so the browser stores and sends the cookie
// across the web and API origins.
export const COOKIE_MODE_HEADERS = { "X-Auth-Mode": "cookie" } as const;
