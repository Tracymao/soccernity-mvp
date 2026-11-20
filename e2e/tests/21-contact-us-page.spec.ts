import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { db, loginViaUi, registerViaApi, uniqueEmail, verifyEmailViaApi } from '../support/helpers';

// B-046 / B-047 (Decision Log #440, #445): the Contact Us page at /contact in real Chrome against the real API,
// Postgres and Redis. Scoped to this page: a real submission (the row is read back from Postgres), the
// validation states, the real per-email 429 (3 per hour, so a fourth message from one address is refused), the
// signed-in prefill, and the footer links. The app runs under React StrictMode here (main.tsx), so every test
// also fails on a page error or an app console error.
test.use({ viewport: { width: 1440, height: 1100 } });

// Screenshots for the visual check against the Figma frames.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'contact-us-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

// A failed request is logged by the browser itself ("Failed to load resource ... 429"); that is the
// expected 429 test, not an app error. Anything else on the console, or any uncaught error, fails the test.
function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource/.test(msg.text())) return;
    problems.push(`console.error: ${msg.text()}`);
  });
  return problems;
}

async function fillForm(page: Page, email: string, subject = 'Fixture time looks wrong') {
  await page.getByLabel('Name', { exact: true }).fill('Adeniyi Christiana');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Data' }).click();
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.getByLabel('Message', { exact: true }).fill('The kick-off time shown for the Chelsea match is an hour out.');
}

test('a guest sends a message: success state, and the row is in Postgres', async ({ page }) => {
  const problems = watchErrors(page);
  const email = uniqueEmail('contact');
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1, name: 'Contact Us' })).toBeVisible();
  await expect(page.getByText('[COPY PENDING LEGAL REVIEW]')).toBeVisible();
  await shot(page, '01-desktop-empty');

  await fillForm(page, email);
  await shot(page, '02-desktop-filled');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible();
  await expect(page.getByText('Thank you for getting in touch.')).toBeVisible();
  await shot(page, '03-desktop-success');

  const row = await db().contactEnquiry.findFirst({ where: { email } });
  expect(row).toBeTruthy();
  expect(row.name).toBe('Adeniyi Christiana');
  expect(row.category).toBe('data');
  expect(row.subject).toBe('Fixture time looks wrong');
  expect(row.status).toBe('new');
  expect(row.userId).toBeNull(); // a guest

  // Send another message: back to an empty form.
  await page.getByRole('button', { name: 'Send another message' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
  expect(problems).toEqual([]);
});

test('validation: every empty field is flagged, nothing is sent, and an error clears as the field is edited', async ({
  page,
}) => {
  const problems = watchErrors(page);
  const requests: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/contact')) requests.push(req.url());
  });
  await page.goto('/contact');

  await page.getByRole('button', { name: 'Submit' }).click();
  for (const text of [
    'Enter your name.',
    'Enter a valid email address.',
    'Choose a category.',
    'Enter a subject.',
    'Enter a message.',
  ]) {
    await expect(page.getByText(text)).toBeVisible();
  }
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await shot(page, '04-desktop-validation');

  await page.getByLabel('Email', { exact: true }).fill('adeniyi@');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('A');
  await expect(page.getByText('Enter your name.')).toHaveCount(0);

  expect(requests).toEqual([]); // the form never reached the server
  expect(problems).toEqual([]);
});

test('the real per-email limit: the fourth message from one address is refused with the rate-limited line', async ({
  page,
}) => {
  const problems = watchErrors(page);
  const email = uniqueEmail('contact-limit');
  await page.goto('/contact');

  for (let i = 1; i <= 3; i++) {
    await fillForm(page, email, `Message ${i}`);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible();
    await page.getByRole('button', { name: 'Send another message' }).click();
  }

  await fillForm(page, email, 'Message 4');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Each person can send a limited number of messages in an hour. You can send another later.',
  );
  // Values kept, form still there.
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Message 4');
  await shot(page, '05-desktop-rate-limited');

  expect(await db().contactEnquiry.count({ where: { email } })).toBe(3);
  expect(problems).toEqual([]);
});

test('a signed-in user gets Name and Email prefilled (editable) and the enquiry is linked to their account', async ({
  page,
}) => {
  const problems = watchErrors(page);
  const acct = await registerViaApi({ age: 30, label: 'contact-in', displayName: 'Quinn Player' });
  await verifyEmailViaApi(acct);
  await loginViaUi(page, acct.email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));

  await page.goto('/contact');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Quinn Player');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(acct.email.toLowerCase());
  await shot(page, '06-desktop-signed-in-prefilled');

  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Suggestions' }).click();
  await page.getByLabel('Subject', { exact: true }).fill('An idea');
  await page.getByLabel('Message', { exact: true }).fill('Add a thing.');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible();

  const row = await db().contactEnquiry.findFirst({ where: { email: acct.email.toLowerCase() } });
  expect(row?.userId).toBe(acct.userId);
  expect(row?.category).toBe('suggestions');
  expect(problems).toEqual([]);
});

test('mobile (390px): the same form, mobile wording, and the success state', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/contact');
  await expect(page.getByPlaceholder('Email Address')).toBeVisible();
  await expect(page.getByText('Select Category')).toBeVisible();
  // No sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, '07-mobile-empty');

  await page.getByRole('button', { name: 'Submit' }).click();
  await shot(page, '08-mobile-validation');

  await page.getByLabel('Name', { exact: true }).fill('Sam Guest');
  await page.getByPlaceholder('Email Address').fill(uniqueEmail('contact-m'));
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Data' }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Mobile subject');
  await page.getByLabel('Message', { exact: true }).fill('Mobile message.');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible();
  await shot(page, '09-mobile-success');
  expect(problems).toEqual([]);
});

test('the footer links are real: Contact Us, Terms of Service and Privacy Policy', async ({ page }) => {
  const problems = watchErrors(page);
  await page.goto('/');
  // The footer renders inside <main>, so a real browser does not expose it as `contentinfo` (jsdom does).
  const footer = page.locator('footer.sn-footer');

  await footer.getByRole('link', { name: 'Contact Us' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Contact Us' })).toBeVisible();

  // /terms and /privacy are plain AppShell pages (no footer), so each link starts from the home page.
  await page.goto('/');
  await footer.getByRole('link', { name: 'Terms of Service' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.goto('/');
  await footer.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);

  // The notice's own Privacy Policy link, from the form.
  await page.goto('/contact');
  await page.locator('.contact-page__notice-text a').click();
  await expect(page).toHaveURL(/\/privacy$/);
  expect(problems).toEqual([]);
});
