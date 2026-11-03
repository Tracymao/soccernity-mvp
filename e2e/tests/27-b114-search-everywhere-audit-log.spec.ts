import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createRequire } from 'module';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { api, adminToken, db, getAdminToken, registerViaApi, uniqueEmail, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { ADMIN_CREDENTIALS, REPO, URLS } from '../support/stack';

// B-114 pass 2 (Decision Log #464): the search bar on every admin screen, the extra search columns (MATCHED ON,
// TWO-FACTOR, SOURCE), and the Audit log / My activity screen, in real Chrome against the real API, Postgres and
// Redis. Scoped to this work; the other Playwright specs are not run by it.
//
// Roles: the QA admin is a superadmin (Audit log). A moderator and an editor are created here in Postgres and signed
// in through the real API for the "My activity" variant. The QA admin is made NOT child-safety vetted for the run
// (and put back), because the vetting rule is part of what is checked.
//
// Audit rows are seeded straight into AdminActionLog (the endpoint that reads them is the thing under test). Targets
// of the seeded rows are chosen so they are not subject to the "target missing" fail-closed rule: contest cycles
// and real, adult users and reports.
test.use({ viewport: { width: 1440, height: 1184 } });

const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b114-everywhere-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const PASSWORD = 'QaAdmin#2026-pass';

/** adminPage(), but the console's start-up refresh is answered with THIS admin's access token. */
async function adminPageAs(browser: Browser, token: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: URLS.admin });
  const cors = {
    'access-control-allow-origin': URLS.admin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-auth-mode',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  await ctx.route(`${URLS.api}/admin/auth/refresh`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        accessToken: token,
        accessTokenExpiresIn: 900,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    });
  });
  return ctx.newPage();
}

async function createAdmin(role: 'moderator' | 'editor', name: string): Promise<{ id: string; email: string; token: string }> {
  const argon2 = requireFromApi('argon2');
  const email = `qa-${role}-${RUN}-${Math.random().toString(36).slice(2, 6)}@soccernity.test`;
  const row = await db().adminUser.create({
    data: { email, fullName: name, passwordHash: await argon2.hash(PASSWORD), role, accountStatus: 'active' },
  });
  const token = await adminToken(email, PASSWORD);
  return { id: row.id, email, token };
}

