import * as fs from 'fs';
import * as path from 'path';
import { test, type Page } from '@playwright/test';
import {
  api,
  dobForAge,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  waitForEmail,
} from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// Evidence capture only (no assertions): the FC3b admin screens at the Figma frame size (1440 wide),
// written to e2e/.run/shots/fc3b-*.png. A curated copy lives in docs/fc3b-admin-screens/.
const OUT = path.resolve(__dirname, '..', '.run', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `fc3b-${name}.png`), fullPage: true });

test.use({ viewport: { width: 1440, height: 1184 } });

test('capture: user detail, revoke username, DOB guardian block', async ({ browser }) => {
  const u = await registerViaApi({ age: 30, label: 'fc3b', displayName: 'Ada Bello' });
  await verifyEmailViaApi(u);
  const token = (await me(u)).token;
  const handle = uniqueUsername('adab');
  await api('PATCH', `/users/${u.userId}`, { token, body: { username: handle } });

  const page = await adminPage(browser);
  await page.goto(`${URLS.admin}/users/${u.userId}`);
  await page.getByText('Support actions').waitFor();
  await shot(page, '01-user-detail');

  await page.getByRole('button', { name: 'Revoke username' }).click();
  await page.getByRole('dialog').waitFor();
  await shot(page, '02-revoke-dialog');

  // Error state: make the revoke request fail once.
  await page.getByLabel('Reason (required)').fill('Impersonates a club official account');
  await page.route('**/username-revoke', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }));
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke username' }).click();
  await page.getByRole('alert').first().waitFor();
  await shot(page, '03-revoke-error');
  await page.unroute('**/username-revoke');
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke username' }).click();
  await page.getByText('Username revoked. The action was recorded.').waitFor();
  await shot(page, '04-username-revoked');

  // DOB correction, adult -> minor: the guardian block + validation message.
  await page.goto(`${URLS.admin}/users/${u.userId}/dob-correction`);
  await page.locator('#dob-new').fill(dobForAge(15).iso);
  await page.locator('#dob-reason').fill('Confirmed by support ticket.');
  await page.getByTestId('guardian-fields').waitFor();
  await page.getByRole('button', { name: 'Review correction' }).click();
  await page.getByText('Enter the guardian').first().waitFor();
  await shot(page, '05-dob-guardian-validation');
  await page.context().close();
});

test('capture: incorrect-details reports', async ({ browser }) => {
  const mk = async (label: string, decline: boolean) => {
    const a = await registerViaApi({ age: 15, label });
    const consent = await waitForEmail(a.guardianEmail!, 'guardian-consent');
    const t = new URL(consent.data.link).searchParams.get('token')!;
    await api('POST', '/auth/guardian-consent/report-incorrect-details', { body: { consentToken: t } });
    if (decline) await api('POST', '/auth/guardian-consent/decline', { body: { consentToken: t } });
  };
  await mk('fc3b-r1', false);
  await mk('fc3b-r2', true);

  const page = await adminPage(browser);
  await page.goto(`${URLS.admin}/users/incorrect-details-reports`);
  await page.getByRole('button', { name: 'Resolve' }).first().waitFor();
  await shot(page, '06-reports-list');
  await page.getByRole('button', { name: 'Resolve' }).first().click();
  await page.getByRole('dialog').waitFor();
  await shot(page, '07-resolve-confirm');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Empty and load-error states (the list request is faked; the screen is the real one).
  await page.route('**/admin/users/incorrect-details-reports', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"truncated":false}' }),
  );
  await page.reload();
  await page.getByText('No open incorrect-details reports').waitFor();
  await shot(page, '08-reports-empty');
  await page.unroute('**/admin/users/incorrect-details-reports');
  await page.route('**/admin/users/incorrect-details-reports', (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Forbidden resource"}' }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Retry' }).waitFor();
  await shot(page, '09-reports-load-error');
  await page.context().close();
});
