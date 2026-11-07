import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { db, registerViaApi } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// B-056 (Decision Log #472): the Admin Dashboard's Latest posts table, in real Chrome with the real API, Postgres and Redis.
// Scoped to this screen. The default state is REAL: posts are written to Postgres and the table is what the real
// GET /admin/dashboard/latest-posts returns. The loading, empty and error states are produced by delaying, emptying or
// failing that one answer in the browser (the QA database is shared and never empty, and a real 500 cannot be forced).
//
// Seeded posts are dated in 2031 so they are the five newest whatever other specs left in the shared database. Admin logins
// are limited (Decision Log #190); this spec spends none beyond the cached QA admin token.
test.use({ viewport: { width: 1440, height: 1184 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b056-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const POSTS_URL = `${URLS.api}/admin/dashboard/latest-posts*`;

// Let the real request through (so the real CORS headers come back) and then change what the page sees.
async function alter(route: Route, change: (body: unknown) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>) {
  if (route.request().method() === 'OPTIONS') {
    await route.continue();
    return;
  }
  const real = await route.fetch();
  const out = await change(await real.json().catch(() => []));
  await route.fulfill({ response: real, status: out.status ?? real.status(), body: JSON.stringify(out.body) });
}

test.describe.serial('admin Dashboard: Latest posts', () => {
  const seeded: { photo: string; plain: string; video: string; gone: string } = { photo: '', plain: '', video: '', gone: '' };
  const authors: { name: string; username: string; userId: string }[] = [];

  test.beforeAll(async () => {
    const makeAuthor = async (label: string, over: Record<string, unknown> = {}) => {
      const acct = await registerViaApi({ age: 30, label: `b056-${label}`, displayName: `Real Name ${label}` });
      const username = `b056_${label}_${RUN}`.slice(0, 30);
      await db().user.update({ where: { id: acct.userId }, data: { username, ...over } });
      authors.push({ name: `Real Name ${label}`, username, userId: acct.userId });
      return { acct, username };
    };
    const a = await makeAuthor('a');
    const b = await makeAuthor('b');
    const c = await makeAuthor('c');
    // A deactivated author: their post must never show, even though it is the newest.
    const d = await makeAuthor('d', { accountStatus: 'deactivated' });
    // A member with no username: shown as "Soccernity member".
    const e = await registerViaApi({ age: 30, label: 'b056-e', displayName: 'Real Name e' });
    await db().user.update({ where: { id: e.userId }, data: { username: null } });

    const mk = (authorId: string, createdAt: string, contentText: string, extra: Record<string, unknown> = {}) =>
      db().post.create({ data: { authorId, createdAt: new Date(createdAt), contentText, likeCount: 0, commentCount: 0, ...extra } });

    seeded.gone = (await mk(d.acct.userId, '2031-03-09T10:00:00.000Z', `B056 from a deactivated account ${RUN}`)).id;
    seeded.photo = (
      await mk(a.acct.userId, '2031-03-05T23:30:00.000Z', `B056 photo post ${RUN} Great turnout at the Sunday league game today. Thanks to everyone who came out to support the team in the rain and the cold.`, {
        mediaUrls: ['https://example.test/pitch.jpg'],
        likeCount: 24,
        commentCount: 6,
      })
    ).id;
    seeded.plain = (await mk(e.userId, '2031-03-05T09:00:00.000Z', `B056 no media post ${RUN}`, { likeCount: 0, commentCount: 0 })).id;
    seeded.video = (
      await mk(b.acct.userId, '2031-03-04T10:00:00.000Z', `B056 video post ${RUN}`, { mediaUrls: ['https://example.test/warmup.mp4'], likeCount: 41, commentCount: 12 })
    ).id;
    await mk(c.acct.userId, '2031-03-03T10:00:00.000Z', `B056 third ${RUN}`, { likeCount: 3, commentCount: 14 });
    await mk(c.acct.userId, '2031-03-02T10:00:00.000Z', `B056 fourth ${RUN}`, { likeCount: 17, commentCount: 2 });
    // A sixth, older one: the table shows five.
    await mk(c.acct.userId, '2031-03-01T10:00:00.000Z', `B056 sixth never shown ${RUN}`);
  });

  test('the real table: five newest first, media tag or dash, public name only, left-out posts absent, stats tiles in order', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/`);

    await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // Stat tiles, in the drawn order, with no "New users by league" and no sample caption anywhere.
    const labels = await page.locator('.admin-dashboard__stat-label').allTextContents();
    expect(labels).toEqual(['Total Visits', 'Total Articles', 'Community Users', 'New This Month']);
    await expect(page.getByText('New users by league')).toHaveCount(0);
    await expect(page.getByText(/sample — not real data/i)).toHaveCount(0);

    await expect(page.locator('thead th')).toHaveText(['Date', 'Media', 'Post', 'Author', 'Likes', 'Comments']);
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(5);

    const cells = async (i: number) => (await rows.nth(i).locator('td').allTextContents()).map((t) => t.trim());
    const first = await cells(0);
    expect(first[0]).toBe('05/03/2031'); // 23:30 UTC stays the 5th for every viewer
    expect(first[1]).toBe('Photo');
    expect(first[2]).toContain('Great turnout at the Sunday league game today.');
    expect(first[3]).toBe(authors[0].username);
    expect(first.slice(4)).toEqual(['24', '6']);

    const second = await cells(1);
    expect(second[1]).toBe('—');
    expect(second[3]).toBe('Soccernity member');
    expect(second.slice(4)).toEqual(['0', '0']);

    const third = await cells(2);
    expect(third[0]).toBe('04/03/2031');
    expect(third[1]).toBe('Video');
    expect(third.slice(4)).toEqual(['41', '12']);

    const text = await table.innerText();
    expect(text).not.toContain('from a deactivated account');
    expect(text).not.toContain('sixth never shown');
    // The public name only: no real name, no email, no id.
    expect(text).not.toContain('Real Name');
    expect(text).not.toMatch(/@soccernity\.test|@example\./);
    for (const id of Object.values(seeded)) expect(text).not.toContain(id);

    await expect(page.getByText('Newest first')).toBeVisible();
    // The long post is cut to two lines.
    const clamp = await rows.first().locator('.admin-dashboard__post-text span').evaluate((el) => {
      const s = getComputedStyle(el);
      return { lines: s.webkitLineClamp, overflow: s.overflow };
    });
    expect(clamp).toEqual({ lines: '2', overflow: 'hidden' });
    await shot(page, '01-default');
    await page.context().close();
  });

  test('loading: a skeleton with the column headers until the answer arrives', async ({ browser }) => {
    const page = await adminPage(browser);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(POSTS_URL, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(`${URLS.admin}/`);

    await expect(page.getByText('Loading the latest posts…')).toBeAttached();
    await expect(page.locator('.admin-dashboard__posts-row')).toHaveCount(5);
    await expect(page.locator('.admin-dashboard__posts-head span')).toHaveText(['Date', 'Media', 'Post', 'Author', 'Likes', 'Comments']);
    await expect(page.getByRole('table')).toHaveCount(0);
    await shot(page, '02-loading');

    release();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('.admin-dashboard__posts-row')).toHaveCount(0);
    await page.context().close();
  });

  test('empty: "No posts yet" and no table', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.route(POSTS_URL, (route) => alter(route, () => ({ body: [] })));
    await page.goto(`${URLS.admin}/`);

    await expect(page.getByText('No posts yet')).toBeVisible();
    await expect(page.getByText('Posts that people share will appear here.')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText('Newest first')).toHaveCount(0);
    await shot(page, '03-empty');
    await page.context().close();
  });

  test('error: the fixed banner, never the server text, and Try again loads the real posts', async ({ browser }) => {
    const page = await adminPage(browser);
    let fail = true;
    await page.route(POSTS_URL, (route) => (fail ? alter(route, () => ({ status: 500, body: { message: 'SQL exploded at row 3' } })) : route.continue()));
    await page.goto(`${URLS.admin}/`);

    const banner = page.getByRole('alert').filter({ hasText: 'Couldn’t load the latest posts' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Check the connection and try again.');
    await expect(page.getByText(/SQL exploded/)).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    // The stats are untouched by the failure.
    await expect(page.locator('.admin-dashboard__stat-label')).toHaveCount(4);
    await shot(page, '04-error');

    fail = false;
    await banner.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(5);
    await expect(banner).toHaveCount(0);
    await page.context().close();
  });
});
