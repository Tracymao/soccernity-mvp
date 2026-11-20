import * as http from 'http';
import { test, expect } from '@playwright/test';
import { URLS } from '../support/stack';
import { dobForAge, uniqueEmail } from '../support/helpers';

// Regression tests for defects that were found by this suite and have since
// been fixed. They used to carry test.fail(); that line is gone for D-01, D-02
// and D-06 (Decision Log #407). D-02 is in 03-age-gate-and-under-13.spec.ts and
// D-06 in 07-create-profile-username.spec.ts. Defects still open keep their
// test.fail() in their own spec files.

// D-01 (fixed, Decision Log #407 item 1). The API used to answer every CORS
// request with Access-Control-Allow-Origin: *, which a browser refuses for a
// request sent with credentials: "include" -- and registerUser() sent exactly
// that -- so sign-up failed in every browser when web and API are on different
// origins. Now registerUser() sends no credentials option and the API answers
// only the two apps' origins. The browsers in this suite talk to the API
// directly (the CORS-rewriting proxy that used to sit in between is deleted).
test('D-01: a browser on the web origin can call POST /auth/register exactly as registerUser() does', async ({
  page,
}) => {
  await page.goto('/login'); // any page on the web origin (http://localhost:5273)
  const outcome = await page.evaluate(
    async ({ api, email, dob }) => {
      try {
        // Same options as apps/web/src/api/auth.ts registerUser(): no credentials.
        const res = await fetch(`${api}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    { api: URLS.api, email: uniqueEmail('cors'), dob: dobForAge(30).iso },
  );
  expect(outcome).toBe('status 201');
});

// Plain node http so the Origin header can be set to anything (a browser would
// not let a page forge it). The response headers are what a browser would judge.
function corsHeadersFor(origin: string | null, method: 'GET' | 'OPTIONS'): Promise<http.IncomingHttpHeaders> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (origin) headers.Origin = origin;
    if (method === 'OPTIONS') headers['Access-Control-Request-Method'] = 'POST';
    const req = http.request(`${URLS.api}/health`, { method, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.headers));
    });
    req.on('error', reject);
    req.end();
  });
}

test('D-01: the API answers the web and admin origins with that exact origin, never *', async () => {
  for (const origin of [URLS.web, URLS.admin]) {
    const headers = await corsHeadersFor(origin, 'GET');
    expect(headers['access-control-allow-origin'], origin).toBe(origin);
    const pre = await corsHeadersFor(origin, 'OPTIONS');
    expect(pre['access-control-allow-origin'], `preflight ${origin}`).toBe(origin);
  }
});

test('D-01: the API sends no allow-origin header to an unlisted origin, and never a wildcard', async () => {
  for (const origin of ['https://evil.example.com', 'http://localhost:9999.evil.com']) {
    const headers = await corsHeadersFor(origin, 'GET');
    expect(headers['access-control-allow-origin'], origin).toBeUndefined();
    const pre = await corsHeadersFor(origin, 'OPTIONS');
    expect(pre['access-control-allow-origin'], `preflight ${origin}`).toBeUndefined();
  }
  const none = await corsHeadersFor(null, 'GET');
  expect(none['access-control-allow-origin']).toBeUndefined();
});
