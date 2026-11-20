import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, dobForAge, me, registerViaApi, uniqueUsername, verifyEmailViaApi } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// FC4 (B-166, B-168). The admin screens changed by this PR, at the Figma frame width (1440):
//  - the Revoke username dialog / error / revoked state now carry the 30-day hold line K4 drew
//    (no tag, no held-until date), and
//  - error callouts and invalid fields use the semantic/alert accent (#FA0606) for the bar and border.
// Screenshots go to docs/fc4-screens/ for the visual check against the frames.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'fc4-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `admin-${name}.png`), fullPage: true });

test.use({ viewport: { width: 1440, height: 1184 } });

const ALERT = 'rgb(250, 6, 6)';

test('revoke dialog, error and revoked state carry the hold line; error accents are semantic/alert', async ({ browser }) => {
  const u = await registerViaApi({ age: 30, label: 'fc4', displayName: 'Ada Bello' });
  await verifyEmailViaApi(u);
  const token = (await me(u)).token;
  await api('PATCH', `/users/${u.userId}`, { token, body: { username: uniqueUsername('adab') } });

  const page = await adminPage(browser);
  await page.goto(`${URLS.admin}/users/${u.userId}`);
  await page.getByRole('button', { name: 'Revoke username' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    'The username is held for 30 days after it is revoked: nobody can take it, and this user cannot choose it again.',
  );
  await shot(page, '01-revoke-dialog');

  // Reason too short: the field error bar and the invalid border are the alert colour.
  await dialog.getByLabel('Reason (required)').fill('short');
  await dialog.getByRole('button', { name: 'Revoke username' }).click();
  const fieldError = dialog.locator('.ud-field__error');
  await expect(fieldError).toBeVisible();
  expect(await fieldError.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(ALERT);
  expect(await dialog.getByLabel('Reason (required)').evaluate((el) => getComputedStyle(el).borderColor)).toBe(ALERT);
  // Error text stays navy (never the alert colour).
  expect(await fieldError.evaluate((el) => getComputedStyle(el).color)).not.toBe(ALERT);
  await shot(page, '02-revoke-field-error');

  // Server error: the drawn banner, with the red bar.
  await dialog.getByLabel('Reason (required)').fill('Impersonates a club official account');
  await page.route('**/username-revoke', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
  );
  await dialog.getByRole('button', { name: 'Revoke username' }).click();
  const banner = dialog.locator('.ud-callout--error');
  await expect(banner).toHaveText('The username could not be revoked. Nothing was changed. Try again.');
  expect(await banner.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(ALERT);
  expect(await banner.evaluate((el) => getComputedStyle(el).color)).not.toBe(ALERT);
  await expect(dialog).toContainText('The username is held for 30 days');
  await shot(page, '03-revoke-error');
  await page.unroute('**/username-revoke');

  await dialog.getByRole('button', { name: 'Revoke username' }).click();
  await expect(page.getByText('Username revoked. The action was recorded. The username is held for 30 days.')).toBeVisible();
  await shot(page, '04-username-revoked');

  // DOB correction, adult -> minor: the guardian validation banner and the invalid fields.
  await page.goto(`${URLS.admin}/users/${u.userId}/dob-correction`);
  await page.locator('#dob-new').fill(dobForAge(15).iso);
  await page.locator('#dob-reason').fill('Confirmed by support ticket.');
  await page.getByTestId('guardian-fields').waitFor();
  await page.getByRole('button', { name: 'Review correction' }).click();
  const validation = page.locator('.us-error').first();
  await expect(validation).toContainText('Enter the guardian');
  expect(await validation.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(ALERT);
  const invalid = page.locator('.ud-input[aria-invalid="true"]').first();
  expect(await invalid.evaluate((el) => getComputedStyle(el).borderColor)).toBe(ALERT);
  await shot(page, '05-dob-guardian-validation');
  await page.context().close();
});
