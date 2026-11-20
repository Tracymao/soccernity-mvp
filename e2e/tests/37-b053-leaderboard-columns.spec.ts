import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import {
  db,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  api,
  type Account,
} from '../support/helpers';

// B-053 (Decision Log #472): the All-time period, the Club column and the 7-day change on the Overall
// leaderboard, in real Chrome against the real API, Postgres and Redis. Scoped to the new columns only.
//
// The board rows are written straight into LeaderboardEntry (period 'all-time', the global board) because a
// real rollup needs a points ledger and a seven-day history; what the page shows still comes from the real
// GET /leaderboard?period=all-time, which turns rank and rankSevenDaysAgo into rankChange7d (rank now minus
// rank seven days ago, so a NEGATIVE value is a place GAINED and gets an up arrow).
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b053-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

interface Member extends Account {
  userId: string;
  username: string;
}

async function member(label: string): Promise<Member> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const token = (await me(acct)).token;
  const username = uniqueUsername(label.slice(0, 4));
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...acct, userId: acct.userId, username };
}

async function row(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name });
}

test.describe('Leaderboard: All-time, Club and 7-day change', () => {
  test('draws the club and the 7-day change from the real endpoint, desktop and mobile', async ({ page }) => {
    test.setTimeout(180_000);
    const viewer = await member('lbview');
    const up = await member('lbup');
    const down = await member('lbdown');
    const same = await member('lbsame');
    const fresh = await member('lbnew');

    const prisma = db();
    const club = await prisma.clubPage.create({ data: { name: `Ikoyi Rovers ${Date.now()}` } });
    await prisma.user.update({ where: { id: up.userId }, data: { representedClubId: club.id } });

    // rank now vs rank seven days earlier: up 1 -> 4 (change -3), down 2 -> 1 (change +1... see below),
    // same 3 -> 3 (0), fresh 4 -> not on the board (null).
    const entries = [
      { user: up, rank: 1, points: 40, seven: 4 }, // -3: moved UP three places
      { user: down, rank: 2, points: 30, seven: 1 }, // +1: moved DOWN one place
      { user: same, rank: 3, points: 20, seven: 3 }, // 0: no change
      { user: fresh, rank: 4, points: 10, seven: null }, // null: not on the board a week ago
    ];
    for (const e of entries) {
      await prisma.leaderboardEntry.create({
        data: {
          userId: e.user.userId,
          period: 'all-time',
          clubId: '',
          rank: e.rank,
          quarterPoints: e.points * 4,
          rankSevenDaysAgo: e.seven,
        },
      });
    }

    await loginViaUi(page, viewer.email);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/leaderboard');

    // Weekly is the default board. Earlier specs leave ranked players on the weekly board of the shared QA
    // database, so this test cannot assume it is empty (the empty card itself is covered by the web unit tests).
    // What it owns is that its own all-time rows are NOT on the weekly board: they were written to 'all-time' only.
    await expect(page.getByRole('radio', { name: 'Weekly' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'All-time' })).not.toBeChecked();
    await expect(page.getByText(up.username)).toHaveCount(0);
    await shot(page, 'overall-weekly-desktop');
    await page.getByRole('radio', { name: 'All-time' }).click();

    const upRow = await row(page, up.username);
    await expect(upRow).toBeVisible();
    await expect(upRow.getByLabel('Up 3 places over the last 7 days')).toHaveText('▲3');
    await expect(upRow.getByText(club.name)).toBeVisible();

    const downRow = await row(page, down.username);
    await expect(downRow.getByLabel('Down 1 place over the last 7 days')).toHaveText('▼1');
    const sameRow = await row(page, same.username);
    await expect(sameRow.getByLabel('Rank unchanged over the last 7 days')).toHaveText('0');
    const freshRow = await row(page, fresh.username);
    await expect(freshRow.getByLabel('No rank change figure for the last 7 days')).toHaveText('—');

    // A person with no club shows a plain dash in the Club column.
    const clubCell = sameRow.getByRole('cell').nth(2);
    await expect(clubCell).toHaveText('—');

    await expect(page.getByRole('columnheader').allTextContents()).resolves.toEqual([
      'Rank',
      'Player',
      'Club',
      '7-day change',
      'Points',
    ]);
    await shot(page, 'overall-all-time-desktop');

    // Mobile (Figma 5540:7264): club under the name, change under the points, three columns.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(page.getByRole('columnheader')).toHaveText(['#', 'Player', 'Pts']);
    const mobileUp = await row(page, up.username);
    await expect(mobileUp.getByText(club.name)).toBeVisible();
    await expect(mobileUp.getByLabel('Up 3 places over the last 7 days')).toHaveText('▲3');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);
    await shot(page, 'overall-all-time-mobile');

    // Back to Weekly: our all-time rows are gone from the board again, on mobile too.
    await page.getByRole('radio', { name: 'Weekly' }).click();
    await expect(page.getByRole('radio', { name: 'Weekly' })).toBeChecked();
    await expect(page.getByText(up.username)).toHaveCount(0);
    await shot(page, 'overall-weekly-mobile');
  });
});
