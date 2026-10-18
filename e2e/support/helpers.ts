import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { expect, type Page } from '@playwright/test';
import { ADMIN_CREDENTIALS, API_LOG, QA_REDIS_DB, REPO, URLS, USER_PASSWORD, qaDatabaseUrl } from './stack';

const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));

// ---------------------------------------------------------------------------
// Unique data per run so tests never collide in the shared QA database.
// ---------------------------------------------------------------------------
const RUN_ID = Date.now().toString(36);
let counter = 0;
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}.${RUN_ID}.${counter}@qa.soccernity.test`;
}
export function uniqueUsername(label: string): string {
  counter += 1;
  // <= 30 chars, letters/digits/underscore. Built so it can never contain the
  // account's own email local-part (label + RUN_ID + counter), which the
  // personal-data rule would reject.
  const rev = RUN_ID.split('').reverse().join('');
  return `u${rev}${counter}x${label}`.replace(/[^A-Za-z0-9_]/g, '').slice(0, 30);
}

// ---------------------------------------------------------------------------
// Dates of birth that stay correct whenever the suite is run.
// ---------------------------------------------------------------------------
export interface Dob {
  day: string;
  month: string;
  year: string;
  iso: string;
}
/** A date of birth that makes someone exactly `age` today, plus ~6 months. */
export function dobForAge(age: number, extraMonths = 6): Dob {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - extraMonths);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCDate(Math.min(d.getUTCDate(), 28));
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = String(d.getUTCFullYear());
  return { day, month, year, iso: `${year}-${month}-${day}` };
}

// ---------------------------------------------------------------------------
// Outbound email, read back from the API log. The API runs with no Postmark
// key, so every email it would send is logged with its full template data.
// ---------------------------------------------------------------------------
export interface LoggedEmail {
  template: string;
  to: string;
  data: Record<string, string>;
}
const EMAIL_LINE = /Would send "([^"]+)" to (\S+) with data=(\{.*\})\s*$/;

export function allEmails(): LoggedEmail[] {
  if (!fs.existsSync(API_LOG)) return [];
  const out: LoggedEmail[] = [];
  for (const line of fs.readFileSync(API_LOG, 'utf8').split(/\r?\n/)) {
    const m = EMAIL_LINE.exec(line);
    if (!m) continue;
    try {
      out.push({ template: m[1], to: m[2], data: JSON.parse(m[3]) });
    } catch {
      /* partial line */
    }
  }
  return out;
}
export function emailsFor(to: string, template?: string): LoggedEmail[] {
  return allEmails().filter((e) => e.to.toLowerCase() === to.toLowerCase() && (!template || e.template === template));
}
/** Waits for the `nth` (1-based) email of this template to this address. */
export async function waitForEmail(to: string, template: string, nth = 1, timeoutMs = 15_000): Promise<LoggedEmail> {
  const start = Date.now();
  for (;;) {
    const found = emailsFor(to, template);
    if (found.length >= nth) return found[nth - 1];
    if (Date.now() - start > timeoutMs) {
      throw new Error(`No ${nth}x "${template}" email to ${to} after ${timeoutMs}ms (saw ${found.length})`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
export function linkPath(link: string): string {
  const u = new URL(link);
  return `${u.pathname}${u.search}`;
}

// ---------------------------------------------------------------------------
// Real database access, used ONLY to assert state and for the clearly
// labelled workarounds. Product behaviour is always driven through the UI/API.
// ---------------------------------------------------------------------------
function rootDatabaseUrl(): string {
  if (process.env.QA_BASE_DATABASE_URL) return process.env.QA_BASE_DATABASE_URL;
  const text = fs.readFileSync(path.join(REPO, '.env'), 'utf8');
  const m = /^DATABASE_URL="?([^"\r\n]+)"?/m.exec(text);
  if (!m) throw new Error('DATABASE_URL not found in root .env');
  return m[1];
}
let prismaSingleton: any;
export function db(): any {
  if (!prismaSingleton) {
    const { PrismaClient } = requireFromApi('@prisma/client');
    prismaSingleton = new PrismaClient({ datasources: { db: { url: qaDatabaseUrl(rootDatabaseUrl()) } } });
  }
  return prismaSingleton;
}
export async function userByEmail(email: string): Promise<any> {
  return db().user.findUnique({ where: { email: email.toLowerCase() }, include: { guardian: true } });
}

// ---------------------------------------------------------------------------
// Direct API calls (used for things with no UI: admin endpoints, state probes).
// ---------------------------------------------------------------------------
export async function api(
  method: string,
  route: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${URLS.api}${route}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}
export async function adminToken(email: string, password: string): Promise<string> {
  const res = await api('POST', '/admin/auth/login', { body: { email, password } });
  if (res.status !== 200 && res.status !== 201) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}
export async function userLogin(email: string, password = USER_PASSWORD): Promise<{ status: number; body: any }> {
  return api('POST', '/auth/login', { body: { email, password } });
}

// ---------------------------------------------------------------------------
// UI drivers.
// ---------------------------------------------------------------------------
export interface SignUpInput {
  email: string;
  age: number;
  country?: string; // ISO code as used by the select, default GB
  first?: string;
  last?: string;
  password?: string;
  guardian?: { name: string; email: string; relationship: string };
  /** where the browser is expected to land after "Create account" */
  expectUrl?: RegExp;
}

export async function fillAgeGate(page: Page, dob: Dob, country = 'GB'): Promise<void> {
  await page.getByLabel('Day of birth').fill(dob.day);
  await page.getByLabel('Month of birth').fill(dob.month);
  await page.getByLabel('Year of birth').fill(dob.year);
  await page.getByLabel('Country you live in').selectOption(country);
  await page.getByRole('button', { name: 'Continue' }).click();
}

export async function signUpViaUi(page: Page, input: SignUpInput): Promise<Dob> {
  const dob = dobForAge(input.age);
  await page.goto('/signup');
  await fillAgeGate(page, dob, input.country ?? 'GB');
  if (input.age < 18) {
    if (!input.guardian) throw new Error('guardian details required for a minor');
    await expect(page.getByRole('heading', { name: /Ask a parent or guardian/ })).toBeVisible();
    await page.getByLabel(/Guardian.s full name/).fill(input.guardian.name);
    await page.getByLabel(/Guardian.s email address/).fill(input.guardian.email);
    await page.getByLabel(/Their relationship to you/).selectOption(input.guardian.relationship);
    await page.getByRole('button', { name: 'Send approval request' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
  await page.getByLabel('First name').fill(input.first ?? 'Casey');
  await page.getByLabel('Last name').fill(input.last ?? 'Tester');
  await page.getByLabel('Email', { exact: true }).fill(input.email);
  await page.getByLabel('Password', { exact: true }).fill(input.password ?? USER_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  if (input.expectUrl) await expect(page).toHaveURL(input.expectUrl);
  return dob;
}

export async function loginViaUi(page: Page, email: string, password = USER_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^Log ?in$/i }).click();
}

export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export const GUARDIAN = (label = 'guardian') => ({
  name: 'Pat Guardian',
  email: uniqueEmail(label),
  relationship: 'Parent',
});

// ---------------------------------------------------------------------------
// Fast, API-driven account factories (the UI flows are covered in their own
// specs; these put an account into a known onboarding state quickly).
// ---------------------------------------------------------------------------
export interface Account {
  email: string;
  userId: string;
  accessToken: string;
  guardianEmail?: string;
}

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token')!;
}

export async function registerViaApi(opts: {
  age: number;
  label?: string;
  displayName?: string;
  country?: string;
}): Promise<Account> {
  const email = uniqueEmail(opts.label ?? 'acct');
  const guardianEmail = opts.age < 18 ? uniqueEmail('g') : undefined;
  const res = await api('POST', '/auth/register', {
    body: {
      email,
      password: USER_PASSWORD,
      displayName: opts.displayName ?? 'Quinn Player',
      dateOfBirth: dobForAge(opts.age).iso,
      countryCode: opts.country ?? 'GB',
      ...(guardianEmail ? { guardian: { name: 'Pat Guardian', email: guardianEmail, relationship: 'Parent' } } : {}),
    },
  });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  return { email, userId: res.body.user.id, accessToken: res.body.accessToken, guardianEmail };
}

export async function verifyEmailViaApi(acct: Account): Promise<void> {
  const mail = await waitForEmail(acct.email, 'verify-email');
  const res = await api('POST', '/auth/verify-email', { body: { token: tokenFromLink(mail.data.link) } });
  if (res.status !== 200 && res.status !== 201) throw new Error(`verify failed ${res.status} ${JSON.stringify(res.body)}`);
}

export async function guardianConfirmViaApi(acct: Account): Promise<void> {
  const mail = await waitForEmail(acct.guardianEmail!, 'guardian-consent');
  const res = await api('POST', '/auth/guardian-consent', { body: { consentToken: tokenFromLink(mail.data.link) } });
  if (res.status !== 200 && res.status !== 201) throw new Error(`consent failed ${res.status} ${JSON.stringify(res.body)}`);
}

export async function guardianDeclineViaApi(acct: Account, nth = 1): Promise<void> {
  const mail = await waitForEmail(acct.guardianEmail!, 'guardian-consent', nth);
  const res = await api('POST', '/auth/guardian-consent/decline', { body: { consentToken: tokenFromLink(mail.data.link) } });
  if (res.status !== 200 && res.status !== 201) throw new Error(`decline failed ${res.status} ${JSON.stringify(res.body)}`);
}

/** Fresh access token + the server's view of where onboarding stands. */
export async function me(acct: { email: string }): Promise<{ token: string; user: any }> {
  const res = await userLogin(acct.email);
  if (res.status !== 200 && res.status !== 201) throw new Error(`login failed ${res.status}`);
  return { token: res.body.accessToken, user: res.body.user };
}

// ---------------------------------------------------------------------------
// Admin token, cached on disk so the suite stays far below the 5-logins /
// 15-minutes admin throttle (Decision Log #190).
// ---------------------------------------------------------------------------
const ADMIN_TOKEN_FILE = path.join(path.dirname(API_LOG), 'admin-token.json');
export async function getAdminToken(): Promise<string> {
  try {
    const cached = JSON.parse(fs.readFileSync(ADMIN_TOKEN_FILE, 'utf8')) as { token: string; exp: number };
    if (cached.exp * 1000 > Date.now() + 60_000) return cached.token;
  } catch {
    /* no cache yet */
  }
  const token = await adminToken(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
  const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp as number;
  fs.writeFileSync(ADMIN_TOKEN_FILE, JSON.stringify({ token, exp }));
  return token;
}

// Email-verification tokens live in Redis (48h TTL, key auth:email-verify:<token>).
// Making one "expire" = letting Redis expire it, which is exactly what time does.
export async function expireEmailVerifyToken(token: string): Promise<void> {
  const Redis = requireFromApi('ioredis');
  const text = fs.readFileSync(path.join(REPO, '.env'), 'utf8');
  const line = text.split(/\r?\n/).find((l) => l.startsWith('REDIS_URL='));
  const raw = line ? line.slice('REDIS_URL='.length).replace(/^"|"$/g, '') : 'redis://localhost:6379';
  const base = raw.replace(/\/\d+$/, '');
  const redis = new Redis(`${base}/${QA_REDIS_DB}`);
  try {
    const n = await redis.pexpire(`auth:email-verify:${token}`, 1);
    if (n !== 1) throw new Error('verification token key not found in Redis');
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    await redis.quit();
  }
}

// DEFECT D-16. VerifyEmailPage consumes the single-use token inside a useEffect;
// under React StrictMode (the dev servers) the effect runs twice, the first
// (successful) response is discarded as "cancelled" and the second request finds
// the token already used, so a perfectly valid link can end on "no longer valid".
// Which request wins is a race, so tests that open a verification link accept
// either screen but ALWAYS assert the database says "verified", and record the
// annotation when the wrong screen appeared.
export async function expectVerifyScreen(
  page: Page,
  verifiedHeading: string | RegExp,
  info: { annotations: Array<{ type: string; description?: string }> },
): Promise<void> {
  const ok = page.getByRole('heading', { name: verifiedHeading });
  const bad = page.getByRole('heading', { name: /no longer valid/ });
  await expect(ok.or(bad)).toBeVisible();
  if (await bad.isVisible()) {
    info.annotations.push({ type: 'D-16', description: 'valid link shown as "no longer valid" (StrictMode double effect)' });
  }
}
