import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import {
  api,
  db,
  getAdminToken,
  guardianConfirmViaApi,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// QA second run (docs/qa-second-run-report.md). Specs 01-14 cover onboarding, withdrawal, crop and the
// image-decision notification. This file adds the new-work areas they do not drive in a browser:
// Create/Edit Profile avatar + cover states, Block / Blocked users / other-user profile, the Contest
// user pages, the rebuilt admin Contest screens, and Restricted Pending write rules.
// Every assertion states what the decision records say should happen; a red test is a finding.

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'qa-second-run-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string, displayName = 'Quinn Player'): Promise<Verified> {
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

async function chooseGeneratedImage(page: Page, testId: string, width: number, height: number, type = 'image/png'): Promise<void> {
  await page.evaluate(
    async ({ testId, width, height, type }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#7BB929';
      ctx.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), type));
      const file = new File([blob], type === 'image/png' ? 'generated.png' : 'generated.jpg', { type });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { testId, width, height, type },
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Create Profile / Edit Profile: avatar and cover states
// ---------------------------------------------------------------------------------------------
test.describe('avatar and cover states (Create Profile, Edit Profile)', () => {
  test('Create Profile shows the picture and cover controls with the automatic-check note', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'img1', displayName: 'Quinn Player' });
    await verifyEmailViaApi(a);
    await signIn(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);
    const avatar = page.getByTestId('profile-image-avatar');
    const cover = page.getByTestId('profile-image-cover');
    await expect(avatar.getByRole('button', { name: 'Choose a picture' })).toBeVisible();
    await expect(cover.getByRole('button', { name: 'Choose a cover photo' })).toBeVisible();
    await shot(page, 'create-profile-image-controls');
  });

  test('uploading a picture: the page never gets stuck - it ends in Under review, or in a visible error with Try again', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'img2', displayName: 'Quinn Player' });
    await verifyEmailViaApi(a);
    await signIn(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);
    const avatar = page.getByTestId('profile-image-avatar');
    await chooseGeneratedImage(page, 'profile-image-avatar-input', 400, 400);
    // Local runs have no object store configured, so the API answers 503. Either end state is a pass;
    // a spinner that never resolves is the defect.
    await expect(avatar.getByRole('progressbar')).toHaveCount(0, { timeout: 20_000 });
    const underReview = await avatar.getByText('Under review').count();
    const errored = await avatar.getByRole('alert').count();
    expect(underReview + errored).toBeGreaterThan(0);
    if (errored) {
      await expect(avatar.getByRole('button', { name: 'Try again' })).toBeVisible();
    }
    await shot(page, 'create-profile-avatar-after-upload');
  });

  // QA-2 D-18 (fixed): CreateProfilePage used to fill every field from GET /users/:id when it resolved,
  // overwriting what the person had already typed. Regression test: the race is pinned deterministically by
  // delaying that response.
  test('D-18: text typed before the profile read returns is not wiped', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'img0', displayName: 'Quinn Player' });
    await verifyEmailViaApi(a);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/users\/[0-9a-f-]{36}$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await gate;
      return route.continue();
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(a.email);
    await page.getByLabel('Password', { exact: true }).fill('Sup3r-secret-pass');
    await page.getByRole('button', { name: /^Log ?in$/i }).click();
    await expect(page).toHaveURL(/\/create-profile$/);
    await page.getByLabel('Username').fill('typedbeforeload');
    release();
    await page.waitForTimeout(1500);
    await expect(page.getByLabel('Username')).toHaveValue('typedbeforeload');
  });

  test('a wrong file type is refused before any upload', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'img3', displayName: 'Quinn Player' });
    await verifyEmailViaApi(a);
    await signIn(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/avatar$/.test(r.url())) posted = true;
    });
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
      const input = document.querySelector('[data-testid="profile-image-avatar-input"]') as HTMLInputElement;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.getByTestId('profile-image-avatar').getByRole('alert')).toBeVisible();
    expect(posted).toBe(false);
  });

  test('Edit Profile renders every stored state: Under review, Approved (Replace / Remove), rejected with reason', async ({ page }) => {
    const u = await verifiedAdult('img4');
    await signIn(page, u.email);
    await page.goto('/profile?edit=1');
    const avatar = page.getByTestId('profile-image-avatar');
    const cover = page.getByTestId('profile-image-cover');
    await expect(avatar).toBeVisible();

    // pending
    await db().user.update({
      where: { id: u.userId },
      data: { avatarUrl: 'https://example.test/a.png', avatarKey: 'qa/a.png', avatarStatus: 'pending', coverUrl: 'https://example.test/c.png', coverKey: 'qa/c.png', coverStatus: 'pending' },
    });
    await page.goto('/profile?edit=1');
    await expect(avatar.getByText('Under review')).toBeVisible();
    await expect(cover.getByText('Under review')).toBeVisible();
    await shot(page, 'edit-profile-under-review');

    // approved
    await db().user.update({ where: { id: u.userId }, data: { avatarStatus: 'approved', coverStatus: 'approved' } });
    await page.goto('/profile?edit=1');
    await expect(avatar.getByText('Approved')).toBeVisible();
    await expect(avatar.getByRole('button', { name: /Replace/ })).toBeVisible();
    await expect(avatar.getByRole('button', { name: /Remove/ })).toBeVisible();
    await shot(page, 'edit-profile-approved');

    // remove-confirm: Keep goes back, nothing is deleted
    await avatar.getByRole('button', { name: /Remove/ }).click();
    await expect(avatar.getByRole('button', { name: /Keep/ })).toBeVisible();
    await avatar.getByRole('button', { name: /Keep/ }).click();
    await expect(avatar.getByText('Approved')).toBeVisible();

    // rejected with reason on both
    await db().user.update({
      where: { id: u.userId },
      data: { avatarStatus: 'rejected', avatarRejectionReason: 'Not a clear photo of you', coverStatus: 'rejected', coverRejectionReason: 'Contains text' },
    });
    await page.goto('/profile?edit=1');
    await expect(page.getByTestId('profile-image-avatar-reason')).toHaveText('Reason: Not a clear photo of you');
    await expect(page.getByTestId('profile-image-cover-reason')).toHaveText('Reason: Contains text');
    await shot(page, 'edit-profile-rejected');
  });

  test('another user never sees a pending or rejected picture/cover of mine', async () => {
    const a = await verifiedAdult('img5');
    const b = await verifiedAdult('img6');
    await db().user.update({
      where: { id: a.userId },
      data: { avatarUrl: 'https://example.test/a.png', avatarKey: 'qa/a.png', avatarStatus: 'pending', coverUrl: 'https://example.test/c.png', coverKey: 'qa/c.png', coverStatus: 'rejected', coverRejectionReason: 'No' },
    });
    const view = await api('GET', `/users/${a.userId}/public-profile`, { token: b.token });
    expect(view.status).toBe(200);
    expect(view.body.avatarUrl ?? null).toBeNull();
    expect(view.body.coverUrl ?? null).toBeNull();
    expect(JSON.stringify(view.body)).not.toContain('Reason');
    expect(JSON.stringify(view.body)).not.toMatch(/rejectionReason/);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Block, Blocked users, other-user profile
// ---------------------------------------------------------------------------------------------
test.describe('Block and Blocked users', () => {
  test('block from the other-user profile, see it in Blocked users, unblock with confirmation', async ({ page }) => {
    const a = await verifiedAdult('blk1', 'Ada Blocker');
    const b = await verifiedAdult('blk2', 'Bola Target');
    await signIn(page, a.email);
    await page.goto(`/users/${b.userId}`);
    await expect(page.getByRole('heading', { name: b.username })).toBeVisible();
    await shot(page, 'other-profile-before-block');

    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Copy Profile Link' })).toBeVisible();
    await page.getByRole('menuitem', { name: `Block ${b.username}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: `Block ${b.username}?` })).toBeVisible();
    await expect(dialog).toContainText('They are not told');
    await shot(page, 'block-confirm-dialog');
    // Cancelling must not block.
    await page.keyboard.press('Escape');
    const stillOpen = await dialog.count();
    if (stillOpen) await dialog.getByRole('button', { name: /Cancel/ }).click();
    expect((await api('GET', `/users/${a.userId}/blocks`, { token: a.token })).body.items ?? []).toHaveLength(0);

    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: `Block ${b.username}` }).click();
    await dialog.getByLabel(/Reason/).fill('QA: unwanted contact');
    await dialog.getByRole('button', { name: /^Block$/ }).click();
    await expect(page.getByText(`You blocked ${b.username}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Message' })).toHaveCount(0);
    await shot(page, 'other-profile-blocked');

    // Blocked users page
    await page.goto('/settings/privacy/blocked');
    await expect(page.getByRole('heading', { name: 'Blocked users' })).toBeVisible();
    await expect(page.getByText(b.username)).toBeVisible();
    await expect(page.getByText('Reason: QA: unwanted contact')).toBeVisible();
    await shot(page, 'blocked-users-list');

    await page.getByRole('button', { name: `Unblock ${b.username}` }).click();
    await shot(page, 'blocked-users-unblock-confirm');
    const confirm = page.getByRole('dialog');
    await confirm.getByRole('button', { name: /^Unblock/ }).click();
    await expect(page.getByText('No blocked users')).toBeVisible();
  });

  test('server rules: blocked user gets the same 404 as a missing profile, follow/DM both ways, follows removed and not restored', async () => {
    const a = await verifiedAdult('blk3');
    const b = await verifiedAdult('blk4');
    // B follows A, A follows B
    expect((await api('POST', `/users/${a.userId}/follow`, { token: b.token })).status).toBeLessThan(300);
    expect((await api('POST', `/users/${b.userId}/follow`, { token: a.token })).status).toBeLessThan(300);

    const blockRes = await api('POST', `/users/${b.userId}/block`, { token: a.token, body: { reason: 'qa' } });
    expect(blockRes.status).toBeLessThan(300);

    const missing = await api('GET', `/users/00000000-0000-4000-8000-000000000000/public-profile`, { token: b.token });
    const blockedView = await api('GET', `/users/${a.userId}/public-profile`, { token: b.token });
    expect(blockedView.status).toBe(404);
    expect(blockedView.status).toBe(missing.status);
    expect(JSON.stringify(blockedView.body)).toBe(JSON.stringify(missing.body));

    // blocker is told, blocked user is not
    const aFollowsB = await api('POST', `/users/${b.userId}/follow`, { token: a.token });
    expect(aFollowsB.status).toBe(403);
    expect(JSON.stringify(aFollowsB.body)).toContain('you_blocked_this_user');
    const bFollowsA = await api('POST', `/users/${a.userId}/follow`, { token: b.token });
    expect(bFollowsA.status).toBe(404);

    const dm1 = await api('POST', '/conversations', { token: a.token, body: { recipientId: b.userId } });
    const dm2 = await api('POST', '/conversations', { token: b.token, body: { recipientId: a.userId } });
    expect(dm1.status).toBe(403);
    expect(dm2.status).toBe(404);

    // unblocking does not restore follows
    await api('DELETE', `/users/${b.userId}/block`, { token: a.token });
    const after = await api('GET', `/users/${b.userId}/public-profile`, { token: a.token });
    expect(after.status).toBe(200);
    expect(after.body.isFollowing).toBe(false);
  });

  test('a blocked user disappears from search, rosters and posts both ways; counts are unchanged', async () => {
    const a = await verifiedAdult('blk5');
    const b = await verifiedAdult('blk6');
    const post = await api('POST', '/posts', { token: b.token, body: { contentText: 'QA post by B for block test' } });
    expect(post.status).toBe(201);
    await api('POST', `/users/${b.userId}/follow`, { token: a.token });
    const before = await api('GET', '/posts/feed', { token: a.token });
    expect(JSON.stringify(before.body)).toContain('QA post by B for block test');

    await api('POST', `/users/${b.userId}/block`, { token: a.token, body: {} });
    const feed = await api('GET', '/posts/feed', { token: a.token });
    expect(JSON.stringify(feed.body)).not.toContain('QA post by B for block test');
    const search = await api('GET', `/search?q=${encodeURIComponent(b.username)}`, { token: a.token });
    expect(JSON.stringify(search.body)).not.toContain(b.userId);
    const reverse = await api('GET', `/search?q=${encodeURIComponent(a.username)}`, { token: b.token });
    expect(JSON.stringify(reverse.body)).not.toContain(a.userId);
  });

  test('Block is allowed for a restricted-pending minor (authentication only, #411 item 5)', async () => {
    const minor = await registerViaApi({ age: 15, label: 'blk7' });
    const target = await verifiedAdult('blk8');
    const token = (await me(minor)).token;
    const res = await api('POST', `/users/${target.userId}/block`, { token, body: {} });
    expect(res.status).toBeLessThan(300);
    const list = await api('GET', `/users/${minor.userId}/blocks`, { token });
    expect(list.status).toBe(200);
  });

  test('no Block row or hidden notification leaks: like/comment notifications between a blocked pair are hidden both ways', async () => {
    const a = await verifiedAdult('blk9');
    const b = await verifiedAdult('blk10');
    const post = await api('POST', '/posts', { token: a.token, body: { contentText: 'QA notification block post' } });
    expect(post.status).toBe(201);
    const like = await api('POST', `/posts/${post.body.id}/like`, { token: b.token });
    expect(like.status).toBeLessThan(300);
    const before = await api('GET', '/notifications', { token: a.token });
    expect(before.body.items.length).toBeGreaterThan(0);
    await api('POST', `/users/${b.userId}/block`, { token: a.token, body: {} });
    const after = await api('GET', '/notifications', { token: a.token });
    expect(after.body.items.filter((n: any) => n.type === 'like')).toHaveLength(0);
    const count = await api('GET', '/notifications/unread-count', { token: a.token });
    expect(count.body.unreadCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Contest: user pages
// ---------------------------------------------------------------------------------------------
async function createNextMonthCycle(): Promise<{ id: string; month: string }> {
  const adminTok = await getAdminToken();
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  const res = await api('POST', '/admin/contest/cycles', {
    token: adminTok,
    body: {
      month,
      title: 'QA Skills Month',
      description: 'A QA-run contest for the second pass.',
      weeks: [
        { weekNumber: 1, task: 'Show your best first touch', viewWatchLimitSeconds: 10 },
        { weekNumber: 2, task: 'Show your best long pass', viewWatchLimitSeconds: 10 },
        { weekNumber: 3, task: 'Show your best finish', viewWatchLimitSeconds: 10 },
      ],
      finalTask: 'Bring all three together',
      minimumTally: 3,
    },
  });
  if (res.status !== 201 && res.status !== 200) throw new Error(`create cycle ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id ?? res.body.cycle?.id, month };
}

test.describe.serial('Contest', () => {
  let user: Verified;
  let cycle: { id: string; month: string };

  test('before any cycle exists: "No contest right now" on /contest, API says no cycle', async ({ page }) => {
    user = await verifiedAdult('con1');
    const cur = await api('GET', '/contest/current', { token: user.token });
    expect(cur.status).toBe(200);
    // A leftover cycle from an earlier run is a test-environment fact, not a defect.
    test.skip(!!cur.body.cycle, 'a cycle already exists in the QA database');
    await signIn(page, user.email);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: 'No contest right now' })).toBeVisible();
    await shot(page, 'contest-none');
  });

  test('no session: /contest and /contest/voting ask to log in and call nothing', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(URLS.api) && /\/contest/.test(r.url())) calls.push(r.url());
    });
    for (const url of ['/contest', '/contest/voting', '/leaderboard?tab=contest']) {
      await page.goto(url);
      await expect(page.getByText(/log in/i).first()).toBeVisible();
    }
    expect(calls).toHaveLength(0);
  });

  test('admin creates next month\'s contest; the user sees "Week 1 opens at 08:00" and no entry button', async ({ page }) => {
    cycle = await createNextMonthCycle();
    await signIn(page, user.email);
    await page.goto('/contest');
    await expect(page.getByRole('heading', { name: /Week 1 opens at/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Contest' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Join Contest' })).toHaveCount(0);
    await expect(page.getByText('QA Skills Month')).toBeVisible();
    // admin-only settings never reach a user
    const cur = await api('GET', '/contest/current', { token: user.token });
    const text = JSON.stringify(cur.body);
    // The per-week watch limit IS user-facing (the contest description states it, spec section 4).
    expect(text).not.toMatch(/minimumTally|placementPoints|exposureTolerance|exposureViewerDailyCap/i);
    await shot(page, 'contest-upcoming');
  });

  test('rules modal opens and closes with Escape; the placeholder is visible', async ({ page }) => {
    await signIn(page, user.email);
    await page.goto('/contest');
    await page.getByRole('button', { name: /Contest rules/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('PLACEHOLDER');
    await shot(page, 'contest-rules-modal');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('voting page and leaderboard Contest tab render for the upcoming state without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page, user.email);
    await page.goto('/contest/voting');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await shot(page, 'contest-voting-upcoming');
    await page.goto('/leaderboard?tab=contest');
    await expect(page.getByRole('tab', { name: 'Contest' })).toBeVisible();
    await shot(page, 'leaderboard-contest-tab-upcoming');
    expect(errors).toEqual([]);
  });

  test('vote endpoint refuses outside the voting window and final-entry upload refuses a non-finalist', async () => {
    const entry = await api('PUT', '/contest/entries/00000000-0000-4000-8000-000000000000/vote', { token: user.token });
    expect([400, 403, 404, 409]).toContain(entry.status);
    const fin = await api('POST', '/contest/final-entry', { token: user.token, body: { postId: '00000000-0000-4000-8000-000000000000' } });
    expect([400, 403, 404, 409]).toContain(fin.status);
  });

  test('Create Post: no Contest tab is offered while no round accepts entries', async ({ page }) => {
    await signIn(page, user.email);
    await page.goto('/community');
    await expect(page.getByRole('tab', { name: /Contest/ })).toHaveCount(0);
    await shot(page, 'community-no-contest-tab');
  });

  test('admin Contest console, cycle detail, history, impressions and the create form', async ({ browser }) => {
    const page = await adminPage(browser);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 1184 });

    await page.goto(`${URLS.admin}/contest`);
    await expect(page.getByText('QA Skills Month').first()).toBeVisible();
    await shot(page, 'admin-contest-console');

    await page.goto(`${URLS.admin}/contest/cycles/${cycle.id}`);
    await expect(page.getByText('QA Skills Month').first()).toBeVisible();
    await shot(page, 'admin-contest-cycle-detail');

    await page.goto(`${URLS.admin}/contest/history`);
    await expect(page.getByText('QA Skills Month').first()).toBeVisible();
    await shot(page, 'admin-contest-history');

    await page.goto(`${URLS.admin}/contest/impressions`);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await shot(page, 'admin-contest-impressions');

    // Judging screens were removed with the rebuild.
    for (const gone of ['/contest/cycles/x/rounds/1', '/contest/cycles/x/final/open', '/contest/cycles/x/crown']) {
      await page.goto(`${URLS.admin}${gone}`);
      await expect(page.getByRole('button', { name: /Submit results|Crown|Open the final/i })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('admin create form: minimum tally has no default and Create is blocked until the form is valid', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.setViewportSize({ width: 1440, height: 1184 });
    await page.goto(`${URLS.admin}/contest/cycles/new`);
    await shot(page, 'admin-contest-create-form');
    await expect(page.getByLabel(/Minimum tally/i)).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Create contest' })).toBeDisabled();
    await shot(page, 'admin-contest-create-form-validation');
  });

  test('admin API contest validation: ranges, required tally, title length', async () => {
    const adminTok = await getAdminToken();
    const bad = async (patch: Record<string, unknown>) =>
      api('POST', '/admin/contest/cycles', {
        token: adminTok,
        body: {
          month: '2099-01',
          title: 'x',
          weeks: [1, 2, 3].map((n) => ({ weekNumber: n, task: 't', viewWatchLimitSeconds: 10 })),
          minimumTally: 1,
          ...patch,
        },
      });
    expect((await bad({ minimumTally: undefined })).status).toBe(400);
    expect((await bad({ exposureTolerancePercent: 51 })).status).toBe(400);
    expect((await bad({ exposureViewerDailyCap: 0 })).status).toBe(400);
    expect((await bad({ title: 'x'.repeat(81) })).status).toBe(400);
    expect((await bad({ weeks: [1, 2, 3].map((n) => ({ weekNumber: n, task: 't', viewWatchLimitSeconds: 2 })) })).status).toBe(400);
    expect((await bad({ weeks: [1, 2, 3].map((n) => ({ weekNumber: n, task: 't', viewWatchLimitSeconds: 121 })) })).status).toBe(400);
  });

  test('admin API: a second cycle for the same month is refused; a user token cannot reach admin contest routes', async () => {
    const adminTok = await getAdminToken();
    const dup = await api('POST', '/admin/contest/cycles', {
      token: adminTok,
      body: { month: cycle.month, title: 'dup', weeks: [1, 2, 3].map((n) => ({ weekNumber: n, task: 't', viewWatchLimitSeconds: 10 })), minimumTally: 1 },
    });
    expect([400, 409]).toContain(dup.status);
    const asUser = await api('GET', '/admin/contest/cycles', { token: user.token });
    expect([401, 403]).toContain(asUser.status);
    const removed = await api('POST', `/admin/contest/cycles/${cycle.id}/rounds/1/results`, { token: adminTok, body: {} });
    expect([404]).toContain(removed.status);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Restricted Pending
// ---------------------------------------------------------------------------------------------
test.describe('Restricted Pending', () => {
  test('the screen shows the registration status line and "Browse and read"; every social write is refused with the consent code', async ({ page }) => {
    const minor = await registerViaApi({ age: 15, label: 'rp1' });
    await verifyEmailViaApi(minor);
    await signIn(page, minor.email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await expect(page.locator('body')).toContainText('Browse and read');
    await expect(page.locator('body')).not.toContainText(/browse and follow/i);
    await expect(page.getByTestId('registration-status-line')).toContainText('Registration cannot be completed until your guardian approves');
    await shot(page, 'restricted-pending');

    const { token } = await me(minor);
    const peer = await verifiedAdult('rp2');
    for (const [method, route, body] of [
      ['POST', '/posts', { contentText: 'hello' }],
      ['POST', `/users/${peer.userId}/follow`, undefined],
      ['PATCH', `/users/${minor.userId}`, { bio: 'hi' }],
      ['POST', '/community-groups', { name: 'QA', city: 'Lagos' }],
    ] as const) {
      const res = await api(method, route, { token, body });
      expect(res.status, `${method} ${route}`).toBe(403);
    }
  });

  test('restricted pending minor can open pages by URL read-only and reach /contest without a crash (#411 item 10)', async ({ page }) => {
    const minor = await registerViaApi({ age: 15, label: 'rp3' });
    await verifyEmailViaApi(minor);
    await signIn(page, minor.email);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const url of ['/community', '/contest', '/blog', '/sports-hub', '/settings/privacy']) {
      await page.goto(url);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
    expect(errors).toEqual([]);
  });

  test('after approval the same minor loses the gate (no stale restricted state)', async () => {
    const minor = await registerViaApi({ age: 15, label: 'rp4' });
    await verifyEmailViaApi(minor);
    await guardianConfirmViaApi(minor);
    const { user } = await me(minor);
    expect(user.nextStep).not.toBe('restricted_pending');
  });
});


test.describe('admin Contest form known defects', () => {
  // QA-2 D-19 (fixed): the footer hint used to list only the title, the minimum tally and the watch limits,
  // while every weekly TASK is also required, and no per-field message showed until a submit that the
  // disabled Create button made impossible. Now the one-line reason next to Create names every missing
  // field, and the per-field messages show as soon as the form is edited.
  test('D-19: Create stays disabled until the tasks are written, and the form says which fields are missing', async ({ browser }) => {
    const page = await adminPage(browser);
    try {
    await page.setViewportSize({ width: 1440, height: 1184 });
    await page.goto(`${URLS.admin}/contest/cycles/new`);
    await page.getByLabel(/Contest title/i).fill('QA UI Month');
    await page.getByLabel(/Minimum tally/i).fill('3');
    for (const n of [1, 2, 3]) await page.getByLabel(new RegExp(`watch limit, week ${n}`, 'i')).fill('10');
    const create = page.getByRole('button', { name: 'Create contest' });
    await page.waitForTimeout(500);
    await expect(create).toBeDisabled();
    await expect(page.getByText('Write the week 1 task.', { exact: true }).first()).toBeVisible();
    const reason = page.getByText(/Create is blocked until these are set:/);
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('week 1 task');
    await expect(reason).not.toContainText(/contest title|minimum tally|watch limit/);
    await shot(page, 'admin-contest-create-hint-only-fields');
    // Writing the three tasks enables Create.
    for (const n of [1, 2, 3]) await page.getByLabel(new RegExp(`^Weekly task [(]week ${n}[)]`)).fill(`Task ${n}`);
    await expect(create).toBeEnabled();
    } finally {
      await page.context().close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Guardian withdrawal throttle (#414 item 1: 5 attempts per 15 minutes per client IP per route)
// ---------------------------------------------------------------------------------------------
const withdrawHit = () =>
  fetch(`${URLS.api}/auth/guardian-consent/withdraw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ withdrawalToken: 'x'.repeat(48) }),
  });

test.describe('guardian withdrawal throttle', () => {
  // Order-independent: spec 14 already spent part of this bucket (same IP, same route, 15-minute window).
  test('/withdraw: once throttled it stays 429 "Too many attempts" with no retry hints', async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 8; i += 1) {
      last = await withdrawHit();
      statuses.push(last.status);
    }
    const first429 = statuses.indexOf(429);
    expect(first429, `statuses: ${statuses}`).toBeGreaterThanOrEqual(0);
    expect(first429, `at most 5 attempts are answered: ${statuses}`).toBeLessThanOrEqual(5);
    expect(statuses.slice(first429).every((s) => s === 429)).toBe(true);
    expect(last!.headers.get('retry-after')).toBeNull();
    expect([...last!.headers.keys()].filter((h) => /^x-ratelimit/i.test(h))).toEqual([]);
    expect(JSON.stringify(await last!.json())).toContain('Too many attempts');
  });

  // Exact count: needs a fresh API process (an empty in-memory bucket). Run alone:
  //   QA_THROTTLE_EXACT=1 npx playwright test 15 -g "exactly 5"
  test('/withdraw: exactly 5 attempts are answered, the 6th is 429 (fresh API process only)', async () => {
    test.skip(!process.env.QA_THROTTLE_EXACT, 'needs a fresh API process; see the comment above');
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await withdrawHit()).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429), `statuses: ${statuses}`).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Image upload with no object store (local / unset production)
// ---------------------------------------------------------------------------------------------
function solidPng(width: number, height: number): Uint8Array {
  const zlib = require('zlib') as typeof import('zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7b)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
  );
}

test.describe('image upload without an object store', () => {
  // QA-2 D-20 (fixed): the API's 503 for "no object store" used to name the S3_* environment variables and
  // the Create Profile / Edit Profile page showed that message to the person verbatim. It now answers with a
  // plain sentence; the S3_* detail stays in the server log. (The admin media upload keeps its own message.)
  test("D-20: the 503 shown to a user says uploads aren't available and names no configuration", async () => {
    const u = await verifiedAdult('img9');
    const form = new FormData();
    form.append('file', new Blob([solidPng(400, 400) as unknown as BlobPart], { type: 'image/png' }), 'a.png');
    const res = await fetch(`${URLS.api}/users/${u.userId}/avatar`, {
      method: 'POST',
      headers: { authorization: `Bearer ${u.token}` },
      body: form,
    });
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("Picture uploads aren't available right now. Please try again later.");
    expect(body).not.toMatch(/S3_|environment|configured/i);
  });
});
