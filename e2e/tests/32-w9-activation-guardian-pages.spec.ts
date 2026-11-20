import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  api,
  emailsFor,
  linkPath,
  loginViaUi,
  registerViaApi,
  userByEmail,
  verifyEmailViaApi,
  waitForEmail,
  type Account,
} from '../support/helpers';

// W9 (B-077, B-078, B-176, B-079, B-169): the guardian confirm page layout, the guardian's approved screen,
// the minor's "New request sent" screen and the activation page's links, in a real browser against the
// real API. Figma frames: 5108:6629 / 5531:7626, 5488:7164 / 5501:8225, 5488:7248 / 5501:8342,
// 5108:6631 / 5531:7544.

async function guardianPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function noSideScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

test.describe.serial('guardian confirm page and approved screen', () => {
  let acct: Account;
  let link = '';

  test('set-up: a 15-year-old with a guardian', async () => {
    acct = await registerViaApi({ age: 15, label: 'w9guardian', displayName: 'Quinn Player' });
    link = (await waitForEmail(acct.guardianEmail!, 'guardian-consent')).data.link;
  });

  test('the request page is one bordered card, named after the account holder, under the logo-only Top Bar', async ({
    browser,
  }) => {
    const page = await guardianPage(browser);
    await page.goto(linkPath(link));
    await expect(page.getByTestId('request-summary')).toBeVisible();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Do you give permission for Quinn to use Soccernity?');
    // The guardian has no account: logo-only Top Bar, no site navigation, no Login button.
    await expect(page.getByRole('link', { name: 'Soccernity home' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Login' })).toHaveCount(0);
    await expect(page.locator('.consent-card--main')).toHaveCount(1);

    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'What Quinn will be able to do',
      'What we collect',
      'What stays switched off for under-18 accounts',
      'Your email on their profile',
    ]);
    // The new "What we collect" list: four rows, each tagged.
    const collect = page.locator('section', { has: page.getByRole('heading', { name: 'What we collect' }) });
    await expect(collect.locator('.consent-row')).toHaveCount(4);
    await expect(collect.getByText('Anything Quinn chooses to post')).toBeVisible();
    for (const body of await collect.locator('.consent-row__body').allTextContents()) {
      expect(body).toContain('[COPY PENDING LEGAL REVIEW]');
    }
    await expect(page.getByText('Only accounts Quinn follows can start a direct message.')).toBeVisible();
    // Footnote: expiry, cap, withdrawal link, privacy policy.
    await expect(page.getByRole('link', { name: 'guardian withdrawal page' })).toHaveAttribute(
      'href',
      '/guardian-consent/withdraw',
    );
    await page.screenshot({ path: '.run/shots/w9-guardian-confirm-desktop.png', fullPage: true });
    await page.context().close();
  });

  test('keyboard: the checkbox, both buttons and the links are reachable and the heading structure is sound', async ({
    browser,
  }) => {
    const page = await guardianPage(browser);
    await page.goto(linkPath(link));
    await expect(page.getByTestId('request-summary')).toBeVisible();
    await page.getByLabel(/I confirm I am this account holder/).focus();
    await expect(page.getByLabel(/I confirm I am this account holder/)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByLabel(/I confirm I am this account holder/)).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'I consent' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'I do not consent' })).toBeFocused();
    await expect(page.locator('section[aria-labelledby]')).toHaveCount(4);
    await page.context().close();
  });

  test('390px: no sideways scroll on the request page', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(linkPath(link));
    await expect(page.getByTestId('request-summary')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: '.run/shots/w9-guardian-confirm-mobile.png', fullPage: true });
    await ctx.close();
  });

  test('consenting shows "Thank you - Quinn can continue", the date, "What happens next" and Done', async ({ browser }) => {
    const page = await guardianPage(browser);
    await page.goto(linkPath(link));
    await expect(page.getByTestId('request-summary')).toBeVisible();
    await page.getByLabel(/I confirm I am this account holder/).check();
    await page.getByRole('button', { name: 'I consent' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thank you — Quinn can continue');
    await expect(page.getByRole('status')).toContainText(
      /Recorded on \d{1,2} [A-Z][a-z]+ \d{4}\. Quinn can now continue registration, with under-18 protections in place\./,
    );
    await expect(page.getByText('What happens next')).toBeVisible();
    await expect(page.getByText('Quinn continues registration')).toBeVisible();
    await expect(page.getByText('You stay in control')).toBeVisible();
    await expect(page.getByText('Nothing else is needed from you')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/now active|account is active/i);
    await expect(page.getByRole('link', { name: 'guardian withdrawal page' })).toHaveAttribute(
      'href',
      '/guardian-consent/withdraw',
    );
    await expect(page.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '/');
    await page.screenshot({ path: '.run/shots/w9-guardian-approved-desktop.png', fullPage: true });
    await page.context().close();
    expect((await userByEmail(acct.email)).guardian.consentStatus).toBe('confirmed');
    // The consent evidence records the current wording version (Decision Log #348).
    expect((await userByEmail(acct.email)).guardian.consentScreenVersion).toBe('v8');
  });
});