test.describe.serial('admin search everywhere and the audit log', () => {
  let reporter: Account;
  let target: Account;
  let targetUsername = '';
  let reportId = '';
  let reportRef = '';
  let qaAdminId = '';
  let qaWasVetted = false;
  let moderator: { id: string; email: string; token: string };
  let editor: { id: string; email: string; token: string };
  const MOD_NAME = `Mia Moderator ${RUN}`;
  const REASON = `private description ${RUN}`;

  test.beforeAll(async () => {
    reporter = await registerViaApi({ age: 30, label: 'ev-reporter' });
    target = await registerViaApi({ age: 30, label: 'ev-target', displayName: `Target Person ${RUN}` });
    targetUsername = `nelson_e2e_${RUN}`;
    await db().user.update({ where: { id: target.userId }, data: { username: targetUsername } });
    const res = await api('POST', '/reports', {
      token: reporter.accessToken,
      body: { targetType: 'user', targetId: target.userId, reason: REASON },
    });
    if (res.status !== 201) throw new Error(`POST /reports failed ${res.status} ${JSON.stringify(res.body)}`);
    const report = await db().report.findFirst({ where: { targetId: target.userId }, orderBy: { createdAt: 'desc' } });
    reportId = report.id;
    reportRef = reportId.slice(0, 8);

    const contactRes = await api('POST', '/contact', {
      body: {
        name: 'Tunde Bello',
        email: uniqueEmail('ev-enq'),
        category: 'data',
        subject: `Fixture time ${RUN}`,
        message: 'The kickoff time is wrong.',
      },
    });
    if (contactRes.status !== 201) throw new Error(`POST /contact failed ${contactRes.status}`);

    const qa = await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } });
    qaAdminId = qa.id;
    qaWasVetted = qa.childSafetyVetted === true;
    if (qaWasVetted) await db().adminUser.update({ where: { id: qaAdminId }, data: { childSafetyVetted: false } });

    moderator = await createAdmin('moderator', MOD_NAME);
    editor = await createAdmin('editor', `Eddie Editor ${RUN}`);

    const now = Date.now();
    const rows: Array<Record<string, unknown>> = [];
    // The moderator's visible rows: 25 edits + 2 creations (newest first by createdAt).
    for (let i = 0; i < 25; i += 1) {
      rows.push({
        adminId: moderator.id,
        action: 'contest_cycle.updated',
        targetType: 'contest_cycle',
        targetId: crypto.randomUUID(),
        notes: `paging-${String(i).padStart(2, '0')}`,
        createdAt: new Date(now - 60_000 - i * 1000),
      });
    }
    for (let i = 0; i < 2; i += 1) {
      rows.push({
        adminId: moderator.id,
        action: 'contest_cycle.created',
        targetType: 'contest_cycle',
        targetId: crypto.randomUUID(),
        notes: `created-${i}`,
        createdAt: new Date(now - 120_000 - i * 1000),
      });
    }
    // Child-safety rows an admin who is not vetted must never get: a guardian-notice action by the moderator and a
    // date-of-birth view by the QA admin, both about a real (adult) user so only the ACTION rule can hide them.
    rows.push({
      adminId: moderator.id,
      action: 'user.guardian_notices_withheld',
      targetType: 'user',
      targetId: target.userId,
      notes: `cs-hidden-${RUN}`,
      createdAt: new Date(now - 30_000),
    });
    rows.push({
      adminId: qaAdminId,
      action: 'user.dob_viewed',
      targetType: 'user',
      targetId: target.userId,
      notes: null,
      createdAt: new Date(now - 31_000),
    });
    // One ordinary row by the QA admin about the seeded report.
    rows.push({
      adminId: qaAdminId,
      action: 'report.actioned',
      targetType: 'report',
      targetId: reportId,
      notes: `Content removed ${RUN}`,
      createdAt: new Date(now - 20_000),
    });
    await db().adminActionLog.createMany({ data: rows });
  });

  test.afterAll(async () => {
    if (qaWasVetted) await db().adminUser.update({ where: { id: qaAdminId }, data: { childSafetyVetted: true } });
  });

  test('the working search bar is on every admin screen, including ones that used to hide it', async ({ browser }) => {
    const page = await adminPage(browser);
    const paths = [
      '/dashboard',
      '/articles',
      '/articles/new',
      '/users',
      `/users/${target.userId}`,
      '/moderation',
      '/moderation/held-investigations',
      '/moderation/contact-enquiries',
      '/moderation/media',
      '/categories',
      '/contest',
      '/media',
      '/settings',
      '/profile',
      '/activity',
    ];
    for (const p of paths) {
      await page.goto(`${URLS.admin}${p}`);
      const bar = page.getByRole('textbox', { name: 'Search Soccernity' });
      await expect(bar, `search bar on ${p}`).toBeVisible();
      await expect(bar).toBeEnabled();
      await expect(page.getByRole('search')).toHaveCount(1);
    }

    await page.goto(`${URLS.admin}/dashboard`);
    await shot(page, '01-dashboard-with-bar');
    const bar = page.getByRole('textbox', { name: 'Search Soccernity' });
    await bar.fill(target.email);
    await bar.press('Enter');
    await page.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === target.email);
    await expect(page.getByRole('table', { name: 'Users' })).toContainText(`Target Person ${RUN}`);
    await page.context().close();
  });

  test('the results draw MATCHED ON, SOURCE and TWO-FACTOR from the response, and no REASON or description', async ({ browser }) => {
    const page = await adminPage(browser);
    const search = async (text: string) => {
      await page.goto(`${URLS.admin}/search?q=${encodeURIComponent(text)}`);
    };

    await search(target.email);
    const users = page.getByRole('table', { name: 'Users' });
    await expect(users.getByRole('columnheader', { name: 'Matched on' })).toBeVisible();
    await expect(users).toContainText('Email address (exact)');

    await search(reportRef);
    const reports = page.getByRole('table', { name: 'Reports' });
    await expect(reports).toContainText('Report reference');
    await expect(reports).toContainText(`#${reportRef}`);
    await expect(reports.getByRole('columnheader', { name: /^reason$/i })).toHaveCount(0);
    await expect(page.getByText(REASON)).toHaveCount(0);
    await shot(page, '02-results-report-reference');

    await search(targetUsername);
    await expect(page.getByRole('table', { name: 'Users' })).toContainText('Username (starts with)');
    await expect(page.getByRole('table', { name: 'Reports' })).toContainText('Target username');
    await expect(page.getByText(REASON)).toHaveCount(0);

    await search(moderator.email);
    const staff = page.getByRole('table', { name: 'Staff' });
    await expect(staff).toContainText(MOD_NAME);
    await expect(staff.getByRole('columnheader', { name: 'Two-factor' })).toBeVisible();
    await expect(staff.getByText('Off', { exact: true })).toBeVisible();
    await expect(staff).toContainText('Email address (exact)');
    await shot(page, '03-results-staff-two-factor');

    await search(`Fixture time ${RUN}`);
    const enquiries = page.getByRole('table', { name: 'Contact enquiries' });
    await expect(enquiries.getByRole('columnheader', { name: 'Source' })).toBeVisible();
    await expect(enquiries.getByText('Guest', { exact: true })).toBeVisible();
    await expect(enquiries).toContainText('Subject');
    await page.context().close();
  });

  test('Audit log (superadmin): title, actor column and filter, every filter, paging, and no child-safety rows', async ({ browser }) => {
    const page = await adminPage(browser);
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/admin/action-log')) requests.push(req.url());
    });

    await page.goto(`${URLS.admin}/dashboard`);
    const nav = page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Activity' });
    await expect(nav).toBeVisible();
    await nav.click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    for (const label of ['Action kind', 'Actor', 'From', 'To']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actor' })).toBeVisible();

    // The Actor dropdown lists the staff; the child-safety kinds are not offered to an admin who is not vetted.
    const actor = page.getByLabel('Actor', { exact: true });
    await expect(actor.locator('option', { hasText: MOD_NAME })).toHaveCount(1);
    const kinds = await page.getByLabel('Action kind', { exact: true }).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(kinds).toContain('report.actioned');
    expect(kinds).not.toContain('user.dob_viewed');
    expect(kinds).not.toContain('user.guardian_notices_withheld');
    await shot(page, '04-audit-log');

    // Filter by the moderator: 25 + 2 visible rows, 20 then Load more; the guardian-notice row is simply absent.
    await actor.selectOption({ label: MOD_NAME });
    await page.getByRole('button', { name: 'Apply filter' }).click();
    const table = page.getByRole('table', { name: 'Audit log' });
    await expect(table.getByRole('row')).toHaveCount(21); // header + 20
    await expect(table).toContainText('paging-00');
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(table.getByRole('row')).toHaveCount(28); // header + 27
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
    await expect(table).toContainText('created-1');
    await expect(page.getByText(`cs-hidden-${RUN}`)).toHaveCount(0);
    await expect(page.getByText('Guardian notices withheld')).toHaveCount(0);
    for (const cell of await table.getByRole('cell', { name: MOD_NAME }).all()) await expect(cell).toBeVisible();
    // Newest first: the page-one order follows createdAt descending.
    const notes = await table.getByRole('cell').allInnerTexts();
    expect(notes.indexOf('paging-00')).toBeLessThan(notes.indexOf('paging-01'));
    await shot(page, '05-audit-log-actor-filter');

    // Action filter.
    await page.getByLabel('Action kind', { exact: true }).selectOption('contest_cycle.created');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(table.getByRole('row')).toHaveCount(3);
    await expect(table).toContainText('created-0');
    await expect(table).not.toContainText('paging-');

    // Date filter: a range in the future matches nothing, and the page says so without hinting at hidden rows.
    await page.getByLabel('Action kind', { exact: true }).selectOption('');
    await page.getByLabel('From', { exact: true }).fill('2999-01-01');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByText('No matching activity')).toBeVisible();
    await expect(page.getByText('Try a different filter.')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/hidden|restricted|withheld|not allowed|missing/i);
    await shot(page, '06-audit-log-filtered-empty');

    // End before start is refused on the page, with no request.
    const before = requests.length;
    await page.getByLabel('To', { exact: true }).fill('2998-01-01');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByText('The end date can’t be before the start date.')).toBeVisible();
    expect(requests.length).toBe(before);

    // The seeded report row opens the report.
    await page.getByLabel('From', { exact: true }).fill('');
    await page.getByLabel('To', { exact: true }).fill('');
    await page.getByLabel('Actor', { exact: true }).selectOption('');
    await page.getByLabel('Action kind', { exact: true }).selectOption('report.actioned');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    const link = table.getByRole('link', { name: `Report #${reportRef}` });
    await expect(link).toBeVisible();
    await expect(table).toContainText(`Content removed ${RUN}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/moderation/reports/${reportId}$`));

    // The unvetted superadmin never gets the date-of-birth row, even asking for it by hand: the server leaves it out.
    const dob = await api('GET', '/admin/action-log?action=user.dob_viewed', { token: await getAdminToken() });
    expect(dob.status).toBe(200);
    expect(dob.body.items).toHaveLength(0);
    await page.context().close();
  });

  test('Audit log: a failed load shows the error and Retry recovers', async ({ browser }) => {
    const page = await adminPage(browser);
    let fail = true;
    await page.route('**/admin/action-log*', async (route) => {
      if (fail) await route.abort('failed');
      else await route.continue();
    });
    await page.goto(`${URLS.admin}/activity`);
    await expect(page.getByText('Couldn’t load the audit log')).toBeVisible();
    await expect(page.getByText(/Check the connection and try again\./)).toBeVisible();
    await shot(page, '07-audit-log-error');
    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('table', { name: 'Audit log' })).toBeVisible();
    await page.context().close();
  });

  test('My activity (moderator): own rows only, no actor column or filter, nothing child-safety, nav row present', async ({ browser }) => {
    const page = await adminPageAs(browser, moderator.token);
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/admin/action-log') || req.url().includes('/admin/staff')) requests.push(req.url());
    });

    await page.goto(`${URLS.admin}/dashboard`);
    await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Activity' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search Soccernity' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Activity' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'My activity' })).toBeVisible();
    const table = page.getByRole('table', { name: 'My activity' });
    await expect(table.getByRole('columnheader', { name: 'Time' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actor' })).toHaveCount(0);
    await expect(page.getByLabel('Actor', { exact: true })).toHaveCount(0);
    for (const label of ['Action kind', 'From', 'To']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();

    await expect(table.getByRole('row')).toHaveCount(21);
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(table.getByRole('row')).toHaveCount(28); // 27 visible rows of the moderator's, never the QA admin's
    await expect(table).not.toContainText(ADMIN_CREDENTIALS.fullName);
    await expect(table).not.toContainText('Report actioned');
    await expect(page.getByText(`cs-hidden-${RUN}`)).toHaveCount(0);
    await shot(page, '08-my-activity');

    // No request ever carried an actor filter, and the staff list was never read.
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      expect(url).not.toContain('adminId');
      expect(url).not.toContain('/admin/staff');
    }
    await page.context().close();
  });

  test('My activity (editor with no actions): the empty state never hints that rows are missing', async ({ browser }) => {
    const page = await adminPageAs(browser, editor.token);
    await page.goto(`${URLS.admin}/activity`);
    await expect(page.getByRole('heading', { level: 1, name: 'My activity' })).toBeVisible();
    await expect(page.getByText('No activity yet')).toBeVisible();
    await expect(page.getByText('Your actions will appear here.')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/hidden|restricted|withheld|not allowed|missing|permission/i);
    await shot(page, '09-my-activity-empty');
    await page.context().close();
  });
});
