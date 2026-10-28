import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi } from '../support/helpers';
import { restartApi } from '../support/api-process';
import { makeMp4 } from '../support/media-fixtures';
import {
  contestPhaseInstant,
  isContestPhase,
  scheduleFor,
  seedContestAtPhase,
  type ContestMember,
  type ContestPhase,
  type SeededContest,
} from '../support/contest-clock';
import {
  activate,
  createJourneyCycle,
  createMembers,
  currentContest,
  freshToken,
  sceneInstant,
  seedFinalEntry,
  seedPodiumVotes,
  seedWeeklyEntry,
  waitForCycleStatus,
  waitForFinalistsSelected,
  waitForRoundStatus,
  waitForWinners,
  type JourneyCycle,
  type Scene,
} from '../support/contest-journey';

// This file has TWO parts. The first is the whole-month journey (FC9): it moves the API clock itself
// and needs no environment variable. The second is the single-phase run (backend/test-clock-qa).
//
// backend/test-clock-qa. Drives ONE live Contest phase in a real browser against the real API
// running on the environment-driven test clock. The API clock is set when the suite STARTS, so one
// run covers one phase:
//
//   QA_CONTEST_PHASE=week1_phase2 npx playwright test 17
//   QA_CONTEST_PHASE=final_live   npx playwright test 17
//
// (phases: see CONTEST_PHASES in support/contest-clock.ts; QA_CONTEST_MONTH defaults to 2026-11).
// Without QA_CONTEST_PHASE the suite skips: in the default full run the API is on the real clock.

const PHASE = process.env.QA_CONTEST_PHASE?.trim();
const MONTH = process.env.QA_CONTEST_MONTH?.trim() || undefined;

// What the web Contest page headline says for each phase (ContestPage.tsx).
function headingFor(phase: ContestPhase): RegExp {
  if (phase.endsWith('_phase1')) return /Task for this week/;
  if (phase.endsWith('_phase2')) return /Voting is open/;
  if (phase.startsWith('between_weeks')) return /Between weeks/;
  if (phase === 'week4_upload') return /Week 4 final: finalists are uploading/;
  return /The final is live/;
}

// =================================================================================================
// THE WHOLE MONTH, ONE RUN (FC9, build register B-091 / B-092 / B-098 / B-099 / B-123; Decision Log
// #381-#418, docs/contest-spec.md; Figma pass P, K12 for the nine-finalist carousel).
//
// The API clock is environment-only, so each scene RESTARTS the real API on the instant it needs
// (support/api-process.ts) and the real ContestLifecycleService, on its one-minute tick, makes every
// decision. Only inputs are seeded (members, entries, votes, the other finalists' final entries);
// the join, the entry, the vote toggle, the week-4 upload, the carousel and every page are driven
// in real Chrome. Scenes wait for the database to show the lifecycle's decision before looking at
// the page. The API is put back on the real clock afterwards.
//
// Skipped when QA_CONTEST_PHASE / QA_TEST_CLOCK_ISO is set: those pin the clock for the single-phase
// run below, and this journey needs to move it.
// =================================================================================================

const NOV = '2026-11';
const DEC = '2026-12';
const JOURNEY_PINNED = !!(PHASE || process.env.QA_TEST_CLOCK_ISO?.trim());

