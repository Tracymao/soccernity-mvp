import { type Browser, type Page } from '@playwright/test';
import { getAdminToken } from './helpers';
import { URLS } from './stack';

// B-247 -- how every spec that is NOT about signing in gets an admin console page.
//
// The admin session is an in-memory access token plus a ROTATING httpOnly cookie
// (sn_admin_rt). Before B-247 the suite signed in once through the UI, saved the
// browser storage state (it held the tokens) and opened a new context from that file
// for every adminPage() call (about 25 per run). That cannot work any more: the access
// token is no longer in storage, and the cookie rotates on its first use -- a second
// context presenting the same cookie within 5 minutes is token reuse and the API revokes
// the whole session family, and after 5 minutes the old cookie is simply rejected.
// Signing in through the UI for each call is not possible either: the admin login is
// throttled to 5 per 15 minutes (Decision Log #190) and the suite makes ~25 calls.
//
// So each adminPage() call opens a fresh context, and the console's one start-up
// request -- POST /admin/auth/refresh, which in a fresh context has no cookie and would
// answer 401 and show the login screen -- is answered in the browser with an access
// token for the QA admin (getAdminToken(): a real token from the real API, cached on
// disk, one API login per 15 minutes). Everything after that is the app's own code
// against the real API: boot refresh -> GET /admin/profile with the Bearer header ->
// the screen under test. The same stub also answers a mid-session refresh (an expired
// 15-minute token) with a freshly cached token, so a long-running page keeps working.
//
// Why this and not one shared long-lived browser context: the specs end with
// `page.context().close()` (about 40 times), which would close a shared context under
// the next test. Why it is not a loss of coverage: the REAL cookie session -- sign-in
// writing nothing to storage, the sn_admin_rt cookie attributes, reload restoring the
// session, sign-out clearing the cookie -- is proven by the real UI sign-in test in
// 08-admin-dob-correction-and-username-revoke.spec.ts, which uses the real API for every
// step. This helper only replaces the cookie hop for the pages that are not testing it.
export async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: URLS.admin });
  const cors = {
    'access-control-allow-origin': URLS.admin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-auth-mode',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  await ctx.route(`${URLS.api}/admin/auth/refresh`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const accessToken = await getAdminToken();
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        accessTokenExpiresIn: 900,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    });
  });
  return ctx.newPage();
}
