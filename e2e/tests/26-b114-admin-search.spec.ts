import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, registerViaApi, uniqueEmail, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { ADMIN_CREDENTIALS, URLS } from '../support/stack';

// B-114 (Decision Log #463; backend GET /admin/search, Figma pass "Admin search bar"): the admin search bar and the
// results page, in real Chrome against the real API, Postgres and Redis. Scoped to the search only.
//
// The QA admin is a superadmin, so it sees every group the server returns. The role-restricted case (an editor sees
// only Articles) has no editor in the QA database and is covered by the unit tests of the page and the API's own
// e2e; this spec does not invent one.
test.use({ viewport: { width: 1440, height: 1184 } });

// Screenshots for the visual check against the Figma frames.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b114-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);

async function searchFor(page: Page, text: string): Promise<void> {
  const bar = page.getByRole('textbox', { name: 'Search Soccernity' });
  await bar.fill(text);
  await bar.press('Enter');
}

test.describe.serial('admin search: the bar and the results page', () => {
  let player: Account;
  let enquirySubject = '';

  test.beforeAll(async () => {
    player = await registerViaApi({ age: 30, label: 'srch-player', displayName: `Nelson Search ${RUN}` });
    enquirySubject = `Wrong fixture time ${RUN}`;
    const res = await api('POST', '/contact', {
      body: {
        name: 'Tunde Bello',
        email: uniqueEmail('srch-enq'),
        category: 'data',
        subject: enquirySubject,
        message: 'The kickoff time for Saturday is shown wrongly.',
      },
    });
    if (res.status !== 201) throw new Error(`POST /contact failed ${res.status} ${JSON.stringify(res.body)}`);
  });

  test('the Users page shows a working bar; an exact email opens the results, and the row opens the user', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users`);
    const bar = page.getByRole('textbox', { name: 'Search Soccernity' });
    await expect(bar).toBeVisible();
    await expect(bar).toBeEnabled();
    await expect(page.getByText(/not available yet/i)).toHaveCount(0);
    await expect(page.getByText('Email lookups need the full address, for example name@example.com.')).toBeVisible();
    await shot(page, '01-users-page-bar');

    await searchFor(page, player.email);
    await page.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === player.email);
    await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.getByText(`Results for “${player.email}”`)).toBeVisible();
    await expect(page.getByText('1 result in 1 group')).toBeVisible();
    const users = page.getByRole('table', { name: 'Users' });
    await expect(users).toContainText(`Nelson Search ${RUN}`);
    await shot(page, '02-results-email');

    await users.getByRole('link', { name: /^Open Nelson Search/ }).click();
    await expect(page).toHaveURL(new RegExp(`/users/${player.userId}$`));
    await expect(page.getByRole('heading', { name: `Nelson Search ${RUN}` })).toBeVisible();
    await page.context().close();
  });

  test('the query lives in the URL: a reload and a direct link show the same results', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/search?q=${encodeURIComponent(player.email)}`);
    await expect(page.getByRole('table', { name: 'Users' })).toContainText(`Nelson Search ${RUN}`);
    await expect(page.getByRole('textbox', { name: 'Search Soccernity' })).toHaveValue(player.email);
    await page.reload();
    await expect(page.getByRole('table', { name: 'Users' })).toContainText(`Nelson Search ${RUN}`);
    await page.context().close();
  });

  test('idle, too short (nothing is sent), and no results', async ({ browser }) => {
    const page = await adminPage(browser);
    const searchRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/admin/search')) searchRequests.push(req.url());
    });

    await page.goto(`${URLS.admin}/search`);
    await expect(page.getByText('What you can search')).toBeVisible();
    await expect(page.getByText('Type in the bar above and press Enter. Each result opens the page you already use for it.')).toBeVisible();
    await shot(page, '03-idle');
    expect(searchRequests).toEqual([]);

    await searchFor(page, 'ab');
    await expect(page.getByText('Keep typing')).toBeVisible();
    await expect(page.getByText('Type at least 3 characters to search. Nothing was searched.')).toBeVisible();
    await page.waitForTimeout(400);
    expect(searchRequests).toEqual([]);
    await shot(page, '04-too-short');

    await searchFor(page, `nobody-${RUN}@example.com`);
    await expect(page.getByText(`Results for “nobody-${RUN}@example.com”`)).toBeVisible();
    await expect(page.getByText('0 results')).toBeVisible();
    await expect(page.getByText('No results')).toBeVisible();
    await expect(page.getByText('Nothing matched. Check the spelling, or try the full email address, a user ID or a report ID.')).toBeVisible();
    expect(searchRequests.length).toBe(1);
    await shot(page, '05-no-results');
    await page.context().close();
  });

  test('a contact enquiry (by subject) and a staff member (by exact email) come back as their own groups, each opening its page', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/search`);

    await searchFor(page, enquirySubject);
    const enquiries = page.getByRole('table', { name: 'Contact enquiries' });
    await expect(enquiries).toContainText(enquirySubject);
    await expect(enquiries).toContainText('Data');
    await expect(enquiries).toContainText('New');
    // The message text is never in the results.
    await expect(page.getByText('kickoff time for Saturday')).toHaveCount(0);
    await shot(page, '06-results-enquiry');
    await enquiries.getByRole('link', { name: new RegExp(`^Open ${enquirySubject}`) }).click();
    await expect(page).toHaveURL(/\/moderation\/contact-enquiries\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: /^Enquiry #/ })).toBeVisible();

    await page.goto(`${URLS.admin}/search`);
    await searchFor(page, ADMIN_CREDENTIALS.email);
    const staff = page.getByRole('table', { name: 'Staff' });
    await expect(staff).toContainText(ADMIN_CREDENTIALS.fullName);
    await expect(staff).toContainText('Super Admin');
    await shot(page, '07-results-staff');
    await staff.getByRole('link', { name: `Open ${ADMIN_CREDENTIALS.fullName}` }).click();
    await expect(page).toHaveURL(/\/settings\/roles\/edit\/[0-9a-f-]{36}$/);
    await page.context().close();
  });

  test('an email-shaped search is audited with its kind and count, never its text', async ({ browser }) => {
    const before = await db().adminActionLog.count({ where: { action: 'admin.search_performed' } });
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/search`);
    await searchFor(page, player.email);
    await expect(page.getByRole('table', { name: 'Users' })).toBeVisible();
    await page.context().close();

    const rows = await db().adminActionLog.findMany({ where: { action: 'admin.search_performed' }, orderBy: { createdAt: 'desc' } });
    expect(rows.length).toBe(before + 1);
    expect(rows[0].notes).toContain('kind=email');
    expect(JSON.stringify(rows[0])).not.toContain(player.email);
  });

  test('a failed search shows the error state and Try again recovers', async ({ browser }) => {
    const page = await adminPage(browser);
    let fail = true;
    await page.route('**/admin/search?*', async (route) => {
      if (fail) await route.abort('failed');
      else await route.continue();
    });
    await page.goto(`${URLS.admin}/search?q=${encodeURIComponent(player.email)}`);
    await expect(page.getByText('Couldn’t run the search')).toBeVisible();
    await expect(page.getByText('Check the connection and try again.')).toBeVisible();
    await shot(page, '08-error');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table', { name: 'Users' })).toContainText(`Nelson Search ${RUN}`);
    await page.context().close();
  });
});
