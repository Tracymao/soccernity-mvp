import { test, expect } from '@playwright/test';
import {
  GUARDIAN,
  api,
  dobForAge,
  fillAgeGate,
  linkPath,
  signUpViaUi,
  uniqueEmail,
  userByEmail,
  waitForEmail,
  type Dob,
} from '../support/helpers';

/** A DOB `years` ago today, shifted by `dayShift` days (+1 = one day short of the birthday). */
function dobBoundary(years: number, dayShift: number): Dob {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayShift));
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = String(d.getUTCFullYear());
  return { day, month, year, iso: `${year}-${month}-${day}` };
}

test.describe('Age Gate (client side)', () => {
  test('an impossible date is rejected with a clear message', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Day of birth').fill('31');
    await page.getByLabel('Month of birth').fill('02');
    await page.getByLabel('Year of birth').fill('2010');
    await page.getByLabel('Country you live in').selectOption('GB');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid date of birth.');
  });

  test('a date in the future is rejected', async ({ page }) => {
    await page.goto('/signup');
    await fillAgeGate(page, { day: '01', month: '01', year: String(new Date().getUTCFullYear() + 3), iso: '' });
    await expect(page.getByRole('alert')).toHaveText('Enter a valid date of birth.');
  });

  test('country is mandatory', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Day of birth').fill('04');
    await page.getByLabel('Month of birth').fill('09');
    await page.getByLabel('Year of birth').fill('1990');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText('Select the country you live in.');
  });

  test('under 5: hard stop, and "Back to sign up" clears the date and the country', async ({ page }) => {
    await page.goto('/signup');
    await fillAgeGate(page, dobForAge(4), 'GB');
    await expect(page.getByRole('heading', { name: /isn.t for you just yet/ })).toBeVisible();
    await page.getByRole('button', { name: 'Back to sign up' }).click();
    await expect(page.getByLabel('Day of birth')).toHaveValue('');
    await expect(page.getByLabel('Month of birth')).toHaveValue('');
    await expect(page.getByLabel('Year of birth')).toHaveValue('');
    await expect(page.getByLabel('Country you live in')).toHaveValue('');
  });

  test('age 5 is the youngest who may continue (guardian step)', async ({ page }) => {
    await page.goto('/signup');
    await fillAgeGate(page, dobForAge(5), 'GB');
    await expect(page.getByRole('heading', { name: /Ask a parent or guardian/ })).toBeVisible();
  });

  test('18th birthday today -> adult (no guardian step); one day before -> minor (guardian step)', async ({ page }) => {
    await page.goto('/signup');
    await fillAgeGate(page, dobBoundary(18, 0), 'GB');
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();

    await page.goto('/signup');
    await fillAgeGate(page, dobBoundary(18, 1), 'GB');
    await expect(page.getByRole('heading', { name: /Ask a parent or guardian/ })).toBeVisible();
  });

  test('guardian step validates name, email and relationship', async ({ page }) => {
    await page.goto('/signup');
    await fillAgeGate(page, dobForAge(15), 'GB');
    await page.getByRole('button', { name: 'Send approval request' }).click();
    await expect(page.getByRole('alert')).toHaveText("Enter your guardian's full name.");
    await page.getByLabel(/Guardian.s full name/).fill('Pat Guardian');
    await page.getByLabel(/Guardian.s email address/).fill('not-an-email');
    await page.getByRole('button', { name: 'Send approval request' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address for your guardian.');
    await page.getByLabel(/Guardian.s email address/).fill('ok@qa.soccernity.test');
    await page.getByRole('button', { name: 'Send approval request' }).click();
    await expect(page.getByRole('alert')).toHaveText('Select their relationship to you.');
  });

  test('guardian step has ONE full-name field and no country select (Decision Log #393 Option A)', async ({ page }) => {
    await page.goto('/signup');
    await fillAgeGate(page, dobForAge(15), 'GB');
    await expect(page.getByLabel(/Guardian.s full name/)).toHaveCount(1);
    await expect(page.getByLabel(/country/i)).toHaveCount(0);
  });

  test('Back from the guardian step keeps the age-gate values', async ({ page }) => {
    await page.goto('/signup');
    const dob = dobForAge(15);
    await fillAgeGate(page, dob, 'NG');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Year of birth')).toHaveValue(dob.year);
    await expect(page.getByLabel('Country you live in')).toHaveValue('NG');
  });

  test('Register step: short password and bad email are rejected client-side; DOB is read-only', async ({ page }) => {
    await page.goto('/signup');
    const dob = dobForAge(30);
    await fillAgeGate(page, dob, 'GB');
    await expect(page.getByLabel('Date of Birth')).toHaveAttribute('readonly', '');
    await expect(page.getByText(/Apple/i)).toHaveCount(0);
    await page.getByLabel('First name').fill('Casey');
    await page.getByLabel('Last name').fill('Tester');
    await page.getByLabel('Email', { exact: true }).fill('nope');
    await page.getByLabel('Password', { exact: true }).fill('12345678');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
    await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('x'));
    await page.getByLabel('Password', { exact: true }).fill('1234567');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveText('Password must be at least 8 characters.');
  });
});

