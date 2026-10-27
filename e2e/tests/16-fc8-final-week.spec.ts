import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page, type Request } from '@playwright/test';
import {
  api,
  db,
  getAdminToken,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// FC8 (build register B-092 / B-093 front-end legs; Decision Log #388, #400, #403 item 11, #404 items 6
// and 15, #405 item 7, #406 item 6): the Community-feed "Final week" carousel, the entry a tile opens,
// the impression event, the view heartbeat, the pinned final entry on a finalist's profile, the admin
// impression-distribution view and the rounded leaderboard points.
//
// THE FINAL WEEK IS DRIVEN BY THE REAL CLOCK. The API under test runs on the system clock, and the
// carousel is live from 00:00 on day 25 (Europe/London) to the month end. A contest cycle for the
// CURRENT London month is seeded directly (the admin API refuses a month that has started), with four
// finalist entries whose posts are already revealed. Outside days 25..month end the live tests SKIP
// (they do not fail): run the suite inside the window to exercise them. The rounded-points test does
// not depend on the date.
//
// Every assertion states what the decision records say should happen; a red test is a finding.

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'fc8-final-week-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

function londonParts(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

const NOW = londonParts();
const MONTH_KEY = `${NOW.year}-${String(NOW.month).padStart(2, '0')}`;
const IN_FINAL_WEEK = NOW.day >= 25;
const LIVE_SKIP = 'The final week is live only from day 25 (Europe/London) to the month end; run the suite inside that window.';

type Member = Account & { token: string; username: string };

async function member(label: string, displayName: string): Promise<Member> {
  const a = await registerViaApi({ age: 30, label, displayName });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const username = uniqueUsername(label);
  const res = await api('PATCH', `/users/${a.userId}`, { token, body: { username } });
  expect(res.status).toBe(200);
  return { ...a, token, username };
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

// ISO-8601 week ("YYYY-Www") of a date, UTC: the leaderboard's period key.
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

interface Finalist {
  user: Member;
  entryId: string;
  postId: string;
  text: string;
}

test.describe.serial('Final week: carousel, entry page, impressions, pinned entry, admin view', () => {
  test.skip(!IN_FINAL_WEEK, LIVE_SKIP);

  let viewer: Member;
  const finalists: Finalist[] = [];
  let cycleId = '';

  test.beforeAll(async () => {
    viewer = await member('fwviewer', 'Vera Viewer');
    const monthEnd = new Date(Date.UTC(NOW.year, NOW.month, 1)); // the 1st of next month, close enough for the pin
    const revealed = new Date(Date.now() - 3_600_000);
    const cycle = await db().contestCycle.create({
      data: {
        title: 'QA Final Week',
        status: 'final',
        monthKey: MONTH_KEY,
        description: 'A QA-run final week.',
        minimumTally: 1,
        startsAt: new Date(Date.UTC(NOW.year, NOW.month - 1, 1)),
        endsAt: monthEnd,
        finalOpenedAt: revealed,
        revealedAt: revealed,
        rounds: {
          create: [1, 2, 3, 4].map((weekNumber) => ({
            weekNumber,
            status: weekNumber === 4 ? 'open' : 'judged',
            opensAt: new Date(Date.UTC(NOW.year, NOW.month - 1, 1 + (weekNumber - 1) * 7)),
            closesAt: new Date(Date.UTC(NOW.year, NOW.month - 1, 7 + (weekNumber - 1) * 7)),
            task: weekNumber === 4 ? 'Your best goal' : `Task ${weekNumber}`,
            viewWatchLimitSeconds: weekNumber === 4 ? null : 10,
          })),
        },
      },
      include: { rounds: true },
    });
    cycleId = cycle.id;
    const round4 = cycle.rounds.find((r: { weekNumber: number }) => r.weekNumber === 4);

    const names = ['Ada Brown', 'Ben Cole', 'Cid Dare', 'Ken Obi'];
    for (let i = 0; i < names.length; i++) {
      const user = await member(`fwfin${i}`, names[i]);
      const text = `Final-week entry ${i + 1}: the one-touch dribble drill.`;
      const post = await db().post.create({
        data: {
          authorId: user.userId,
          contentText: text,
          mediaUrls: [`https://cdn.example.com/final-${i + 1}.mp4`],
          visibleFrom: revealed,
          communityFeedFrom: monthEnd,
        },
      });
      const entry = await db().contestEntry.create({
        data: { cycleId, roundId: round4.id, postId: post.id, userId: user.userId, pinnedUntil: monthEnd },
      });
      finalists.push({ user, entryId: entry.id, postId: post.id, text });
    }
  });

  test('the carousel sits at the top of the feed: three tiles per page, the server order, no count of any kind', async ({ page }) => {
    await signIn(page, viewer.email);
    await page.goto('/community');
    const carousel = page.getByTestId('final-week-carousel');
    await expect(carousel).toBeVisible();
    await expect(carousel.getByRole('heading', { name: 'Final week' })).toBeVisible();
    await expect(carousel.getByText('Every finalist is shown to everyone equally.')).toBeVisible();
    await expect(carousel.getByText(/The order is never based on likes, comments, ranking, follower count or when a video was uploaded\./)).toBeVisible();
    await expect(carousel.getByRole('link')).toHaveCount(3);
    await expect(carousel.getByText(/Showing 1.3 of 4 finalists/)).toBeVisible();
    await expect(carousel.getByRole('button', { name: 'Previous finalists' })).toBeDisabled();

    // The order is the server's: the same finalists the carousel endpoint returns, in that order.
    const served = await api('GET', '/contest/final-week/carousel', { token: viewer.token });
    expect(served.body.live).toBe(true);
    const names = served.body.items.map((i: { finalist: { publicName: string } }) => i.finalist.publicName);
    expect(names.length).toBe(4);
    const tiles = await carousel.getByRole('link').allTextContents();
    expect(tiles).toEqual(names.slice(0, 3));

    // No count of any kind in the module, and none in the API answer.
    const text = (await carousel.textContent()) ?? '';
    expect(text).not.toMatch(/\bviews?\b|impressions?|\brank\b/i);
    expect(JSON.stringify(served.body)).not.toMatch(/impression|viewCount|likeCount|commentCount|followers/i);
    await shot(page, 'carousel-community-feed');

    await carousel.getByRole('button', { name: 'Next finalists' }).click();
    await expect(carousel.getByRole('link')).toHaveCount(1);
    await expect(carousel.getByRole('link').first()).toHaveText(names[3]);
    await expect(carousel.getByText(/Showing 4.4 of 4 finalists/)).toBeVisible();
    await expect(carousel.getByRole('button', { name: 'Next finalists' })).toBeDisabled();
  });

  test('a tile opens the entry itself; Back returns to the feed', async ({ page }) => {
    await signIn(page, viewer.email);
    await page.goto('/community');
    const carousel = page.getByTestId('final-week-carousel');
    const tile = carousel.getByRole('link').first();
    const name = (await tile.textContent()) ?? '';
    const href = (await tile.getAttribute('href')) ?? '';
    expect(href).toMatch(/^\/posts\/[0-9a-f-]{36}$/);
    await tile.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    const owner = finalists.find((f) => f.postId === href.split('/').pop())!;
    await expect(page.getByRole('heading', { name: 'Post' })).toBeVisible();
    await expect(page.getByText(owner.text)).toBeVisible();
    await expect(page.getByText('Contest post')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(1);
    await expect(page.getByLabel('Write a comment')).toBeVisible(); // the thread is open straight away
    expect(name.length).toBeGreaterThan(0);
    await shot(page, 'final-entry-page');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/community$/);
  });

  test('an impression is sent only for a tile at least half in view for one continuous second, and the server counts it', async ({ page }) => {
    await signIn(page, viewer.email);
    const sent: Request[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/contest\/entries\/[^/]+\/impression$/.test(r.url())) sent.push(r);
    });
    await page.goto('/community');
    await expect(page.getByTestId('final-week-carousel')).toBeVisible();
    await expect.poll(() => sent.length, { timeout: 8_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);

    // Only the three tiles of the page showing are observed; the fourth is on page 2 and never sent.
    expect(sent.length).toBeLessThanOrEqual(3);
    const entryIds = sent.map((r) => r.url().split('/').slice(-2)[0]);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    for (const id of entryIds) expect(finalists.map((f) => f.entryId)).toContain(id);

    const body = sent[0].postDataJSON();
    expect(body.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.visibleRatio).toBeGreaterThanOrEqual(0.5);
    expect(body.visibleRatio).toBeLessThanOrEqual(1);
    expect(body.visibleMs).toBeGreaterThanOrEqual(1000);
    const response = await sent[0].response();
    expect(response?.status()).toBe(200);
    expect(await response?.json()).toEqual({ counted: true });

    // The server stored exactly what it counted: one row per sent event, no other column about the viewer.
    const rows = await db().contestImpression.findMany({ where: { viewerId: viewer.userId } });
    expect(rows.length).toBe(sent.length);
    expect(Object.keys(rows[0]).sort()).toEqual(['dayKey', 'entryId', 'eventId', 'id', 'occurredAt', 'viewerId']);

    // Nothing on screen says anything was counted.
    await expect(page.getByTestId('final-week-carousel')).not.toContainText(/counted|impression/i);
  });

  test('a finalist never counts their own tile, and the carousel leaves their own entry out', async ({ page }) => {
    const own = finalists[0];
    await signIn(page, own.user.email);
    await page.goto('/community');
    const carousel = page.getByTestId('final-week-carousel');
    await expect(carousel).toBeVisible();
    await expect(carousel.getByRole('link')).toHaveCount(3);
    const hrefs = await carousel.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).not.toContain(`/posts/${own.postId}`);
  });

  test('another person\'s post on screen reports a heartbeat (activity only, never "seconds watched")', async ({ page }) => {
    await signIn(page, viewer.email);
    const beats: Request[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/posts\/[^/]+\/view-heartbeat$/.test(r.url())) beats.push(r);
    });
    await page.goto(`/posts/${finalists[1].postId}`);
    await expect(page.getByText(finalists[1].text)).toBeVisible();
    await expect.poll(() => beats.length, { timeout: 8_000 }).toBeGreaterThan(0);
    const body = beats[0].postDataJSON();
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof body.active).toBe('boolean');
    // The fake video URL never plays, so the page honestly reports "not active".
    expect(body.active).toBe(false);
    expect(Object.keys(body)).not.toContain('seconds');
    expect(Object.keys(body)).not.toContain('watchedSeconds');
    const res = await beats[0].response();
    expect(res?.status()).toBe(200);
    expect(Object.keys(await res!.json())).toEqual(['done']);
  });

  test('the pinned final entry shows on the finalist\'s own profile, unlocked after the reveal, with its counts', async ({ page }) => {
    const own = finalists[2];
    await signIn(page, own.user.email);
    await page.goto('/profile');
    const pinned = page.getByTestId('pinned-entry');
    await expect(pinned).toBeVisible();
    await expect(pinned.getByText('Pinned', { exact: true })).toBeVisible();
    await expect(pinned.getByText('Contest post')).toBeVisible();
    await expect(pinned.getByText(own.text)).toBeVisible();
    await expect(pinned.getByTestId('engagement-locked')).toHaveCount(0);
    await expect(pinned.getByRole('button', { name: /0 likes/ })).toBeEnabled();
    await shot(page, 'pinned-entry-own-profile');
  });

  test('another signed-in person sees the pinned entry on the finalist\'s profile', async ({ page }) => {
    await signIn(page, viewer.email);
    await page.goto(`/users/${finalists[3].user.userId}`);
    const pinned = page.getByTestId('pinned-entry');
    await expect(pinned).toBeVisible();
    await expect(pinned.getByText(finalists[3].text)).toBeVisible();
  });

  test('admin: the impression distribution shows the finalists, the mean and the band, aggregates only', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.setViewportSize({ width: 1440, height: 1184 });
    await page.goto(`${URLS.admin}/contest/impressions`);
    const table = page.getByTestId('ct-impressions-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('ct-impressions-row')).toHaveCount(4);
    await expect(page.getByText('Live from reveal')).toBeVisible();
    await expect(page.getByTestId('ct-imp-mean')).not.toHaveText('—');
    await expect(page.getByTestId('ct-imp-band')).not.toHaveText('—');
    const total = await db().contestImpression.count({ where: { entry: { cycleId } } });
    expect(total).toBeGreaterThan(0);

    const bodyText = (await page.locator('body').textContent()) ?? '';
    // Aggregates only: nobody who viewed anything is named.
    expect(bodyText).not.toContain(viewer.email);
    expect(bodyText).not.toContain(viewer.username);
    expect(bodyText).not.toContain(viewer.userId);
    await expect(page.getByTestId('ct-impressions-method')).toContainText('no per-viewer data is shown');
    await shot(page, 'admin-impressions');

    // The API behind it, directly.
    const token = await getAdminToken();
    const exposure = await api('GET', `/admin/contest/cycles/${cycleId}/exposure`, { token });
    expect(exposure.status).toBe(200);
    expect(exposure.body.finalistCount).toBe(4);
    expect(JSON.stringify(exposure.body)).not.toMatch(new RegExp(viewer.userId));
  });
});

