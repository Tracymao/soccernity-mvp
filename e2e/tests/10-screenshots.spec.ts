import * as fs from 'fs';
import * as path from 'path';
import { test, type Browser, type Page } from '@playwright/test';
import {
  GUARDIAN,
  clearBrowserSession,
  fillAgeGate,
  dobForAge,
  guardianConfirmViaApi,
  linkPath,
  loginViaUi,
  me,
  api,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  waitForEmail,
} from '../support/helpers';
import { URLS } from '../support/stack';

// Evidence capture only (no assertions): one screenshot per onboarding screen,
// written to e2e/.run/shots. A curated copy lives in docs/qa-e2e-onboarding-screens/.
const OUT = path.resolve(__dirname, '..', '.run', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

async function guardianPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test('capture: sign-up flow', async ({ page }) => {
  await page.goto('/signup');
  await shot(page, '01-age-gate');
  await fillAgeGate(page, dobForAge(4), 'GB');
  await shot(page, '02-age-gate-under-5');
  await page.getByRole('button', { name: 'Back to sign up' }).click();
  await fillAgeGate(page, dobForAge(14), 'GB');
  await shot(page, '03-guardian-details');
  await page.getByLabel(/Guardian.s full name/).fill('Pat Guardian');
  await page.getByLabel(/Guardian.s email address/).fill('pat@qa.soccernity.test');
  await page.getByLabel(/Their relationship to you/).selectOption('Parent');
  await page.getByRole('button', { name: 'Send approval request' }).click();
  await shot(page, '04-register-minor');
});

test('capture: minor pending, verify prompt, guardian page, declined, approved, create profile', async ({ page, browser }) => {
  const m = await registerViaApi({ age: 15, label: 'shot' });
  await loginViaUi(page, m.email);
  await page.waitForURL(/guardian-consent/);
  await shot(page, '05-restricted-pending');
  const consent = await waitForEmail(m.guardianEmail!, 'guardian-consent');
  const gp = await guardianPage(browser);
  await gp.goto(linkPath(consent.data.link));
  await shot(gp, '06-guardian-confirm-page');
  await gp.getByRole('button', { name: 'I do not consent' }).click();
  await shot(gp, '07-guardian-decision-recorded');
  await gp.context().close();
  await page.reload();
  await shot(page, '08-minor-declined-view');
  await api('POST', '/auth/guardian-consent/resend', { body: { email: m.email } });
  await guardianConfirmViaApi({ ...m } as any).catch(() => undefined);
  const second = await waitForEmail(m.guardianEmail!, 'guardian-consent', 2);
  const g2 = await guardianPage(browser);
  await g2.goto(linkPath(second.data.link));
  await g2.getByLabel(/I confirm I am this account holder/).check();
  await g2.getByRole('button', { name: 'I consent' }).click();
  await shot(g2, '09-guardian-thank-you');
  await g2.context().close();
  await page.goto('/guardian-consent');
  await shot(page, '10-minor-approved-view');
  await verifyEmailViaApi(m);
  await page.goto('/verify-email/prompt').catch(() => undefined);
  await page.goto('/create-profile');
  await shot(page, '11-create-profile');
  const { token } = await me(m);
  await api('PATCH', `/users/${m.userId}`, { token, body: { username: uniqueUsername('shot') } });
  await page.goto('/signup/clubs');
  await shot(page, '12-club-picker');
});

test('capture: verify prompt and verified screens', async ({ page }) => {
  const a = await registerViaApi({ age: 30, label: 'shot2' });
  await loginViaUi(page, a.email);
  await page.waitForURL(/verify-email\/prompt/);
  await shot(page, '13-verify-email-prompt');
  const mail = await waitForEmail(a.email, 'verify-email');
  await page.goto(linkPath(mail.data.link));
  await page.getByRole('heading', { name: /Email verified/ }).waitFor();
  await shot(page, '14-email-verified');
  void URLS;
});

// FC3a: the same screens at the canonical 390px mobile width (Decision Log #86),
// to check the light theme and the overflow fixes (B-127, B-132).
test.describe('capture: 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sign-up, verify, guardian pages, community, blog', async ({ page, browser }) => {
    await page.goto('/signup');
    await shot(page, 'm01-age-gate');
    await page.goto('/blog');
    await page.waitForLoadState('networkidle');
    await shot(page, 'm02-blog');
    await page.goto('/community');
    await page.waitForLoadState('networkidle');
    await shot(page, 'm03-community-logged-out');
    await page.goto('/verify-email');
    await shot(page, 'm04-verify-email-missing-token');

    const m = await registerViaApi({ age: 15, label: 'mshot' });
    await loginViaUi(page, m.email);
    await page.waitForURL(/guardian-consent/);
    await shot(page, 'm05-restricted-pending');
    const consent = await waitForEmail(m.guardianEmail!, 'guardian-consent');
    const gp = await guardianPage(browser);
    await gp.setViewportSize({ width: 390, height: 844 });
    await gp.goto(linkPath(consent.data.link));
    await shot(gp, 'm06-guardian-confirm-page');
    await gp.context().close();

    const a = await registerViaApi({ age: 30, label: 'mshot2' });
    await clearBrowserSession(page);
    await loginViaUi(page, a.email);
    await page.waitForURL(/verify-email\/prompt/);
    await shot(page, 'm07-verify-email-prompt');
  });
});
