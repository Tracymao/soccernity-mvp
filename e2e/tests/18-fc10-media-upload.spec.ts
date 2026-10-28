import { test, expect, type Page } from '@playwright/test';
import {
  api,
  db,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { WIDTH_CLEAR, WIDTH_REJECT, WIDTH_UNSURE } from '../support/fake-media-services';
import { makeMp4, pngOfWidth } from '../support/media-fixtures';

// FC10 (build register B-240; Decision Log #419): post media upload, the whole path in real Chrome against the
// REAL API process, Postgres and Redis. Only the two external vendors are stand-ins (support/fake-media-
// services.ts): an S3-compatible object store the browser PUTs to, and a Rekognition answer that depends on
// the picture's width. The API's own pipeline (magic bytes, metadata stripping, the automatic check, the
// decision rule, the visibility rule, the moderator queue) is the real code.
//
//   64 px  -> the check clears it            -> goes live
//   66 px  -> the check rejects it           -> rejected, the author sees the reason
//   68 px  -> the check is unsure            -> invisible to everyone else until a moderator approves it
//
// The media sweep runs once a minute, so the wait for a decision is up to ~70 s.

type Member = Account & { token: string; username: string };

async function member(label: string): Promise<Member> {
  const a = await registerViaApi({ age: 30, label, displayName: `Media ${label}` });
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

function png(name: string, width: number) {
  return { name, mimeType: 'image/png', buffer: pngOfWidth(width) };
}

async function postId(authorId: string, text: string): Promise<string> {
  const post = await db().post.findFirst({ where: { authorId, contentText: text }, select: { id: true } });
  expect(post, `post "${text}" exists`).not.toBeNull();
  return post.id as string;
}

async function mediaOf(uploaderId: string, id: string): Promise<{ status: string; reviewEnteredAt: Date | null; rejectionReason: string | null }> {
  return db().postMedia.findFirst({ where: { uploaderId, postId: id }, select: { status: true, reviewEnteredAt: true, rejectionReason: true } });
}

test.describe.serial('FC10: media upload, the whole path with the fake check', () => {
  test.beforeEach(() => {
    test.setTimeout(420_000);
  });

  let uploader: Member;
  let viewer: Member;
  const posts: Record<'clear' | 'reject' | 'unsure' | 'video', string> = { clear: '', reject: '', unsure: '', video: '' };
  const TEXT = {
    clear: 'Media QA: a picture the check clears',
    reject: 'Media QA: a picture the check rejects',
    unsure: 'Media QA: a picture the check is unsure about',
    video: 'Media QA: a short video',
  };

  test.beforeAll(async () => {
    uploader = await member('mediaup');
    viewer = await member('mediaview');
  });

  async function composeWith(page: Page, files: string | { name: string; mimeType: string; buffer: Buffer }, text: string, testId: 'picture-input' | 'video-input') {
    await page.getByLabel("What's happening?").fill(text);
    await page.getByTestId(testId).setInputFiles(files);
    // The browser sends the file straight to the object store; the API verifies and strips it; then it is "Checking".
    await expect(page.getByText('Checking', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Checking… only you can see this until it has been checked. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Checking', { exact: true })).toHaveCount(0); // the tray is cleared once the post is out
  }

  test('1. the author attaches files in the browser and publishes while they are still being checked', async ({ page }) => {
    await signIn(page, uploader.email);
    await page.goto('/community');
    await expect(page.getByText('Everything you upload is checked before other people can see it. [COPY PENDING LEGAL REVIEW]')).toBeVisible();

    await composeWith(page, png('clear.png', WIDTH_CLEAR), TEXT.clear, 'picture-input');
    posts.clear = await postId(uploader.userId, TEXT.clear);
    await composeWith(page, png('reject.png', WIDTH_REJECT), TEXT.reject, 'picture-input');
    posts.reject = await postId(uploader.userId, TEXT.reject);
    await composeWith(page, png('unsure.png', WIDTH_UNSURE), TEXT.unsure, 'picture-input');
    posts.unsure = await postId(uploader.userId, TEXT.unsure);

    const clip = makeMp4();
    if (clip) {
      await composeWith(page, clip, TEXT.video, 'video-input');
      posts.video = await postId(uploader.userId, TEXT.video);
    }

    // Nothing is approved the moment it is uploaded: the files are pending and the posts are author-only.
    for (const id of [posts.clear, posts.reject, posts.unsure]) {
      const res = await api('GET', `/posts/${id}`, { token: viewer.token });
      expect(res.status, 'another viewer cannot see a post whose media is still being checked').toBe(404);
      const own = await api('GET', `/posts/${id}`, { token: uploader.token });
      expect(own.status).toBe(200);
    }
  });

  test('2. the automatic check decides: clear goes live, reject is rejected, unsure waits for a person', async () => {
    const wanted = (id: string) => mediaOf(uploader.userId, id);
    await expect
      .poll(async () => (await wanted(posts.clear)).status, { timeout: 150_000, intervals: [2_000] })
      .toBe('approved');
    await expect
      .poll(async () => (await wanted(posts.reject)).status, { timeout: 60_000, intervals: [2_000] })
      .toBe('rejected');
    const rejected = await wanted(posts.reject);
    expect(rejected.rejectionReason).toBe("This file didn't meet our rules");
    const unsure = await wanted(posts.unsure);
    expect(unsure.status).toBe('pending');
    await expect
      .poll(async () => (await wanted(posts.unsure)).reviewEnteredAt !== null, { timeout: 60_000, intervals: [2_000] })
      .toBe(true); // it is in the moderator queue, not approved by default
    if (posts.video) {
      await expect
        .poll(async () => (await wanted(posts.video)).status, { timeout: 60_000, intervals: [2_000] })
        .toBe('approved');
    }

    // The visibility rule, from another viewer's side.
    expect((await api('GET', `/posts/${posts.clear}`, { token: viewer.token })).status).toBe(200);
    expect((await api('GET', `/posts/${posts.reject}`, { token: viewer.token })).status).toBe(404);
    expect((await api('GET', `/posts/${posts.unsure}`, { token: viewer.token })).status).toBe(404);
    if (posts.video) expect((await api('GET', `/posts/${posts.video}`, { token: viewer.token })).status).toBe(200);
  });

  test('3. the author sees each file\'s state on their own posts, and Remove-and-resubmit makes the rejected post visible', async ({ page }) => {
    await signIn(page, uploader.email);
    await page.goto('/community');

    const unsureCard = page.locator('article.post', { hasText: TEXT.unsure });
    await expect(unsureCard.getByText('Under review')).toBeVisible();
    await expect(unsureCard.getByText('Only you can see this post until its pictures have been checked. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    // B-260: the file under review is drawn through the signed link from the post's `media`, never through its
    // public address (the private object only exists in the private prefix until it is approved).
    const pendingSrc = await unsureCard.getByAltText('Picture attached to this post').getAttribute('src');
    expect(pendingSrc, 'a pending file is drawn through its signed link').toContain('private-media');
    expect(pendingSrc).not.toContain('/post-media/');
    const ownRead = await api('GET', `/posts/${posts.unsure}`, { token: uploader.token });
    const ownMedia = (ownRead.body as { media: Array<{ id: string; kind: string; viewUrl?: string }> }).media;
    expect(ownMedia).toHaveLength(1);
    expect(ownMedia[0].kind).toBe('image');
    expect(ownMedia[0].viewUrl).toBeTruthy();

    const rejectCard = page.locator('article.post', { hasText: TEXT.reject });
    await expect(rejectCard.getByText('This picture wasn’t approved')).toBeVisible();
    await expect(rejectCard.getByText("This file didn't meet our rules")).toBeVisible();
    await expect(
      rejectCard.getByText('Your post stays hidden from other people until every picture has been approved. Remove this picture or choose another. [COPY PENDING LEGAL REVIEW]'),
    ).toBeVisible();

    await rejectCard.getByRole('button', { name: 'Remove picture' }).click();
    await expect(rejectCard.getByAltText('Picture attached to this post')).toHaveCount(0);
    // With the rejected picture gone the post is text only, so everyone can see it.
    await expect
      .poll(async () => (await api('GET', `/posts/${posts.reject}`, { token: viewer.token })).status, { timeout: 15_000 })
      .toBe(200);
  });

  test('4. another viewer sees the approved picture and can report it', async ({ page }) => {
    await signIn(page, viewer.email);
    await page.goto(`/posts/${posts.clear}`);
    await expect(page.getByAltText('Picture attached to this post')).toBeVisible();
    await page.getByRole('button', { name: 'Report this picture' }).click();
    // B-260: the optional reason (up to 500 characters, with a counter) is sent and stored for moderators.
    await expect(page.getByText('0 / 500')).toBeVisible();
    await page.getByLabel(/Why are you reporting it/).fill('Not about football');
    await expect(page.getByText('18 / 500')).toBeVisible();
    await page.getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByText('Reported — thanks, our team will review it.')).toBeVisible();
    expect(await db().postMediaReport.count({ where: { reporterId: viewer.userId } })).toBe(1);
    const stored = await db().postMediaReport.findFirst({ where: { reporterId: viewer.userId }, select: { reason: true } });
    expect(stored.reason).toBe('Not about football');

    if (posts.video) {
      await page.goto(`/posts/${posts.video}`);
      await expect(page.getByLabel('Video attached to this post')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Report this video' })).toBeVisible();
    }
    // There is no Report control on your own post.
    await signIn(page, uploader.email);
    await page.goto(`/posts/${posts.clear}`);
    await expect(page.getByRole('button', { name: /Report this/ })).toHaveCount(0);
  });

  test('4b. a reporter who has hit the daily report limit sees the limit state, not a generic error', async ({ page }) => {
    const reporter = await member('mediacap');
    // 20 reports in the last 24 hours (POST_MEDIA_REPORT_DAILY_LIMIT default). Stub files owned by the reporter
    // themselves: they sit in no post and no queue, so no other test sees them.
    for (let i = 0; i < 20; i += 1) {
      const stub = await db().postMedia.create({
        data: { uploaderId: reporter.userId, kind: 'image', declaredContentType: 'image/png', declaredSize: 1 },
        select: { id: true },
      });
      await db().postMediaReport.create({ data: { mediaId: stub.id, reporterId: reporter.userId } });
    }
    await signIn(page, reporter.email);
    await page.goto(`/posts/${posts.clear}`);
    await page.getByRole('button', { name: 'Report this picture' }).click();
    await page.getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByText('You’ve reached today’s report limit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit report' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    // Nothing was added by the refused attempt.
    expect(await db().postMediaReport.count({ where: { reporterId: reporter.userId } })).toBe(20);
  });

  test('5. the moderator queue: statistics, the unsure and the reported item; approve one, reject one with a reason', async ({ browser }) => {
    const admin = await adminPage(browser);
    await admin.goto('/moderation/media');
    await expect(admin.getByRole('heading', { name: 'Media review' })).toBeVisible();

    // The statistics card counts what the automatic check did on its own, and the queue holds only the rest.
    const stat = async (id: string) => Number((await admin.getByTestId(id).textContent())?.trim());
    await expect.poll(() => stat('stat-auto-approved')).toBeGreaterThanOrEqual(1);
    // (auto-rejected is not asserted: step 3 removed the rejected picture, which deletes its row and its count.)
    expect(await stat('stat-auto-rejected')).toBeGreaterThanOrEqual(0);
    expect(await stat('stat-sent-to-review')).toBeGreaterThanOrEqual(1);
    expect(await stat('stat-reported')).toBeGreaterThanOrEqual(1);

    const table = admin.getByRole('table', { name: 'Media review queue' });
    const rows = table.locator('.media-table__row').filter({ hasText: uploader.username });
    // exactly two of this uploader's files are waiting: the unsure one (automatic check) and the reported one.
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Automatic check' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'User report' })).toHaveCount(1);

    // Approve the unsure one.
    await rows.filter({ hasText: 'Automatic check' }).getByRole('link', { name: 'Review' }).click();
    await expect(admin.getByAltText('The picture under review')).toBeVisible();
    await expect(admin.getByText('Suggestive')).toBeVisible();
    await admin.getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText('Already decided.')).toBeVisible();
    await expect.poll(async () => (await mediaOf(uploader.userId, posts.unsure)).status).toBe('approved');

    // Reject the reported one: a reason is required.
    await admin.goto('/moderation/media');
    const reported = admin.getByRole('table', { name: 'Media review queue' }).locator('.media-table__row').filter({ hasText: 'User report' });
    await expect(reported).toHaveCount(1);
    await reported.getByRole('link', { name: 'Review' }).click();
    await expect(admin.getByText(/Reported by 1 person\./)).toBeVisible();
    await admin.getByRole('button', { name: 'Reject' }).click();
    await expect(admin.getByRole('button', { name: 'Reject picture' })).toBeDisabled();
    await admin.getByLabel('Reason (required)').fill('Not related to football.');
    await admin.getByRole('button', { name: 'Reject picture' }).click();
    await expect(admin.getByText('Already decided.')).toBeVisible();
    await expect.poll(async () => (await mediaOf(uploader.userId, posts.clear)).status).toBe('rejected');
    await admin.context().close();

    // The viewer: the approved post is now visible, the rejected one no longer is.
    expect((await api('GET', `/posts/${posts.unsure}`, { token: viewer.token })).status).toBe(200);
    expect((await api('GET', `/posts/${posts.clear}`, { token: viewer.token })).status).toBe(404);
  });

  test('6. the uploader is told by notification, and the moderator\'s reason is on the post', async ({ page }) => {
    await signIn(page, uploader.email);
    await page.goto('/notifications');
    await expect(page.getByText(/Your picture was approved/).first()).toBeVisible();
    await expect(page.getByText(/Your picture wasn’t approved — see why on your post/).first()).toBeVisible();

    await page.goto('/community');
    const card = page.locator('article.post', { hasText: TEXT.clear });
    await expect(card.getByText('This picture wasn’t approved')).toBeVisible();
    await expect(card.getByText('Not related to football.')).toBeVisible();
  });
});
