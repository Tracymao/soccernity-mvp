import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, verifiedAccount, type Verified } from '../support/helpers';
import { restartApi } from '../support/api-process';
import { WIDTH_CLEAR } from '../support/fake-media-services';
import { pngOfWidth } from '../support/media-fixtures';

// B-042 (founder decision 2026-11-14): the Bants room composer takes pictures and video exactly like Create Post --
// same limits, same states, same behaviour (the shared MediaAttach.tsx / useMediaUploads.ts). Plus the second fix of
// the same PR: with MEDIA_UPLOADS_ENABLED off (B-306, Decision Log #501) the API answers 403 media_uploads_disabled and
// BOTH composers must show Figma pass Q state 11 ("Uploads aren't available right now", attach controls disabled,
// text posts still work) instead of the generic "Upload failed" card.
//
// Real Chrome, real API, Postgres and Redis. The two external vendors are the harness stand-ins (the object store the
// browser PUTs to and the automatic image check): a 64 px picture is the check's "clear" answer. The media sweep runs
// once a minute, so a decision takes up to ~70 s.
//
// The switch-off test restarts the API (support/api-process.ts restartApi, the way specs 59 and 19 do) and leaves it on
// its default (switch on) in afterAll.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b042-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const OFF_TEXT = 'Uploads aren’t available right now.';