test.describe('Leaderboard points are shown rounded; ranking uses the exact total', () => {
  test('two players who show the same whole points hold different ranks, with the note that says so', async ({ page }) => {
    const a = await member('lbfrac1', 'Pia Fractional');
    const b = await member('lbfrac2', 'Quin Fractional');
    const period = isoWeek(new Date());
    // 13273 quarter-points = 3318.25 (shows 3,318); 13271 = 3317.75 (also shows 3,318, ranks lower).
    await db().leaderboardEntry.create({ data: { userId: a.userId, period, quarterPoints: 13273, rank: 1 } });
    await db().leaderboardEntry.create({ data: { userId: b.userId, period, quarterPoints: 13271, rank: 2 } });

    const viewerAccount = await member('lbview', 'Rae Viewer');
    await signIn(page, viewerAccount.email);
    await page.goto('/leaderboard');
    const rowA = page.getByRole('row').filter({ hasText: a.username });
    const rowB = page.getByRole('row').filter({ hasText: b.username });
    await expect(rowA).toBeVisible();
    await expect(rowA).toContainText('3,318');
    await expect(rowB).toContainText('3,318');
    await expect(rowA.locator('td').first()).toHaveText('1');
    await expect(rowB.locator('td').first()).toHaveText('2');
    expect(await page.locator('table.lb-table').first().textContent()).not.toMatch(/\.\d/);
    await expect(page.getByTestId('rounded-points-note')).toContainText('Ranking uses the exact total');
    await shot(page, 'leaderboard-rounded-points');

    const api1 = await api('GET', `/leaderboard?period=${period}`, { token: viewerAccount.token });
    const items = api1.body.items as { publicName: string; points: number; rank: number }[];
    const ia = items.find((i) => i.publicName === a.username)!;
    const ib = items.find((i) => i.publicName === b.username)!;
    expect(ia.points).toBe(3318);
    expect(ib.points).toBe(3318);
    expect(ia.rank).toBeLessThan(ib.rank);
  });
});
