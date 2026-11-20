import { test, expect } from '@playwright/test';
import { adminPage } from '../support/admin-ui';
import { adminPageAs, api, createQaAdmin, db, heldAccessToken, loginViaUi, userLogin, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-309 (a): session revocation (B-305, Decision Log #500) in real Chrome against the real API, Postgres and Redis.
// Before B-305 a suspension, a block or a removed admin deleted the refresh tokens only: an access token already issued
// kept working for up to 15 minutes. Now the guards also refuse any access token issued in an EARLIER whole second than
// the revocation (a Redis marker, auth:revoked-at:user:<id> / admin:revoked-at:admin:<id>).
//   server : services/api session-revocation/session-revocation.ts, jwt-auth.guard, admin-jwt-auth.guard
//   web    : apps/web lib/silentRefresh.ts (a 401 -> one refresh -> the refresh token is dead -> signed out)
//   admin  : apps/admin UserDetailPage (Suspend account), UsersPage (Block), SettingsRolesPage (Remove account)
// The one-second edge is accepted (#500): a token issued in the same second as the revocation is not refused. Every
// test below therefore waits past the whole second between taking the token and revoking, and says so.
// The people are synthetic accounts in the scratch database; the acting moderator is created in Postgres and used
// through a locally signed token (the admin login is throttled to 5 per 15 minutes).
test.use({ viewport: { width: 1440, height: 1100 } });

const RUN = Date.now().toString(36);

/** Wait past the end of the whole second the tokens were issued in, so `iat < marker` is certain. */
async function pastTheSecond(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1_200));
}

test.describe.serial('session revocation: an access token issued before a suspension, block or removal stops working', () => {
  let mod: QaAdmin;

  test.beforeAll(async () => {
    mod = await createQaAdmin('moderator', `B309 Revoker ${RUN}`);
  });

  test('suspend from the user page: the captured access token gets 401, the open browser ends signed out without hanging, reinstate + a new sign-in works', async ({ browser, page }) => {
    test.setTimeout(180_000);
    const target: Verified = await verifiedAccount('b309s');

    // The user signs in in a real browser and is working inside the app.
    await loginViaUi(page, target.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/community');
    await expect.poll(() => heldAccessToken(page)).not.toBeNull();
    const browserToken = (await heldAccessToken(page)) as string;

    // The token from the API login the helper made, and proof both tokens work now.
    const captured = target.token;
    for (const t of [captured, browserToken]) {
      expect((await api('GET', `/users/${target.userId}`, { token: t })).status).toBe(200);
    }

    await pastTheSecond(); // iat of both tokens is now strictly before the second the suspension will happen in

    // The moderator suspends the account from the admin console (user page -> Suspend account -> a category).
    const adminP = await adminPageAs(browser, mod.token);
    await adminP.goto(`${URLS.admin}/users/${target.userId}`);
    await adminP.getByRole('region', { name: 'Support actions' }).getByRole('button', { name: 'Suspend account' }).click();
    const dialog = adminP.getByRole('dialog', { name: 'Suspend this account?' });
    await dialog.getByRole('radio', { name: 'Spam or scam' }).check();
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await db().user.findUnique({ where: { id: target.userId } })).accountStatus).toBe('suspended');
    await adminP.context().close();

    // The API: both earlier access tokens are refused on the very next call (the marker is in Redis, not in the token).
    for (const t of [captured, browserToken]) {
      const res = await api('GET', `/users/${target.userId}`, { token: t });
      expect(res.status, 'an access token issued before the suspension').toBe(401);
    }

    // The browser: the page is still open with a now-dead access token. The person's NEXT ACTION (opening Clubs from the
    // header, which calls the API) ends in the signed-out state, and nothing hangs.
    await page.getByRole('link', { name: 'Clubs', exact: true }).first().click();
    await expect(page.getByText('Log in to browse clubs', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => heldAccessToken(page), { timeout: 30_000 }).toBeNull();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('statusCode');

    // Reinstate (the API call the Users list Unblock button makes), then the old token is STILL refused and a new sign-in works.
    const reinstated = await api('PATCH', `/admin/users/${target.userId}`, { token: mod.token, body: { status: 'active' } });
    expect(reinstated.status).toBe(200);
    expect((await api('GET', `/users/${target.userId}`, { token: captured })).status).toBe(401);
    const again = await userLogin(target.email);
    expect([200, 201]).toContain(again.status);
    const fresh = again.body.accessToken as string;
    expect((await api('GET', `/users/${target.userId}`, { token: fresh })).status).toBe(200);
    await loginViaUi(page, target.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await expect.poll(() => heldAccessToken(page)).not.toBeNull();
  });

  test('Block from the Users list (the admin Block button) does the same', async ({ browser }) => {
    test.setTimeout(120_000);
    const target: Verified = await verifiedAccount('b309b');
    const token = target.token;
    expect((await api('GET', `/users/${target.userId}`, { token })).status).toBe(200);
    await pastTheSecond();

    const page = await adminPageAs(browser, mod.token);
    await page.goto(`${URLS.admin}/users`);
    const row = page.locator('.us-table__row', { hasText: target.username });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Block', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Suspend this account?' });
    await dialog.getByRole('radio', { name: 'Harassment or bullying' }).check();
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row.locator('.us-pill')).toHaveText('suspended');
    await page.context().close();

    expect((await api('GET', `/users/${target.userId}`, { token })).status).toBe(401);
    expect((await userLogin(target.email)).status).toBe(401);

    // Unblock, then a new sign-in works and the OLD token is still refused.
    const back = await api('PATCH', `/admin/users/${target.userId}`, { token: mod.token, body: { status: 'active' } });
    expect(back.status).toBe(200);
    expect((await api('GET', `/users/${target.userId}`, { token })).status).toBe(401);
    const login = await userLogin(target.email);
    expect([200, 201]).toContain(login.status);
    expect((await api('GET', `/users/${target.userId}`, { token: login.body.accessToken })).status).toBe(200);
  });

  test('an admin whose account is removed from the Roles list gets 401 with the token they held', async ({ browser }) => {
    test.setTimeout(120_000);
    const doomed = await createQaAdmin('moderator', `B309 Doomed ${RUN}`);
    const bystander = await createQaAdmin('moderator', `B309 Bystander ${RUN}`);
    // Both tokens work now.
    for (const a of [doomed, bystander]) expect((await api('GET', '/admin/profile', { token: a.token })).status).toBe(200);
    await pastTheSecond();

    // The QA superadmin removes the account in the Roles list (Settings), through the dialog.
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings`);
    await page.getByRole('button', { name: `Remove account: ${doomed.fullName}` }).click();
    await page.getByRole('button', { name: 'Remove account', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Account removed');
    await page.context().close();
    expect((await db().adminUser.findUnique({ where: { id: doomed.id } })).accountStatus).toBe('deactivated');

    // The removed admin's earlier token is refused at once; another admin's is not.
    expect((await api('GET', '/admin/profile', { token: doomed.token })).status).toBe(401);
    expect((await api('GET', '/admin/moderation/reports', { token: doomed.token })).status).toBe(401);
    expect((await api('GET', '/admin/profile', { token: bystander.token })).status).toBe(200);
  });
});