async function signIn(page: Page, who: Verified): Promise<void> {
  await loginViaUi(page, who.email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

async function createRoom(by: Verified, name: string): Promise<string> {
  const res = await api('POST', '/banter-rooms', { token: by.token, body: { name, scopeType: 'topic' } });
  expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
  return res.body.id as string;
}

function png(name: string, width: number) {
  return { name, mimeType: 'image/png', buffer: pngOfWidth(width) };
}

async function roomFeed(roomId: string, token: string): Promise<any[]> {
  const res = await api('GET', `/banter-rooms/${roomId}/posts`, { token });
  expect(res.status).toBe(200);
  return res.body.items as any[];
}

test.describe.serial('B-042: Bants room composer takes pictures and video', () => {
  let author: Verified;
  let reader: Verified;
  let roomId = '';

  test.beforeAll(async () => {
    author = await verifiedAccount('b042a');
    reader = await verifiedAccount('b042r');
    roomId = await createRoom(author, `Bants media ${RUN}`);
  });

  test.afterAll(async () => {
    // Leave the harness API on the default (switch on) whatever happened below.
    await restartApi({});
  });

  test('a member attaches a picture, posts it, and sees it in the room feed; another member sees it only once the check approves it', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await signIn(page, author);
    await page.goto(`/banter/${roomId}`);

    // The old disabled "attach photo/video" button is gone; the shared Picture and Video controls are enabled.
    await expect(page.getByRole('button', { name: /attach photo\/video/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Picture/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Video/ })).toBeEnabled();
    await expect(page.getByText('Everything you upload is checked before other people can see it. [COPY PENDING LEGAL REVIEW]')).toBeVisible();

    const text = `Bants picture ${RUN}`;
    await page.getByPlaceholder(/say something to/i).fill(text);
    await page.getByTestId('picture-input').setInputFiles(png('goal.png', WIDTH_CLEAR));
    // Straight to the object store, then the API verifies it: the tray shows "Checking".
    await expect(page.getByText('Checking', { exact: true })).toBeVisible({ timeout: 60_000 });
    await shot(page, '01-attached-checking-desktop');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Checking', { exact: true })).toHaveCount(0); // the tray is cleared once the post is out

    // The author sees their own post, with its picture under review.
    const mine = page.locator('article.post', { hasText: text });
    await expect(mine).toBeVisible();
    await expect(mine.getByText('Under review')).toBeVisible();
    await shot(page, '02-own-post-under-review-desktop');

    // Server state: the post carries the media id the composer sent.
    const row = await db().post.findFirst({ where: { authorId: author.userId, contentText: text }, select: { id: true, banterRoomId: true } });
    expect(row?.banterRoomId).toBe(roomId);
    const media = await db().postMedia.findMany({ where: { postId: row.id }, select: { id: true, status: true, uploaderId: true } });
    expect(media).toHaveLength(1);
    expect(media[0].uploaderId).toBe(author.userId);

    // Not before the check: another member does not see the post while its picture is pending. (The automatic
    // check can answer at any moment, so the assertion only applies while the row still says pending.)
    const hiddenFeed = await roomFeed(roomId, reader.token);
    if ((await db().postMedia.findUnique({ where: { id: media[0].id } }))?.status === 'pending') {
      expect(hiddenFeed.find((p) => p.contentText === text)).toBeUndefined();
    }

    // Once the automatic check approves the picture, the other member sees the post with its picture.
    await expect
      .poll(async () => (await db().postMedia.findUnique({ where: { id: media[0].id } }))?.status, { timeout: 150_000, intervals: [3_000] })
      .toBe('approved');
    const seen = (await roomFeed(roomId, reader.token)).find((p) => p.contentText === text);
    expect(seen, 'another member sees the post once its picture is approved').toBeTruthy();
    expect(seen.media).toHaveLength(1);
    expect(seen.media[0].id).toBe(media[0].id);

    const readerPage = await page.context().browser()!.newPage({ viewport: { width: 1280, height: 1000 } });
    try {
      await signIn(readerPage, reader);
      await readerPage.goto(`/banter/${roomId}`);
      const theirs = readerPage.locator('article.post', { hasText: text });
      await expect(theirs.getByAltText('Picture attached to this post')).toBeVisible();
      await shot(readerPage, '03-other-member-sees-approved-desktop');
    } finally {
      await readerPage.close();
    }
  });

  test('a text-only post still goes out and needs no upload; a picture that is removed before posting is not sent', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await signIn(page, author);
    await page.goto(`/banter/${roomId}`);
    const composer = page.getByPlaceholder(/say something to/i);
    const text = `Bants text only ${RUN}`;
    await composer.fill(text);
    await page.getByTestId('picture-input').setInputFiles(png('later-removed.png', WIDTH_CLEAR));
    await expect(page.getByText('Checking', { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.locator('.media-item').first().getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.media-item')).toHaveCount(0);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();
    // The row is read by polling: the page shows the post from the API answer, and the test's own database
    // connection can be a moment behind it.
    await expect
      .poll(async () => (await db().post.findFirst({ where: { authorId: author.userId, contentText: text }, select: { id: true } }))?.id ?? null, { timeout: 15_000 })
      .not.toBeNull();
    const row = await db().post.findFirst({ where: { authorId: author.userId, contentText: text }, select: { id: true } });
    expect(await db().postMedia.count({ where: { postId: row.id } })).toBe(0);
    await shot(page, '04-text-only-mobile');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('uploads switched off: BOTH the Bants and the Create Post composer show "Uploads aren’t available right now", the controls are disabled and text posts still go out', async ({ page }) => {
    test.setTimeout(300_000);
    await restartApi({ mediaUploads: false });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await signIn(page, author);

    // --- Bants room composer ---
    await page.goto(`/banter/${roomId}`);
    const bantsText = `Bants uploads off ${RUN}`;
    await page.getByPlaceholder(/say something to/i).fill(bantsText);
    // The page cannot know the switch is off until the first attempt: choosing a file is that attempt.
    await page.getByTestId('picture-input').setInputFiles(png('off.png', WIDTH_CLEAR));
    await expect(page.getByText(OFF_TEXT)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Upload failed', { exact: true })).toHaveCount(0);
    await expect(page.locator('.media-item')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Picture/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Video/ })).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('media_uploads_disabled');
    await shot(page, '05-bants-uploads-off-desktop');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(bantsText)).toBeVisible();
    await expect
      .poll(async () => (await db().post.findFirst({ where: { authorId: author.userId, contentText: bantsText }, select: { id: true } }))?.id ?? null, { timeout: 15_000 })
      .not.toBeNull();
    const bantsRow = await db().post.findFirst({ where: { authorId: author.userId, contentText: bantsText }, select: { id: true, banterRoomId: true } });
    expect(bantsRow.banterRoomId).toBe(roomId);

    // --- Create Post composer ---
    await page.goto('/community');
    const feedText = `Create Post uploads off ${RUN}`;
    await page.getByLabel("What's happening?").fill(feedText);
    await page.getByTestId('picture-input').setInputFiles(png('off.png', WIDTH_CLEAR));
    await expect(page.getByText(OFF_TEXT)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Upload failed', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Picture/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Video/ })).toBeDisabled();
    await shot(page, '06-create-post-uploads-off-desktop');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(feedText).first()).toBeVisible();

    // Nothing was stored for either attempt.
    expect(await db().postMedia.count({ where: { uploaderId: author.userId, postId: { in: [bantsRow.id] } } })).toBe(0);
  });
});
