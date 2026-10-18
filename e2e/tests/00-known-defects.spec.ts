import { test, expect } from '@playwright/test';
import { URLS } from '../support/stack';
import { dobForAge, uniqueEmail } from '../support/helpers';

// Each test here documents a CONFIRMED defect using test.fail(): it passes
// while the defect exists and turns red the moment the defect is fixed, which
// is the cue to delete the test.fail() line and the cors-proxy workaround.

test('D-01: a browser on the web origin can call POST /auth/register with credentials: "include"', async ({
  page,
}) => {
  test.fail(true, 'D-01: services/api answers preflights with Access-Control-Allow-Origin: * which browsers reject for credentialed requests');
  await page.goto('/login'); // any page on the web origin
  const outcome = await page.evaluate(
    async ({ rawApi, email, dob }) => {
      try {
        // Exactly the options apps/web/src/api/auth.ts registerUser() uses.
        const res = await fetch(`${rawApi}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email,
            password: 'Sup3r-secret-pass',
            displayName: 'Cors Probe',
            dateOfBirth: dob,
            countryCode: 'GB',
          }),
        });
        return `status ${res.status}`;
      } catch (e) {
        return `network error: ${String(e)}`;
      }
    },
    { rawApi: URLS.rawApi, email: uniqueEmail('cors'), dob: dobForAge(30).iso },
  );
  expect(outcome).toBe('status 201');
});
