import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { test, expect, type Page } from '@playwright/test';
import {
  adminToken,
  api,
  db,
  getAdminToken,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { REPO } from '../support/stack';

// B-139 part (c), Decision Log #467: the web side of the revoked-username review route, in real Chrome against
// the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// A username is revoked through the real admin API by the QA superadmin; the review is DECIDED by a second admin
// (a moderator created here in Postgres), because the server refuses the revoking admin. Every state on screen
// comes from the real GET /users/me/username-review.
const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b139-web-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const RUN = Date.now().toString(36);
const PASSWORD = 'QaAdmin#2026-pass';
const TAG = '[COPY PENDING LEGAL REVIEW]';

async function createModerator(): Promise<string> {
  const argon2 = requireFromApi('argon2');
  const email = `qa-mod-${RUN}-${Math.random().toString(36).slice(2, 6)}@soccernity.test`;
  await db().adminUser.create({
    data: { email, fullName: `Mia Moderator ${RUN}`, passwordHash: await argon2.hash(PASSWORD), role: 'moderator', accountStatus: 'active' },
  });
  return adminToken(email, PASSWORD);
}

/** A verified adult with a username that the QA superadmin has just revoked. */
async function revokedUser(label: string): Promise<Account & { handle: string }> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const token = (await me(acct)).token;
  const handle = uniqueUsername(label.slice(0, 4));
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username: handle } })).status).toBe(200);
  const res = await api('POST', `/admin/users/${acct.userId}/username-revoke`, {
    token: await getAdminToken(),
    body: { reason: 'Impersonates a club official account' },
  });
  expect([200, 201]).toContain(res.status);
  return { ...acct, handle };
}

async function pendingRequestId(userId: string): Promise<string> {
  const row = await db().usernameReviewRequest.findFirst({ where: { userId } });
  return row.id;
}