test.describe.serial('the minor: "New request sent" and the activation page', () => {
  let acct: Account;

  test('set-up: a 15-year-old, signed in, still waiting for approval', async ({ page }) => {
    acct = await registerViaApi({ age: 15, label: 'w9minor', displayName: 'Rae Player' });
    await verifyEmailViaApi(acct);
    await loginViaUi(page, acct.email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
  });

  test('Resend approval request opens the "New request sent" screen, not an inline line', async ({ page }) => {
    await loginViaUi(page, acct.email);
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
    await page.getByRole('button', { name: 'Resend approval request' }).click();

    await expect(page.getByRole('heading', { name: 'New request sent' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(`We’ve emailed a fresh approval request to ${acct.guardianEmail}.`);
    await expect(page.locator('.consent-row__title')).toHaveText([
      'Your guardian gets a new email',
      'Your account stays restricted for now',
      'Wrong email address?',
    ]);
    // The frame's "valid for 3 days" is not invented: the response carries no lifetime.
    await expect(page.locator('body')).not.toContainText('3 days');
    await expect(page.getByRole('link', { name: 'Change guardian email' })).toHaveAttribute(
      'href',
      '/guardian-consent/change-email',
    );
    await page.screenshot({ path: '.run/shots/w9-resent-desktop.png', fullPage: true });
    // A real fresh link was mailed.
    expect(emailsFor(acct.guardianEmail!, 'guardian-consent').length).toBe(2);

    await page.getByRole('button', { name: 'Back to my account' }).click();
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
    await expect(page.getByTestId('guardian-consent-resent')).toHaveCount(0);
  });

  test('after approval the activation page links Review privacy settings to /settings/privacy', async ({ page }) => {
    // The resend in the previous test replaced the first link; the guardian uses the fresh (second) one.
    const fresh = await waitForEmail(acct.guardianEmail!, 'guardian-consent', 2);
    const consent = await api('POST', '/auth/guardian-consent', {
      body: { consentToken: new URL(fresh.data.link).searchParams.get('token')! },
    });
    expect([200, 201]).toContain(consent.status);
    await loginViaUi(page, acct.email);
    await expect(page).toHaveURL(/\/create-profile$/);
    await page.goto('/guardian-consent');
    await expect(page.getByTestId('guardian-consent-confirmed')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Continue registration' })).toHaveAttribute('href', '/continue');
    const privacy = page.getByRole('link', { name: 'Review privacy settings' });
    await expect(privacy).toHaveAttribute('href', '/settings/privacy');
    await expect(page.getByRole('button', { name: 'Review privacy settings' })).toHaveCount(0);
    await page.screenshot({ path: '.run/shots/w9-activation-desktop.png', fullPage: true });

    await privacy.click();
    await expect(page).toHaveURL(/\/settings\/privacy$/);
  });
});
