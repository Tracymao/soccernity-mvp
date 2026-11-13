import * as fs from 'fs';
import * as path from 'path';
import { test, type Browser, type Page } from '@playwright/test';
import {
  GUARDIAN,
  clearBrowserSession,
  db,
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

// W9 (B-174, B-175): the verify-email prompt at 390 px in its three states and
// the Club Picker populated, captured next to the Figma frames. Phase comes
// from W9_PHASE (before/after) so the same spec produces both sets; written to
// docs/w9-compare-screens/real/<phase>/. Also writes measured boxes to
// e2e/.run/w9-<phase>-*.json for the difference table.
const W9_PHASE = process.env.W9_PHASE ?? 'after';
const W9_OUT = path.resolve(__dirname, '..', '..', 'docs', 'w9-compare-screens', 'real', W9_PHASE);
fs.mkdirSync(W9_OUT, { recursive: true });
const w9shot = (page: Page, name: string) => page.screenshot({ path: path.join(W9_OUT, `${name}.png`), fullPage: true });
let measure: Record<string, unknown> = {};
async function box(page: Page, key: string, selector: string) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return;
  measure[key] = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const s = getComputedStyle(node);
    return {
      x: Math.round(r.x * 10) / 10,
      y: Math.round((r.y + window.scrollY) * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      gap: s.rowGap,
      color: s.color,
      bg: s.backgroundColor,
    };
  });
}
function saveMeasure(name: string) {
  fs.writeFileSync(path.resolve(__dirname, '..', '.run', `w9-${W9_PHASE}-${name}.json`), JSON.stringify(measure, null, 2));
  measure = {};
}

test.describe('w9 capture: verify prompt 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('default, resent, rate limited', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'w9v' });
    await loginViaUi(page, a.email);
    await page.waitForURL(/verify-email\/prompt/);
    await page.getByRole('button', { name: /Resend verification email/ }).waitFor();
    await w9shot(page, 'verify-mobile-1-default');
    await box(page, 'page', '.verify-page');
    await box(page, 'column', '.verify-page__column');
    await box(page, 'icon', '.verify-page__column > :first-child');
    await box(page, 'heading', '.verify-heading');
    await box(page, 'subheading', '.verify-subheading');
    await box(page, 'card', '.verify-card');
    await box(page, 'stepNumber', '.verify-row__icon');
    await box(page, 'stepTitle', '.verify-row__title');
    await box(page, 'stepBody', '.verify-row__body');
    await box(page, 'actions', '.verify-actions');
    await box(page, 'primaryButton', '.verify-button--primary');
    await box(page, 'secondaryButton', '.verify-button--secondary');
    await box(page, 'resendRow', '.verify-resend');
    await box(page, 'resendLink', '.verify-link-button');

    await page.getByRole('button', { name: /Resend verification email/ }).click();
    await page.getByRole('status').waitFor();
    await w9shot(page, 'verify-mobile-2-resent');
    await box(page, 'resendStatus', '.verify-resend__message');

    await page.route('**/auth/resend-verification-email', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'Too Many Requests' }) }),
    );
    await page.getByRole('button', { name: /Resend verification email/ }).click();
    await page.getByRole('alert').waitFor();
    await w9shot(page, 'verify-mobile-3-rate-limited');
    saveMeasure('verify');
  });
});

async function seedClubs(count: number) {
  const rows = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const independent = n % 5 === 3;
    return {
      name:
        n === 2
          ? 'Greater Manchester Sunday League Veterans Association FC'
          : `QA Club ${String(n).padStart(2, '0')} ${['Rovers FC', 'United', 'Town Youth', 'Athletic'][i % 4]}`,
      league: independent ? null : ['Ogun State Amateur League', 'Lagos Amateur Division', 'Greater Manchester Sunday League'][i % 3],
      country: independent ? null : ['Nigeria', 'Nigeria', 'England'][i % 3],
      memberCount: [1284, 842, 1, 2106, 0][i % 5],
    };
  });
  await db().clubPage.deleteMany({});
  await db().clubPage.createMany({ data: rows });
}

async function clubPickerSession(page: Page, label: string) {
  const a = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  await api('PATCH', `/users/${a.userId}`, { token, body: { username: uniqueUsername(label) } });
  await loginViaUi(page, a.email);
  await page.waitForLoadState('networkidle');
  await page.goto('/signup/clubs');
  await page.getByRole('heading', { name: 'Join a club' }).waitFor();
  await page.locator('.club-picker__item').first().waitFor();
}

async function clubPickerBoxes(page: Page) {
  await box(page, 'page', '.club-picker-page');
  await box(page, 'column', '.club-picker-page__column');
  await box(page, 'heading', '.club-picker__heading');
  await box(page, 'subheading', '.club-picker__subheading');
  await box(page, 'searchBar', '.club-picker__search-bar');
  await box(page, 'searchInput', '.club-picker__search');
  await box(page, 'list', '.club-picker__list');
  await box(page, 'card', '.club-picker__item');
  await box(page, 'logo', '.club-picker__logo');
  await box(page, 'name', '.club-picker__name');
  await box(page, 'secondary', '.club-picker__secondary');
  await box(page, 'joinButton', '.club-picker__join-button');
  await box(page, 'loadMore', '.club-picker__load-more');
  await box(page, 'continue', '.club-picker__continue');
}

for (const vp of [
  { name: 'desktop', width: 1440, height: 1070 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test.describe(`w9 capture: club picker ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('loaded, joined, join failed, filter empty, load more loading', async ({ page }) => {
      await seedClubs(24);
      await clubPickerSession(page, `w9c${vp.name}`);
      await w9shot(page, `club-${vp.name}-1-loaded`);
      await clubPickerBoxes(page);

      await page.locator('.club-picker__join-button').first().click();
      await page.getByRole('button', { name: 'Joined' }).first().waitFor();
      await w9shot(page, `club-${vp.name}-2-joined`);
      await box(page, 'joinedButton', '.club-picker__join-button--joined');
      await box(page, 'continueAfterJoin', '.club-picker__continue');

      await page.route('**/clubs/*/join', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
      );
      await page.locator('.club-picker__join-button:not(:disabled)').first().click();
      await page.locator('.club-picker__item-error').first().waitFor();
      await w9shot(page, `club-${vp.name}-3-join-failed`);
      await box(page, 'joinError', '.club-picker__item-error');
      await page.unroute('**/clubs/*/join');

      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      await page.route('**/clubs?*cursor=*', async (route) => {
        await gate;
        await route.continue();
      });
      await page.locator('.club-picker__load-more').click();
      await page.getByRole('button', { name: /^Loading/ }).waitFor();
      await w9shot(page, `club-${vp.name}-5-load-more-loading`);
      release();
      await page.unroute('**/clubs?*cursor=*');

      await page.getByLabel('Filter clubs by name').fill('zzzz no such club');
      await page.getByText('No clubs match that filter.').waitFor();
      await w9shot(page, `club-${vp.name}-4-filter-empty`);
      await box(page, 'statusCard', '.club-picker__status');
      saveMeasure(`club-${vp.name}`);
    });
  });
}