/** The page re-reads a pending request when the tab regains focus; dispatch that event. */
async function focusTab(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test.describe.serial('username review on Create Profile', () => {
  let moderatorToken = '';
  let asked: Account & { handle: string };
  let granted: Account & { handle: string };

  test.beforeAll(async () => {
    moderatorToken = await createModerator();
    asked = await revokedUser('rvw-a');
    granted = await revokedUser('rvw-b');
  });

  test('a revoked user logs in, lands on Create Profile and sees the entry card without the handle', async ({ page }) => {
    await loginViaUi(page, asked.email);
    await expect(page).toHaveURL(/\/create-profile/);
    const card = page.getByRole('region', { name: 'Your username was removed' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`Your username was removed by Soccernity. ${TAG}`);
    await expect(card).not.toContainText('@');
    await expect(card.getByRole('button', { name: 'Ask for a review' })).toBeVisible();
    // The username form is still there: they can choose a new username instead.
    await expect(page.getByLabel(/Username/)).toBeEnabled();
    await shot(page, '01-entry');
  });

  test('asking: the form (focus, counter, Cancel), then Send request shows the sent confirmation and stores the message', async ({ page }) => {
    await loginViaUi(page, asked.email);
    await page.getByRole('button', { name: 'Ask for a review' }).click();
    const field = page.getByLabel('Message (optional)');
    await expect(field).toBeFocused();
    await expect(page.getByText('0 / 500')).toBeVisible();

    // Cancel goes back, with focus on the button, and sends nothing.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Ask for a review' })).toBeFocused();
    expect(await db().usernameReviewRequest.count({ where: { userId: asked.userId } })).toBe(0);

    await page.getByRole('button', { name: 'Ask for a review' }).click();
    await page.getByLabel('Message (optional)').fill('It was my own name, I think this was a mistake.');
    await expect(page.getByText('47 / 500')).toBeVisible();
    await shot(page, '02-form');
    await page.getByRole('button', { name: 'Send request' }).click();

    const sent = page.getByRole('status');
    await expect(sent).toContainText('Request sent');
    await expect(sent).toContainText(`We’ll show the result here and send you a notification when it’s decided. ${TAG}`);
    await shot(page, '04-sent');

    const row = await db().usernameReviewRequest.findFirst({ where: { userId: asked.userId } });
    expect(row.status).toBe('pending');
    expect(row.message).toBe('It was my own name, I think this was a mistake.');
  });

  test('a later visit shows the pending card, with no button to ask again', async ({ page }) => {
    await loginViaUi(page, asked.email);
    const card = page.getByRole('region', { name: 'Your review request' });
    await expect(card).toContainText('Pending');
    await expect(card).toContainText(`You asked for a review. Our team is looking at it. ${TAG}`);
    await expect(page.getByRole('button', { name: 'Ask for a review' })).toHaveCount(0);
    await shot(page, '05-pending');
  });

  test('a decline made by another admin shows on the open page when the tab regains focus, and is final', async ({ page }) => {
    await loginViaUi(page, asked.email);
    await expect(page.getByRole('region', { name: 'Your review request' })).toBeVisible();

    const res = await api('POST', `/admin/username-reviews/${await pendingRequestId(asked.userId)}/decide`, {
      token: moderatorToken,
      body: { decision: 'decline', reason: 'The handle impersonates an official account.' },
    });
    expect(res.status).toBe(200);
    await focusTab(page);

    const card = page.getByRole('region', { name: 'Review decided' });
    await expect(card).toContainText('Declined');
    await expect(card).toContainText('The decision is final and cannot be reviewed again.');
    await expect(card).toContainText(`Choose a new username below to continue. ${TAG}`);
    // The admin's reason never reaches the person.
    await expect(page.locator('body')).not.toContainText('impersonates an official');
    await expect(page.getByRole('button', { name: 'Ask for a review' })).toHaveCount(0);
    await shot(page, '07-declined');
  });

  test('the decline notification row is in the Notification Centre, links to Create Profile, and carries no handle', async ({ page }) => {
    await loginViaUi(page, asked.email);
    // Let the sign-in finish (the refresh cookie is set by its response) before navigating away.
    await expect(page).toHaveURL(/\/create-profile/);
    await page.goto('/notifications');
    const row = page.getByRole('link', { name: /Your username review was decided\./ });
    await expect(row).toContainText(`The username stays removed. ${TAG}`);
    await expect(row).not.toContainText('@');
    await expect(row).toHaveAttribute('href', '/create-profile');
    await shot(page, '10-notification-declined');
  });

  test('an approved review: the page moves on by itself, and the approval row is in the Notification Centre', async ({ page }) => {
    await loginViaUi(page, granted.email);
    await page.getByRole('button', { name: 'Ask for a review' }).click();
    await page.getByRole('button', { name: 'Send request' }).click(); // no message: the field is optional
    await expect(page.getByRole('status')).toContainText('Request sent');

    const res = await api('POST', `/admin/username-reviews/${await pendingRequestId(granted.userId)}/decide`, {
      token: moderatorToken,
      body: { decision: 'reinstate', reason: 'On review the handle is the person’s own name.' },
    });
    expect(res.status).toBe(200);
    await focusTab(page);
    // The username is back, so the server's own onboarding state sends them on (the Club Picker).
    await expect(page).toHaveURL(/\/signup\/clubs/);

    await page.goto('/notifications');
    const row = page.getByRole('link', { name: /Your username review was approved\./ });
    await expect(row).toContainText(`Your username is back on your account. ${TAG}`);
    await expect(row).not.toContainText('@');
    await shot(page, '11-notification-approved');
    // Opening the row goes to Create Profile, which hands a complete profile on.
    await row.click();
    await expect(page).toHaveURL(/\/signup\/clubs/);
  });

  test('after the time to ask has passed the server refuses, and the card says so with no way to ask', async ({ page }) => {
    const late = await revokedUser('rvw-c');
    await loginViaUi(page, late.email);
    await page.getByRole('button', { name: 'Ask for a review' }).waitFor();
    // The 30 days run out while the page is open: the server, not the page, decides.
    await db().revokedUsername.updateMany({
      where: { userId: late.userId },
      data: { revokedAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    await page.getByRole('button', { name: 'Ask for a review' }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    const card = page.getByRole('region', { name: 'Your username was removed' });
    await expect(card).toContainText(`The time to ask for a review has passed. ${TAG}`);
    await expect(card.getByRole('button')).toHaveCount(0);
    expect(await db().usernameReviewRequest.count({ where: { userId: late.userId } })).toBe(0);
    await shot(page, '08-window-passed');
  });

  test('a second request for the same removal is refused with the frame error and Cancel then shows pending', async ({ page }) => {
    const twice = await revokedUser('rvw-d');
    await loginViaUi(page, twice.email);
    await page.getByRole('button', { name: 'Ask for a review' }).click();
    // The request goes in behind the page's back (another tab).
    const token = (await me(twice)).token;
    expect((await api('POST', '/users/me/username-review', { token, body: {} })).status).toBe(201);
    await page.getByRole('button', { name: 'Send request' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(`You’ve already asked for a review of this removal. The result will appear here. ${TAG}`);
    await shot(page, '10-already-asked');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('region', { name: 'Your review request' })).toContainText('Pending');
  });
});
