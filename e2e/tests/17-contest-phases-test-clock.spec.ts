import { test, expect } from '@playwright/test';
import { loginViaUi } from '../support/helpers';
import { contestPhaseInstant, isContestPhase, seedContestAtPhase, type ContestPhase, type SeededContest } from '../support/contest-clock';

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