async function signIn(page: Page, member: ContestMember): Promise<void> {
  await loginViaUi(page, member.email, member.password);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

async function clockAt(scene: Scene, monthKey: string): Promise<void> {
  await restartApi({ iso: sceneInstant(scene, monthKey).toISOString() });
}

test.describe.serial('Contest month on the API test clock: every phase in real Chrome', () => {
  test.skip(JOURNEY_PINNED, 'The clock is pinned by QA_CONTEST_PHASE / QA_TEST_CLOCK_ISO; the journey moves it itself.');
  // Every scene restarts the API and waits for a lifecycle tick (up to a minute or two).
  test.beforeEach(() => {
    test.setTimeout(360_000);
  });

  // members[0..8] are the nine weekly winners (three per week); members[9] is a viewer who never wins.
  let members: ContestMember[] = [];
  const viewer = () => members[9];
  let shot = 0;
  const shotDir = path.resolve(__dirname, '..', '.run', 'artifacts');
  async function snap(page: Page, name: string) {
    fs.mkdirSync(shotDir, { recursive: true });
    shot += 1;
    await page.screenshot({ path: path.join(shotDir, `journey-${String(shot).padStart(2, '0')}-${name}.png`), fullPage: true });
  }

  let nov: JourneyCycle;
  const weeklyEntry: Record<1 | 2 | 3, Map<number, string>> = { 1: new Map(), 2: new Map(), 3: new Map() };

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    await db().contestCycle.deleteMany({}); // spec 16 may have left a cycle for the real month
    members = await createMembers(10);
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    await db().contestCycle.deleteMany({});
    await restartApi({}); // back on the real clock for anything that runs after this spec
  });

  // ---- a forfeited week: the pop-up --------------------------------------------------------------

  test('a week with fewer than three entries is forfeited by the lifecycle, and the pop-up shows on every load of the Contest page and the Voting page', async ({ page }) => {
    const dec = await createJourneyCycle(DEC);
    await seedWeeklyEntry(dec, 1, members[0], 0);
    await seedWeeklyEntry(dec, 1, members[1], 1);
    await clockAt('week1_phase2', DEC);
    await activate(dec);
    await waitForRoundStatus(dec, 1, 'judged');

    const state = await currentContest(viewer());
    expect(state.forfeitedWeeks).toHaveLength(1);
    const reason: string = state.forfeitedWeeks[0].reason;
    expect(state.calendarState.kind).toBe('week_forfeited');

    await signIn(page, viewer());
    await page.goto('/contest');
    const popup = page.getByTestId('forfeit-popup');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('alertdialog')).toContainText('Week 1 was forfeited');
    await expect(popup).toContainText(reason);
    await snap(page, 'forfeit-popup');
    await popup.getByRole('button', { name: 'OK' }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Week 1 was forfeited' })).toBeVisible();

    // Nothing is remembered: it comes back on a reload...
    await page.reload();
    await expect(page.getByTestId('forfeit-popup')).toBeVisible();
    await page.getByTestId('forfeit-popup').getByRole('button', { name: 'OK' }).click();

    // ...and on the Voting page, which has nothing to vote on.
    await page.goto('/contest/voting');
    await expect(page.getByTestId('forfeit-popup')).toBeVisible();
    await page.getByTestId('forfeit-popup').getByRole('button', { name: 'OK' }).click();
    await expect(page.getByText(/Voting isn.t open right now/)).toBeVisible();

    // The leaderboard Contest tab writes "Forfeited" in place of the three names, with no pop-up.
    await page.goto('/leaderboard?tab=contest');
    await expect(page.getByText('Forfeited', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('forfeit-popup')).toHaveCount(0);

    await db().contestCycle.deleteMany({ where: { monthKey: DEC } });
  });

  // ---- week 1, Phase 1: join and enter ---------------------------------------------------------------

  test('week 1 Phase 1: a member joins the contest and enters in the browser', async ({ page }) => {
    nov = await createJourneyCycle(NOV);
    // Week 1 entrants are members 0-7; member 8 joins through the browser below. Weeks 2 and 3 are
    // fully seeded (all nine members) so the lifecycle has something to decide when the clock moves on.
    for (let i = 0; i < 8; i++) weeklyEntry[1].set(i, await seedWeeklyEntry(nov, 1, members[i], i));
    for (const week of [2, 3] as const) {
      for (let i = 0; i < 9; i++) weeklyEntry[week].set(i, await seedWeeklyEntry(nov, week, members[i], i));
    }
    // Week 1: 3 / 2 / 1 for members 0, 1, 2 (member 6 adds a fourth vote for member 0 in the browser).
    await seedPodiumVotes(nov, 1, members, (i) => weeklyEntry[1].get(i)!, [0, 1, 2]);
    await seedPodiumVotes(nov, 2, members, (i) => weeklyEntry[2].get(i)!, [3, 4, 5]);
    await seedPodiumVotes(nov, 3, members, (i) => weeklyEntry[3].get(i)!, [6, 7, 8]);

    await clockAt('week1_phase1', NOV);
    await activate(nov);

    const joiner = members[8];
    await signIn(page, joiner);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Task for this week' })).toBeVisible();
    await expect(page.getByText(/Week 1 is live/)).toBeVisible();
    await snap(page, 'week1-phase1-contest');

    await page.getByRole('link', { name: 'Join Contest' }).click();
    await expect(page).toHaveURL(/\/community\?compose=contest/);
    await expect(page.getByRole('tab', { name: /Contest/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Add a caption for your contest entry').fill('My week 1 skill: the outside-of-the-boot curl');
    await page.getByRole('button', { name: 'Submit entry' }).click();

    await expect
      .poll(async () =>
        db().contestEntry.count({ where: { cycleId: nov.id, roundId: nov.roundId(1), userId: joiner.userId } }),
      )
      .toBe(1);
    await page.goto('/contest');
    await expect(page.getByText(/Your entry for week 1 is in/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join Contest' })).toHaveCount(0);
    const mine = await currentContest(joiner);
    expect(mine.callerEntry?.weekNumber).toBe(1);
    expect(mine.calendarState.kind).toBe('week_entries');

    // A member who already entered cannot enter twice, and the API says why.
    const second = await api('POST', '/posts', { token: await freshToken(joiner), body: { contentText: 'second try' } });
    expect(second.status).toBe(201);
    const dup = await api('POST', '/contest/entries', {
      token: await freshToken(joiner),
      body: { postId: second.body.id },
    });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.status).toBeLessThan(500);
  });

  // ---- week 1, Phase 2: the vote toggle -------------------------------------------------------------

  test('week 1 Phase 2: entries are ranked, and the vote button toggles Vote -> Voted -> Vote -> Voted', async ({ page }) => {
    await clockAt('week1_phase2', NOV);
    await waitForRoundStatus(nov, 1, 'voting');

    const voter = members[6];
    const target = members[0];
    await signIn(page, voter);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Voting is open' })).toBeVisible();
    await page.getByRole('link', { name: 'Vote now' }).click();
    await expect(page).toHaveURL(/\/contest\/voting$/);
    await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
    // Eight seeded entries plus the one made in the browser: all nine qualify (the top ten go through).
    await expect(page.locator('.voting-entry')).toHaveCount(9);

    const votesOf = () =>
      db().contestVote.count({ where: { roundId: nov.roundId(1), voterId: voter.userId } });
    expect(await votesOf()).toBe(0);

    const button = page.getByRole('button', { name: `Vote for ${target.username}` });
    await expect(button).toHaveText('Vote');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    const held = page.getByRole('button', { name: `Remove your vote for ${target.username}` });
    await expect(held).toHaveText('Voted');
    await expect(held).toHaveAttribute('aria-pressed', 'true');
    expect(await votesOf()).toBe(1);
    await snap(page, 'week1-phase2-voted');

    // Un-voting is the same control.
    await held.click();
    await expect(page.getByRole('button', { name: `Vote for ${target.username}` })).toHaveText('Vote');
    expect(await votesOf()).toBe(0);

    // One vote per round: voting again for the same entry, then a reload still shows it held.
    await page.getByRole('button', { name: `Vote for ${target.username}` }).click();
    await expect(page.getByRole('button', { name: `Remove your vote for ${target.username}` })).toHaveText('Voted');
    expect(await votesOf()).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: `Remove your vote for ${target.username}` })).toHaveText('Voted');
  });

  // ---- Between Weeks ---------------------------------------------------------------------------------

  test('Between Weeks after week 1: the lock decides the podium by votes and the page shows the result and the next opening', async ({ page }) => {
    await clockAt('between_weeks_after_week1', NOV);
    await waitForRoundStatus(nov, 1, 'judged');
    await waitForWinners(nov, 1, 3);

    const winners = await db().contestRoundWinner.findMany({
      where: { roundId: nov.roundId(1) },
      orderBy: { position: 'asc' },
      select: { position: true, userId: true },
    });
    // 4 votes (3 seeded + the browser vote), 2, 1.
    expect(winners.map((w: { userId: string }) => w.userId)).toEqual([members[0].userId, members[1].userId, members[2].userId]);

    await signIn(page, viewer());
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Between weeks' })).toBeVisible();
    const result = page.getByTestId('between-weeks-result');
    await expect(result).toContainText('1st');
    await expect(result).toContainText(members[0].username);
    await expect(result).toContainText(members[1].username);
    await expect(result).toContainText(members[2].username);
    await expect(result).toContainText('The next week opens at 08:00 on day 8');
    await snap(page, 'between-weeks-1');
  });

  // ---- weeks 2 and 3 ---------------------------------------------------------------------------------

  test('week 2 Phase 1: the entry window shows the task and the member’s seeded entry', async ({ page }) => {
    await clockAt('week2_phase1', NOV);
    await signIn(page, members[8]);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Task for this week' })).toBeVisible();
    await expect(page.getByText(/Week 2 is live/)).toBeVisible();
    await expect(page.getByText(/Your entry for week 2 is in/)).toBeVisible();
    // Week 1's podium stays on the page.
    await expect(page.getByRole('heading', { name: 'Weekly winners so far' })).toBeVisible();
    await expect(page.locator('.contest-winner')).toHaveCount(3);
  });

  test('week 2 Phase 2: voting opens on nine entries', async ({ page }) => {
    await clockAt('week2_phase2', NOV);
    await waitForRoundStatus(nov, 2, 'voting');
    await signIn(page, viewer());
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Voting is open' })).toBeVisible();
    await page.getByRole('link', { name: 'Vote now' }).click();
    await expect(page.locator('.voting-entry')).toHaveCount(9);
    await expect(page.getByRole('button', { name: 'Vote for ' + members[3].username })).toBeVisible();
  });

  test('week 3 Phase 1: the entry window shows the task and the member’s seeded entry', async ({ page }) => {
    await clockAt('week3_phase1', NOV);
    // Catching up: week 2 was locked by the lifecycle on the way (its tick decides it from the calendar).
    await waitForRoundStatus(nov, 2, 'judged');
    await waitForWinners(nov, 2, 3);
    await signIn(page, members[8]);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Task for this week' })).toBeVisible();
    await expect(page.getByText(/Week 3 is live/)).toBeVisible();
    await expect(page.getByText(/Your entry for week 3 is in/)).toBeVisible();
    await expect(page.locator('.contest-winner')).toHaveCount(6);
  });

  test('week 3 Phase 2: voting opens on nine entries', async ({ page }) => {
    await clockAt('week3_phase2', NOV);
    await waitForRoundStatus(nov, 3, 'voting');
    await signIn(page, viewer());
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Voting is open' })).toBeVisible();
    await page.getByRole('link', { name: 'Vote now' }).click();
    await expect(page.locator('.voting-entry')).toHaveCount(9);
    await expect(page.getByRole('button', { name: 'Vote for ' + members[6].username })).toBeVisible();
  });

  test('Between Weeks after week 3: nine winners, the finalists are known, and the final opens on day 22', async ({ page }) => {
    await clockAt('between_weeks_after_week3', NOV);
    await waitForRoundStatus(nov, 3, 'judged');
    await waitForWinners(nov, 3, 3);
    await waitForFinalistsSelected(nov);

    await signIn(page, viewer());
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Between weeks' })).toBeVisible();
    await expect(page.getByTestId('between-weeks-result')).toContainText('The final opens at 08:00 on day 22');
    await expect(page.locator('.contest-winner')).toHaveCount(9);
    const distinct = await db().contestRoundWinner.findMany({
      where: { round: { cycleId: nov.id } },
      distinct: ['userId'],
      select: { userId: true },
    });
    expect(distinct).toHaveLength(9);
    await snap(page, 'between-weeks-3');
  });

  // ---- week 4: the upload ------------------------------------------------------------------------------

  test('week 4: a finalist uploads the final entry in the browser; a non-finalist cannot', async ({ page, browser }) => {
    await clockAt('week4_upload', NOV);

    // A non-finalist sees the heading and no upload call to action.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, viewer());
    await otherPage.goto('/contest');
    await expect(otherPage.getByRole('heading', { name: 'Week 4 final: finalists are uploading' })).toBeVisible();
    await expect(otherPage.getByRole('link', { name: 'Upload your final entry' })).toHaveCount(0);
    await other.close();

    const finalist = members[0];
    await signIn(page, finalist);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'Week 4 final: finalists are uploading' })).toBeVisible();
    await snap(page, 'week4-upload');
    await page.getByRole('link', { name: 'Upload your final entry' }).click();
    await expect(page).toHaveURL(/\/community\?compose=contest/);
    await expect(page.getByText(/WEEK 4 FINAL/)).toBeVisible();
    await page.getByLabel('Add a caption for your final entry').fill('My final: a first-time volley from the halfway line');
    // FC10 (B-240): the pasted link is gone. The finalist chooses a real video; the browser sends it straight
    // to the (fake) object store, the API strips and checks it, and the entry carries the upload's id.
    await expect(page.getByLabel('Video link')).toHaveCount(0);
    const clip = makeMp4();
    if (!clip) throw new Error('ffmpeg-static is not installed in e2e/: run `npm install` there (it is a devDependency).');
    await page.locator('#final-entry-video').setInputFiles(clip);
    await expect(page.getByText('Checking', { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Submit entry' }).click();
    await expect
      .poll(async () => db().contestEntry.count({ where: { roundId: nov.roundId(4), userId: finalist.userId } }))
      .toBe(1);
    // A final entry whose video is not approved by the reveal is not shown, so wait for the (fake) automatic
    // check -- the real sweep, every minute -- to approve it before the clock moves on.
    await expect
      .poll(async () => (await db().postMedia.findFirst({ where: { uploaderId: finalist.userId }, select: { status: true } }))?.status, {
        timeout: 150_000,
        intervals: [2_000],
      })
      .toBe('approved');

    const reveal = scheduleFor(NOV).final.revealAt;
    const post = await db().post.findFirst({
      where: { contestEntry: { roundId: nov.roundId(4), userId: finalist.userId } },
      select: { visibleFrom: true },
    });
    expect(post.visibleFrom.toISOString()).toBe(reveal.toISOString());
    await page.goto('/contest');
    await expect(page.getByText(/Your final entry is in/)).toBeVisible();

    // The other eight finalists' final entries (hidden until the reveal) are seeded.
    for (let i = 1; i < 9; i++) await seedFinalEntry(nov, members[i], i);
  });

  // ---- the reveal: the live carousel, three pages -----------------------------------------------------

  test('the reveal: the Final week carousel shows nine finalists on three pages of three', async ({ page }) => {
    await clockAt('final_live', NOV);
    await waitForCycleStatus(nov, 'final');

    await signIn(page, viewer());
    const carouselRequest = page.waitForRequest((r) => r.url().includes('/contest/final-week/carousel'));
    // Registered before the page loads: the event fires one second after a tile is half in view.
    const impression = page
      .waitForResponse((r) => /\/contest\/entries\/[^/]+\/impression$/.test(r.url()) && r.request().method() === 'POST', {
        timeout: 30_000,
      })
      .catch(() => null);
    await page.goto('/community');
    // FC9: the module asks the server for the maximum, nine finalists, not the default of six.
    expect(new URL((await carouselRequest).url()).searchParams.get('limit')).toBe('9');

    const carousel = page.getByTestId('final-week-carousel');
    await expect(carousel).toBeVisible();
    await expect(carousel.getByRole('heading', { name: 'Final week' })).toBeVisible();
    const tiles = carousel.getByRole('link', { name: /^Open .* final entry$/ });
    const names = carousel.locator('.fwc__name');

    await carousel.scrollIntoViewIfNeeded();

    const seen: string[] = [];
    await expect(tiles).toHaveCount(3);
    await expect(carousel.getByText('Showing 1–3 of 9 finalists')).toBeVisible();
    await expect(carousel.getByRole('button', { name: /^Page \d of 3$/ })).toHaveCount(3);
    await expect(carousel.getByRole('button', { name: 'Page 1 of 3' })).toHaveAttribute('aria-current', 'true');
    await expect(carousel.getByRole('button', { name: 'Previous finalists' })).toBeDisabled();
    seen.push(...(await names.allTextContents()));
    await snap(page, 'carousel-page1');
    // An impression is sent once a tile has been half in view for one continuous second.
    const sent = await impression;
    expect(sent, 'no impression event was sent for a tile in view').not.toBeNull();
    expect(sent!.ok()).toBe(true);

    await carousel.getByRole('button', { name: 'Next finalists' }).click();
    await expect(carousel.getByText('Showing 4–6 of 9 finalists')).toBeVisible();
    await expect(tiles).toHaveCount(3);
    seen.push(...(await names.allTextContents()));

    await carousel.getByRole('button', { name: 'Page 3 of 3' }).click();
    await expect(carousel.getByText('Showing 7–9 of 9 finalists')).toBeVisible();
    await expect(tiles).toHaveCount(3);
    await expect(carousel.getByRole('button', { name: 'Next finalists' })).toBeDisabled();
    seen.push(...(await names.allTextContents()));
    await snap(page, 'carousel-page3');

    // All nine finalists appear exactly once across the three pages, in the server's order.
    expect(seen).toHaveLength(9);
    expect([...seen].sort()).toEqual(members.slice(0, 9).map((m) => m.username).sort());

    // No count of any kind (views, impressions, likes, comments, rank).
    // (The finalists' own names contain digits, so they are taken out first.)
    let text = ((await carousel.textContent()) ?? '').replace(/Showing \d–\d of \d finalists/, '');
    for (const name of seen) text = text.split(name).join('');
    expect(text).not.toMatch(/\d/);

    // A tile opens the entry itself.
    await carousel.getByRole('button', { name: 'Page 1 of 3' }).click();
    await tiles.first().click();
    await expect(page).toHaveURL(/\/posts\/[0-9a-f-]+$/);

    // The same module on a phone: three tiles, the pager footer, and nothing wider than the screen.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/community');
    const mobile = page.getByTestId('final-week-carousel');
    await expect(mobile.getByText('Showing 1–3 of 9 finalists')).toBeVisible();
    await expect(mobile.getByRole('button', { name: /^Page \d of 3$/ })).toHaveCount(3);
    const box = (await mobile.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
    await snap(page, 'carousel-mobile');

    // The Contest page names the phase.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'The final is live' })).toBeVisible();
  });

  // ---- the crown --------------------------------------------------------------------------------------

  test('the crowned state: likes decide the final, the top three are crowned, the pins come off', async ({ page }) => {
    // During the live final, members like the finalists' entries: 3 / 2 / 1 for members 0, 1, 2.
    const entryPost = async (i: number): Promise<string> => {
      const e = await db().contestEntry.findFirst({
        where: { roundId: nov.roundId(4), userId: members[i].userId },
        select: { postId: true },
      });
      return e.postId as string;
    };
    const likes: Array<[number, number[]]> = [
      [0, [3, 4, 5]],
      [1, [3, 6]],
      [2, [7]],
    ];
    for (const [finalist, likers] of likes) {
      const postId = await entryPost(finalist);
      for (const liker of likers) {
        const res = await api('POST', `/posts/${postId}/like`, { token: await freshToken(members[liker]) });
        expect([200, 201], `member ${liker} liking finalist ${finalist}: ${JSON.stringify(res.body)}`).toContain(res.status);
      }
    }

    await clockAt('crowned', NOV);
    await waitForCycleStatus(nov, 'completed');

    const standings = await db().contestStanding.findMany({
      where: { cycleId: nov.id },
      orderBy: { position: 'asc' },
      select: { position: true, userId: true },
    });
    expect(standings.map((s: { userId: string }) => s.userId)).toEqual([members[0].userId, members[1].userId, members[2].userId]);
    const entries = await db().contestEntry.findMany({
      where: { cycleId: nov.id, roundId: nov.roundId(4) },
      select: { pinRemovedAt: true, post: { select: { visibleFrom: true, communityFeedFrom: true } } },
    });
    expect(entries).toHaveLength(9);
    for (const e of entries) {
      expect(e.pinRemovedAt).not.toBeNull();
      expect(e.post.communityFeedFrom).toBeNull();
    }

    await signIn(page, viewer());
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: /This month.s contest is over/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monthly winners' })).toBeVisible();
    const monthly = page.locator('section', { has: page.getByRole('heading', { name: 'Monthly winners' }) }).locator('.contest-winner');
    await expect(monthly).toHaveCount(3);
    await expect(monthly.nth(0)).toContainText(members[0].username);
    await expect(monthly.nth(0)).toContainText('1st · Monthly winner');
    await expect(monthly.nth(1)).toContainText(members[1].username);
    await expect(monthly.nth(2)).toContainText(members[2].username);
    await snap(page, 'crowned');

    // The Final week carousel is gone: the final is over.
    await page.goto('/community');
    await expect(page.getByTestId('final-week-carousel')).toHaveCount(0);

    // The leaderboard Contest tab shows the crowned podium.
    await page.goto('/leaderboard?tab=contest');
    await expect(page.getByText(members[0].username).first()).toBeVisible();
  });
});

// =================================================================================================
// ONE PHASE, pinned at start (backend/test-clock-qa): QA_CONTEST_PHASE=<phase> npx playwright test 17
// =================================================================================================


test.describe.serial('Contest phase on the API test clock', () => {
  test.skip(!PHASE, 'Set QA_CONTEST_PHASE (see support/contest-clock.ts) to start the API on a Contest phase.');

  let seeded: SeededContest;

  test.beforeAll(async () => {
    if (!PHASE || !isContestPhase(PHASE)) throw new Error(`QA_CONTEST_PHASE "${PHASE}" is not a known phase`);
    seeded = await seedContestAtPhase(PHASE, { monthKey: MONTH });
  });

  test('the seeded month matches the instant the API was started on', async () => {
    expect(seeded.clockIso).toBe(contestPhaseInstant(PHASE as ContestPhase, MONTH).toISOString());
    expect(seeded.members.length).toBeGreaterThanOrEqual(3);
    // seedContestAtPhase already asked the real API: it must agree on the phase.
    expect(seeded.calendarState.kind).toBeTruthy();
  });

  test('the Contest page shows the phase in a real browser', async ({ page }) => {
    const member = seeded.members[0];
    await loginViaUi(page, member.email, member.password);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: headingFor(seeded.phase) })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(`QA Challenge ${seeded.monthKey}`) })).toBeVisible();
    await page.screenshot({ path: `.run/artifacts/contest-phase-${seeded.phase}.png`, fullPage: true });
  });
});
