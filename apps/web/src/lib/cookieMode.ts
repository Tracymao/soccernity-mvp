// B-246 -- the opt-in header that puts the API's session in cookie mode
// (services/api src/session-cookie/session-cookie.ts, COOKIE_MODE_HEADER). With
// it, login / register / refresh / reactivate-account set the httpOnly, host-only,
// SameSite=Strict `sn_rt` cookie and leave the refresh token out of the body;
// refresh and logout read it from the cookie. Every call to those five routes
// also sends `credentials: "include"` so the browser stores and sends the cookie
// across the web and API origins.
export const COOKIE_MODE_HEADERS = { "X-Auth-Mode": "cookie" } as const;
