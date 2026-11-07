import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { loginViaUi, registerViaApi, verifyEmailViaApi, type Account } from '../support/helpers';
import { USER_PASSWORD } from '../support/stack';

// B-060 (Decision Log #472 (g)): the Privacy page variants and the Download my data flow, in real Chrome against
// the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// REAL (against the API): the wrong password, the real export being prepared, the 5-second check that finds it
// ready, and the file actually downloaded with the bearer token and read back. STUBBED IN THE BROWSER (cannot be
// reached against a real server without waiting 24 hours or breaking the build): the 429 "too many requests"
// answer, a failed export, and a file that has expired.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b060-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

/** Opens the page the way a person would: Settings > Privacy > the Download my data row. */
async function openFromPrivacy(page: Page): Promise<void> {
  await page.goto('/settings/privacy');
  await page.getByRole('link', { name: /download my data/i }).click();
  await expect(page).toHaveURL(/\/settings\/privacy\/download-data$/);
}

const password = (page: Page) => page.getByLabel('Password', { exact: true });

test.describe.serial('Privacy page and Download my data', () => {
  let adult: Account;

  test.beforeAll(async () => {
    adult = await registerViaApi({ age: 30, label: 'dex' });
    await verifyEmailViaApi(adult);
  });

  test('Adult variant: Public profile and Marketing emails stay disabled; Download my data is a real row', async ({ page }) => {
    await signIn(page, adult.email);
    await page.goto('/settings/privacy');
    await expect(page.getByText('Public profile')).toBeVisible();
    await expect(page.getByText('Guardian approval')).toHaveCount(0);
    await expect(page.getByRole('img', { name: /public profile: on \(not adjustable yet\)/i })).toBeVisible();
    await expect(page.getByRole('img', { name: /marketing emails: off \(not adjustable yet\)/i })).toBeVisible();
    await expect(page.getByText('Download a copy of your profile, posts, comments, follows and the messages you sent.')).toBeVisible();
    await expect(page.getByRole('link', { name: /download my data/i })).toHaveAttribute(
      'href',
      '/settings/privacy/download-data',
    );
    await shot(page, '01-privacy-adult-desktop');
  });

  test('confirm password, then a wrong password is refused by the real server', async ({ page }) => {
    await signIn(page, adult.email);
    await openFromPrivacy(page);
    await expect(page.getByRole('heading', { name: 'Download my data' })).toBeVisible();
    await expect(page.getByText('Enter your password to continue.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prepare my file' })).toBeDisabled();
    await shot(page, '02-confirm-password-desktop');

    await password(page).fill('not-my-password');
    await page.getByRole('button', { name: 'Prepare my file' }).click();
    await expect(page.getByText('That password isn’t right. Check it and try again.')).toBeVisible();
    await expect(password(page)).toHaveValue('not-my-password');
    await expect(password(page)).toBeFocused();
    await shot(page, '03-wrong-password-desktop');
    // Nothing was started: the page offers the form again, not a preparing screen.
    await expect(page.getByRole('heading', { name: 'Preparing your file' })).toHaveCount(0);
  });

  test('a real export: preparing, found ready by the 5-second check, downloaded as soccernity-data-export.json', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adult.email);
    await openFromPrivacy(page);
    await password(page).fill(USER_PASSWORD);
    await page.getByRole('button', { name: 'Prepare my file' }).click();

    await expect(page.getByRole('heading', { name: 'Preparing your file' })).toBeVisible();
    await expect(page.getByText('This can take a few minutes.')).toBeVisible();
    await shot(page, '04-preparing-desktop');

    // The real file is built in the background within moments; the page finds it on its 5-second check.
    await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Your data is ready to download as a JSON file.')).toBeVisible();
    await expect(
      page.getByText('The file contains your personal data. Keep it somewhere safe and don’t share it. [COPY PENDING LEGAL REVIEW]'),
    ).toBeVisible();
    await expect(page.getByText(/Available until /)).toBeVisible();
    await shot(page, '05-ready-desktop');

    // The download needs the bearer token, so it is fetched and saved as a blob: read it back.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download file' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('soccernity-data-export.json');
    const file = JSON.parse(fs.readFileSync((await download.path()) as string, 'utf8'));
    const text = JSON.stringify(file);
    expect(text).toContain(adult.email);
    expect(text).not.toMatch(/passwordHash|argon2/i);
  });

  test('coming back later lands on Ready (the latest export), not on the form', async ({ page }) => {
    await signIn(page, adult.email);
    await page.goto('/settings/privacy/download-data');
    await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible();
  });

  test('too many requests (answer stubbed in the browser): frame wording, no number, only Back to Privacy', async ({ page }) => {
    await signIn(page, adult.email);
    // A person with no usable export who asks again inside the 24-hour limit.
    await page.route('**/users/me/data-export/latest', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'none' }) }),
    );
    await page.route('**/users/me/data-export', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 429, code: 'too_many_requests', message: 'Too many requests.' }),
      });
    });
    await page.goto('/settings/privacy/download-data');
    await password(page).fill(USER_PASSWORD);
    await page.getByRole('button', { name: 'Prepare my file' }).click();
    await expect(page.getByRole('heading', { name: 'You’ve asked too many times' })).toBeVisible();
    await expect(page.getByText('You can ask for a copy of your data again later.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Privacy' })).toBeVisible();
    await shot(page, '06-too-many-requests-desktop');
    await page.getByRole('link', { name: 'Back to Privacy' }).click();
    await expect(page).toHaveURL(/\/settings\/privacy$/);
  });

  test('could not prepare (stubbed): frame wording; Try again returns to the password form', async ({ page }) => {
    await signIn(page, adult.email);
    await page.route('**/users/me/data-export/latest', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'failed', id: 'x' }) }),
    );
    await page.goto('/settings/privacy/download-data');
    await expect(page.getByRole('heading', { name: 'We couldn’t prepare your file' })).toBeVisible();
    await expect(page.getByText('Something went wrong. Try again.')).toBeVisible();
    await shot(page, '07-could-not-prepare-desktop');
    await page.unroute('**/users/me/data-export/latest');
    await page.route('**/users/me/data-export/latest', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'none' }) }),
    );
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Download my data' })).toBeVisible();
  });

  test('an expired file (410 stubbed on the download): says so and offers a new request', async ({ page }) => {
    await signIn(page, adult.email);
    await page.route('**/users/me/data-export/*/download', (route) =>
      route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 410, code: 'data_export_expired', message: 'expired' }),
      }),
    );
    await page.goto('/settings/privacy/download-data');
    await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Download file' }).click();
    await expect(page.getByRole('heading', { name: 'This file isn’t available any more' })).toBeVisible();
    await shot(page, '08-expired-desktop');
  });

  test('390px: the form and the ready screen fit without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, adult.email);
    await page.goto('/settings/privacy/download-data');
    await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible();
    await shot(page, '09-ready-mobile');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.goto('/settings/privacy');
    await expect(page.getByText('Public profile')).toBeVisible();
    await shot(page, '10-privacy-adult-mobile');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('Under 18 variant: no Public profile row, Guardian approval row linked to the consent status page', async ({ page }) => {
    const minor = await registerViaApi({ age: 15, label: 'dexm' });
    await signIn(page, minor.email);
    await page.goto('/settings/privacy');
    await expect(page.getByText('Guardian approval')).toBeVisible();
    await expect(page.getByText('Public profile')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /view consent status/i })).toHaveAttribute('href', '/guardian-consent');
    await expect(page.getByRole('link', { name: /download my data/i })).toBeVisible();
    await shot(page, '11-privacy-under-18-desktop');
  });
});
