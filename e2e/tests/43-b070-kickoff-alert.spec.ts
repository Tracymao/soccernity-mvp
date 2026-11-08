import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { db, loginViaUi, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-070 (Decision Log #472): the kickoff-alert button on the Sports Hub match cards and the Match Centre header,
// in real Chrome against the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// REAL: the credentials (the three reads send the access token only when signed in, read from the browser's own
// requests), the saved alert (read back from Postgres), the state surviving a reload (it comes from the per-caller
// `kickoffAlert` flag), and the real 409 (the match is moved past its kickoff behind the page's back, then clicked).
// STUBBED IN THE BROWSER: the failed save (a 500 on the PUT), which cannot be produced against a healthy server.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b070-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const RUN = Date.now().toString(36);
const names = (k: string) => ({ home: `KO ${k} Home ${RUN}`, away: `KO ${k} Away ${RUN}` });

// Fixtures are read by UTC date, so a "scheduled" match that has NOT kicked off must sit later today (UTC).
function laterTodayUtc(): Date | null {
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 0, 0);
  const wanted = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const kickoff = wanted > endOfDay ? endOfDay : wanted;
  return kickoff.getTime() - Date.now() > 60_000 ? kickoff : null;
}

async function seedMatch(key: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const n = names(key);
  const externalRef = `qa-b070-${key}-${RUN}`;
  await db().matchData.create({
    data: {
      externalRef,
      competition: 'Premier League',
      teams: [n.home, n.away],
      status: 'scheduled',
      statusDetail: 'Not started',
      kickoffTime: laterTodayUtc() ?? new Date(),
      leagueId: '39',
      leagueName: 'Premier League',
      season: '2026',
      homeTeamId: `h-${key}`,
      homeTeamName: n.home,
      awayTeamId: `a-${key}`,
      awayTeamName: n.away,
      ...overrides,
    },
  });
  return externalRef;
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

async function openToday(page: Page): Promise<void> {
  await page.goto('/sports-hub');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
}

const card = (page: Page, key: string) => page.locator('li', { has: page.getByRole('link', { name: new RegExp(names(key).home) }) });
const subscriptionRow = (acct: Account, externalRef: string) =>
  db().matchSubscription.findFirst({ where: { userId: acct.userId, externalRef } });

test.describe.serial('Kickoff alert on the match card and the match header', () => {
  let person: Account;
  let refA: string; // the main scheduled match
  let refLive: string;
  let refRace: string; // moved past its kickoff behind the page's back
  let refErr: string;

  test.beforeAll(async () => {
    test.skip(laterTodayUtc() === null, 'Too close to the end of the UTC day to seed a match that has not kicked off.');
    person = await registerViaApi({ age: 30, label: 'ko-person' });
    await verifyEmailViaApi(person);
    await db().user.update({ where: { id: person.userId }, data: { username: uniqueUsername('ko') } });
    refA = await seedMatch('a');
    refLive = await seedMatch('live', { status: 'live', statusDetail: "12'", homeScore: 0, awayScore: 0, kickoffTime: new Date(Date.now() - 12 * 60 * 1000) });
    refRace = await seedMatch('race');
    refErr = await seedMatch('err');
  });

  test('a logged-out visitor sees the matches and no control, and the reads carry no credentials', async ({ page }) => {
    const reads: Array<{ url: string; authorization: string | undefined }> = [];
    page.on('request', (r) => {
      if (/\/sports\/(fixtures|live-scores)/.test(r.url())) reads.push({ url: r.url(), authorization: r.headers()['authorization'] });
    });
    await openToday(page);
    await expect(card(page, 'a')).toBeVisible();
    await expect(page.locator('.ka')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /alert me at kickoff|match started/i })).toHaveCount(0);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.authorization === undefined)).toBe(true);

    await page.goto(`/sports-hub/matches/${refA}`);
    await expect(page.locator('.mc-header')).toBeVisible();
    await expect(page.locator('.ka')).toHaveCount(0);
    await shot(page, '00-logged-out-header-desktop');
  });

  test('signed in: the reads carry the token; Off, then Saving, then On; saved in Postgres; still On after a reload', async ({ page }) => {
    await signIn(page, person.email);
    const reads: Array<{ url: string; authorization: string | undefined }> = [];
    page.on('request', (r) => {
      if (/\/sports\/(fixtures|live-scores)/.test(r.url())) reads.push({ url: r.url(), authorization: r.headers()['authorization'] });
    });
    await openToday(page);
    const row = card(page, 'a');
    await expect(row).toBeVisible();
    expect(reads.some((r) => (r.authorization ?? '').startsWith('Bearer '))).toBe(true);

    const off = row.getByRole('button', { name: 'Alert me at kickoff' });
    await expect(off).toBeVisible();
    await expect(off).toHaveAttribute('aria-pressed', 'false');
    await shot(page, '01-card-off-desktop');

    await off.click();
    await expect(row.getByRole('button', { name: 'Alert on' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Alert on' })).toHaveAttribute('aria-pressed', 'true');
    expect(await subscriptionRow(person, refA)).not.toBeNull();
    await shot(page, '02-card-on-desktop');

    // It survives a refresh: the state comes from the per-caller flag the read returns.
    await page.reload();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(card(page, 'a').getByRole('button', { name: 'Alert on' })).toBeVisible();

    // And back off: the row is removed.
    await card(page, 'a').getByRole('button', { name: 'Alert on' }).click();
    await expect(card(page, 'a').getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();
    expect(await subscriptionRow(person, refA)).toBeNull();
  });

  test('the control is not part of the card link: a click does not leave the Sports Hub', async ({ page }) => {
    await signIn(page, person.email);
    await openToday(page);
    await card(page, 'a').getByRole('button', { name: 'Alert me at kickoff' }).click();
    await expect(card(page, 'a').getByRole('button', { name: 'Alert on' })).toBeVisible();
    await expect(page).toHaveURL(/\/sports-hub$/);
    await card(page, 'a').getByRole('button', { name: 'Alert on' }).click(); // leave it off for the next tests
    await expect(card(page, 'a').getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();
  });

  test('a live match shows a disabled Match started and never creates an alert', async ({ page }) => {
    await signIn(page, person.email);
    await page.goto('/sports-hub'); // the Live tab is the default
    const row = card(page, 'live');
    await expect(row).toBeVisible();
    const started = row.getByRole('button', { name: 'Match started' });
    await expect(started).toBeDisabled();
    await shot(page, '03-card-started-desktop');
    await started.click({ force: true });
    expect(await subscriptionRow(person, refLive)).toBeNull();
  });

  test('a match that kicks off behind the page: the real 409 turns the control into Match started', async ({ page }) => {
    await signIn(page, person.email);
    await openToday(page);
    const row = card(page, 'race');
    await expect(row.getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();
    // The kickoff passes after the page was drawn: the server now refuses the alert.
    await db().matchData.update({ where: { externalRef: refRace }, data: { kickoffTime: new Date(Date.now() - 60_000) } });
    await row.getByRole('button', { name: 'Alert me at kickoff' }).click();
    await expect(row.getByRole('button', { name: 'Match started' })).toBeDisabled();
    await expect(row.getByRole('alert')).toHaveCount(0);
    expect(await subscriptionRow(person, refRace)).toBeNull();
  });

  test('a failed save shows Try again and the line, and the retry repeats the same change', async ({ page }) => {
    await signIn(page, person.email);
    await openToday(page);
    const row = card(page, 'err');
    await expect(row.getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();

    await page.route('**/sports/matches/*/subscription', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }));
    await row.getByRole('button', { name: 'Alert me at kickoff' }).click();
    const retry = row.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    await expect(row.getByRole('alert')).toHaveText('Couldn’t update the alert. Try again.');
    await shot(page, '04-card-error-desktop');
    expect(await subscriptionRow(person, refErr)).toBeNull();

    await page.unroute('**/sports/matches/*/subscription');
    await retry.click();
    await expect(row.getByRole('button', { name: 'Alert on' })).toBeVisible();
    expect(await subscriptionRow(person, refErr)).not.toBeNull();
    await expect(row.getByRole('alert')).toHaveCount(0);
  });

  test('match details header: labelled control, On survives a reload, live shows Match started', async ({ page }) => {
    await signIn(page, person.email);
    await page.goto(`/sports-hub/matches/${refA}`);
    const header = page.locator('.mc-header');
    const off = header.getByRole('button', { name: 'Alert me at kickoff' });
    await expect(off).toBeVisible();
    await expect(off).toHaveText('Alert me at kickoff');
    await shot(page, '05-header-off-desktop');

    await off.click();
    await expect(header.getByRole('button', { name: 'Alert on' })).toBeVisible();
    expect(await subscriptionRow(person, refA)).not.toBeNull();
    await shot(page, '06-header-on-desktop');

    await page.reload();
    await expect(page.locator('.mc-header').getByRole('button', { name: 'Alert on' })).toBeVisible();

    await page.goto(`/sports-hub/matches/${refLive}`);
    const started = page.locator('.mc-header').getByRole('button', { name: 'Match started' });
    await expect(started).toBeDisabled();
    await shot(page, '07-header-started-desktop');

    // Leave this alert off.
    await page.goto(`/sports-hub/matches/${refA}`);
    await page.locator('.mc-header').getByRole('button', { name: 'Alert on' }).click();
    await expect(page.locator('.mc-header').getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();
  });

  test('390px: card and header controls fit with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, person.email);
    await openToday(page);
    const row = card(page, 'a');
    await expect(row.getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shot(page, '08-card-off-mobile');

    await page.goto(`/sports-hub/matches/${refA}`);
    await expect(page.locator('.mc-header').getByRole('button', { name: 'Alert me at kickoff' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shot(page, '09-header-off-mobile');
  });
});