test.describe('Register API validation (real server)', () => {
  const valid = (over: Record<string, unknown> = {}) => ({
    email: uniqueEmail('api'),
    password: 'Sup3r-secret-pass',
    displayName: 'Api Tester',
    dateOfBirth: dobForAge(30).iso,
    countryCode: 'GB',
    ...over,
  });

  test('countryCode is required', async () => {
    const body: Record<string, unknown> = valid();
    delete body.countryCode;
    const res = await api('POST', '/auth/register', { body });
    expect(res.status).toBe(400);
  });

  test('a minor without guardian details is refused', async () => {
    const res = await api('POST', '/auth/register', { body: valid({ dateOfBirth: dobForAge(14).iso }) });
    expect(res.status).toBe(400);
  });

  test('a guardian email equal to the minor\'s own email is refused', async () => {
    const email = uniqueEmail('self');
    const res = await api('POST', '/auth/register', {
      body: valid({
        email,
        dateOfBirth: dobForAge(14).iso,
        guardian: { name: 'Me Myself', email, relationship: 'Parent' },
      }),
    });
    expect(res.status).toBe(400);
  });

  test('a date of birth in the future is refused', async () => {
    const res = await api('POST', '/auth/register', {
      body: valid({ dateOfBirth: `${new Date().getUTCFullYear() + 2}-01-01` }),
    });
    expect(res.status).toBe(400);
  });

  // D-02 (fixed, Decision Log #407 item 2). Decision Log #19's age-5 floor is
  // enforced by the server as well as the web Age Gate. Kept as a regression
  // test; the test.fail() it used to carry is gone.
  test('D-02: registering under age 5 is refused by the server too', async () => {
    const res = await api('POST', '/auth/register', {
      body: valid({
        dateOfBirth: dobForAge(4).iso,
        guardian: { name: 'Pat Guardian', email: uniqueEmail('g'), relationship: 'Parent' },
      }),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('below_minimum_age');
  });

  test('D-02: exactly age 5 is still accepted by the server', async () => {
    const res = await api('POST', '/auth/register', {
      body: valid({
        dateOfBirth: dobForAge(5).iso,
        guardian: { name: 'Pat Guardian', email: uniqueEmail('g'), relationship: 'Parent' },
      }),
    });
    expect(res.status).toBe(201);
  });

  test('the same email cannot register twice (case-insensitive)', async () => {
    const email = uniqueEmail('dupe');
    const first = await api('POST', '/auth/register', { body: valid({ email }) });
    expect(first.status).toBe(201);
    const second = await api('POST', '/auth/register', { body: valid({ email: email.toUpperCase() }) });
    expect(second.status).toBe(409);
  });

  test('the register response never carries the password hash or the stored DOB ciphertext', async () => {
    const res = await api('POST', '/auth/register', { body: valid() });
    expect(res.status).toBe(201);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|argon2|v1:/);
  });
});

test.describe.serial('under 13 (age 10): card verification gates the guardian approval', () => {
  const email = uniqueEmail('u13');
  const guardian = GUARDIAN('gu13');

  test('registers; card verification is frozen on because the country cannot be derived locally', async ({ page }) => {
    // The local API has no GeoLite2 database, so the derived country is
    // "unresolved", which by design applies the stronger control even though
    // the child declared the UK. (Decision Log #368.)
    await signUpViaUi(page, { email, age: 10, country: 'GB', guardian, expectUrl: /\/guardian-consent$/ });
    const user = await userByEmail(email);
    expect(user.isMinor).toBe(true);
    expect(user.isUnder16).toBe(true);
    expect(user.declaredCountry).toBe('GB');
    expect(user.derivedCountry).toBeNull();
    expect(user.guardian.cardVerificationRequired).toBe(true);
  });

  test('guardian page shows the card step and the consent button cannot be used', async ({ browser }) => {
    const consent = await waitForEmail(guardian.email, 'guardian-consent');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(linkPath(consent.data.link));
    await expect(page.getByTestId('card-verification-panel')).toBeVisible();
    await page.getByLabel(/I confirm I am this account holder/).check();
    await expect(page.getByRole('button', { name: 'I consent' })).toBeDisabled();
    await ctx.close();
  });

  test('the API itself refuses to confirm without the card step (not just the button)', async () => {
    const consent = await waitForEmail(guardian.email, 'guardian-consent');
    const token = new URL(consent.data.link).searchParams.get('token')!;
    const res = await api('POST', '/auth/guardian-consent', { body: { consentToken: token } });
    expect(res.status).toBe(400);
    expect((await userByEmail(email)).guardian.consentStatus).toBe('pending');
  });

  test('the card step fails closed with no Stripe configured (503), and the account stays pending', async () => {
    const consent = await waitForEmail(guardian.email, 'guardian-consent');
    const token = new URL(consent.data.link).searchParams.get('token')!;
    const res = await api('POST', '/auth/guardian-consent/card/intent', { body: { consentToken: token } });
    expect(res.status).toBe(503);
    expect((await userByEmail(email)).guardian.consentStatus).toBe('pending');
  });

  test('declining does not need the card step', async ({ browser }) => {
    const consent = await waitForEmail(guardian.email, 'guardian-consent');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(linkPath(consent.data.link));
    await page.getByRole('button', { name: 'I do not consent' }).click();
    await expect(page.getByRole('heading', { name: 'Your decision has been recorded' })).toBeVisible();
    await ctx.close();
    expect((await userByEmail(email)).guardian.consentStatus).toBe('declined');
  });
});
