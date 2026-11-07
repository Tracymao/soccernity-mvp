import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { test, expect, type Page, type Route } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';
import { makeMp4 } from '../support/media-fixtures';

// B-061 (Decision Log #472 default (d)): the blurred media state on post cards, in real Chrome against the real
// API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// The author's setting is the real PATCH /users/me/settings { mediaSensitive } and the posts are read through
// the real GET /posts/:id, /posts/feed and /users/:id/saved-posts, so `mediaSensitive` on every card is the
// server's own answer. The files themselves are stand-ins: the posts are seeded with an already-approved
// PostMedia row whose public address is an invented host that the browser answers from the test (page.route), so
// no object store is needed. The upload pipeline is covered by spec 18.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b061-blur-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const HOST = 'https://media.e2e.test';

/** A 640 x 360 colour-blocked PNG, so a blur is visible in a screenshot. */
function photo(): Buffer {
  const w = 640;
  const h = 360;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y += 1) {
    const row = y * (1 + w * 3);
    raw[row] = 0;
    for (let x = 0; x < w; x += 1) {
      const inCircle = (x - 200) ** 2 + (y - 170) ** 2 < 130 ** 2;
      const inBlock = x > 330 && x < 590 && y > 110 && y < 260;
      const rgb = inCircle ? [40, 46, 101] : inBlock ? [123, 185, 41] : [229, 236, 224];
      raw.set(rgb, row + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface Member extends Account {
  token: string;
  username: string;
}

async function member(label: string): Promise<Member> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const token = (await me(acct)).token;
  const username = uniqueUsername(label.slice(0, 4));
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...acct, token, username };
}

/** A post with one APPROVED, published file, made directly in Postgres (the file itself is answered by page.route). */
async function seedPost(author: Member, text: string, kind: 'image' | 'video', file: string): Promise<string> {
  const url = `${HOST}/post-media/${author.userId}/${file}`;
  const post = await db().post.create({ data: { authorId: author.userId, contentText: text, mediaUrls: [url] }, select: { id: true } });
  await db().postMedia.create({
    data: {
      uploaderId: author.userId,
      postId: post.id,
      kind,
      declaredContentType: kind === 'image' ? 'image/png' : 'video/mp4',
      declaredSize: 1000,
      uploadState: 'ready',
      status: 'approved',
      decisionSource: 'auto',
      decidedAt: new Date(),
      publishedAt: new Date(),
      publicUrl: url,
      publicKey: `post-media/${author.userId}/${file}`,
      contentType: kind === 'image' ? 'image/png' : 'video/mp4',
      byteSize: 1000,
    },
  });
  return post.id as string;
}

/** Answers the invented media host from the test: pictures as a PNG, videos as the harness MP4 (with ranges),
 *  anything named `slow` after a delay, anything named `broken` with a 404. */
async function serveMedia(page: Page, mp4: string | null): Promise<void> {
  const png = photo();
  await page.route(`${HOST}/**`, async (route: Route) => {
    const url = route.request().url();
    if (url.includes('broken')) return route.fulfill({ status: 404, body: 'no' });
    if (url.includes('slow')) await new Promise((r) => setTimeout(r, 2500));
    if (url.endsWith('.mp4') && mp4) {
      const bytes = fs.readFileSync(mp4);
      const range = route.request().headers()['range'];
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        const start = Number(m?.[1] ?? 0);
        const end = m?.[2] ? Number(m[2]) : bytes.length - 1;
        return route.fulfill({
          status: 206,
          headers: { 'content-type': 'video/mp4', 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'accept-ranges': 'bytes' },
          body: bytes.subarray(start, end + 1),
        });
      }
      return route.fulfill({ status: 200, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' }, body: bytes });
    }
    return route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: png });
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

const cover = (page: Page, noun = 'picture') => page.getByRole('button', { name: `Sensitive ${noun} hidden. Tap to view.` });

test.describe.serial('Blurred media on post cards', () => {
  let viewer: Member;
  let sensitiveAuthor: Member;
  let plainAuthor: Member;
  let imagePost = '';
  let videoPost = '';
  let plainPost = '';
  let brokenPost = '';
  let slowPost = '';
  const mp4 = makeMp4();

  test.beforeAll(async () => {
    viewer = await member('blv');
    sensitiveAuthor = await member('bla');
    plainAuthor = await member('blp');
    const set = await api('PATCH', '/users/me/settings', { token: sensitiveAuthor.token, body: { mediaSensitive: true } });
    expect(set.status).toBe(200);
    imagePost = await seedPost(sensitiveAuthor, 'Photos from Saturday’s match at Rowe Park.', 'image', 'photo.png');
    videoPost = await seedPost(sensitiveAuthor, 'Clip from Saturday’s match at Rowe Park.', 'video', 'clip.mp4');
    brokenPost = await seedPost(sensitiveAuthor, 'A picture that will not load', 'image', 'broken.png');
    slowPost = await seedPost(sensitiveAuthor, 'A picture that loads slowly', 'image', 'slow.png');
    plainPost = await seedPost(plainAuthor, 'Not sensitive: photos from the other pitch.', 'image', 'photo2.png');
  });

  test('the server says which posts are sensitive (the author’s setting, for any viewer)', async () => {
    const read = async (id: string) => (await api('GET', `/posts/${id}`, { token: viewer.token })).body;
    expect((await read(imagePost)).mediaSensitive).toBe(true);
    expect((await read(plainPost)).mediaSensitive).toBe(false);
  });

  test('1. blurred, then revealed with a Hide chip, then hidden again; keyboard operable; nothing is stored', async ({ page }) => {
    await serveMedia(page, mp4);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${imagePost}`);

    const button = cover(page);
    await expect(button).toBeVisible();
    await expect(page.getByText('Sensitive content')).toBeVisible();
    await expect(page.getByText('Tap to view')).toBeVisible();
    // The blurred picture is real CSS blur and is not exposed to assistive technology.
    const media = page.locator('.sensitive__media').first();
    await expect(media).toHaveAttribute('aria-hidden', 'true');
    expect(await media.evaluate((el) => getComputedStyle(el).filter)).toContain('blur');
    await expect(page.getByRole('img', { name: 'Picture attached to this post' })).toHaveCount(0);
    await shot(page, 'desktop-blurred-picture');

    // Keyboard: focus the cover (it is the first focusable thing in the media) and press Enter.
    await button.focus();
    await page.keyboard.press('Enter');
    const hide = page.getByRole('button', { name: 'Hide' });
    await expect(hide).toBeVisible();
    await expect(hide).toBeFocused();
    expect(await media.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    const img = page.getByRole('img', { name: 'Picture attached to this post' });
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await shot(page, 'desktop-revealed-picture');

    // Space hides it again, and focus returns to the cover.
    await page.keyboard.press('Space');
    await expect(cover(page)).toBeVisible();
    await expect(cover(page)).toBeFocused();

    // Revealed state is not kept: reveal, reload, blurred again, and nothing was written anywhere.
    await cover(page).click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
    const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }));
    expect(JSON.stringify(stored)).not.toMatch(/sensitive|reveal|blur/i);
    await page.reload();
    await expect(cover(page)).toBeVisible();
  });

  test('2. a blurred video keeps its length chip, and shows the player only after Tap to view', async ({ page }) => {
    test.skip(!mp4, 'ffmpeg is not installed for the harness, so there is no real video to serve');
    await serveMedia(page, mp4);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${videoPost}`);
    await expect(cover(page, 'video')).toBeVisible();
    await expect(page.locator('.sensitive__duration')).toHaveText(/^0:0[0-9]$/);
    await expect(page.locator('.sensitive__media').first()).toHaveAttribute('inert', '');
    await shot(page, 'desktop-blurred-video');
    await cover(page, 'video').click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
    await expect(page.locator('.sensitive__duration')).toHaveCount(0);
    await expect(page.getByLabel('Video attached to this post')).toBeVisible();
  });

  test('3. media that is not sensitive is shown as before: no blur, no cover', async ({ page }) => {
    await serveMedia(page, mp4);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${plainPost}`);
    await expect(page.getByRole('img', { name: 'Picture attached to this post' })).toBeVisible();
    await expect(page.locator('.sensitive')).toHaveCount(0);
    await expect(page.getByText('Sensitive content')).toHaveCount(0);
  });

  test('4. the author sees the same blur on their own post', async ({ page }) => {
    await serveMedia(page, mp4);
    await signIn(page, sensitiveAuthor.email);
    await page.goto(`/posts/${imagePost}`);
    await expect(cover(page)).toBeVisible();
    await cover(page).click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
  });

  test('5. loading and failed states: Loading, then Couldn’t load this picture, and Tap to try again', async ({ page }) => {
    await serveMedia(page, mp4);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${slowPost}`);
    await expect(page.getByText('Loading…')).toBeVisible();
    await shot(page, 'desktop-loading');
    await expect(cover(page)).toBeVisible({ timeout: 10_000 });

    await page.goto(`/posts/${brokenPost}`);
    const failed = page.getByRole('button', { name: /Couldn’t load this picture/ });
    await expect(failed).toBeVisible();
    await expect(page.getByText('Tap to try again')).toBeVisible();
    await shot(page, 'desktop-failed');
    await failed.click();
    // A fresh attempt starts: it fails again (the file is gone), but it did try.
    await expect(page.getByRole('button', { name: /Couldn’t load this picture/ })).toBeVisible();
  });

  test('6. the same card inherits it on the feed and in Saved posts', async ({ page }) => {
    await serveMedia(page, mp4);
    // The viewer follows the author, so the post is in their feed, and saves it.
    expect((await api('POST', `/users/${sensitiveAuthor.userId}/follow`, { token: viewer.token })).status).toBeLessThan(300);
    expect((await api('POST', `/posts/${imagePost}/save`, { token: viewer.token })).status).toBeLessThan(300);
    await signIn(page, viewer.email);

    await page.goto('/community');
    const feedCard = page.locator('article', { hasText: 'Photos from Saturday’s match at Rowe Park.' }).first();
    await expect(feedCard.getByRole('button', { name: 'Sensitive picture hidden. Tap to view.' })).toBeVisible();

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Saved' }).click();
    const savedCard = page.locator('article', { hasText: 'Photos from Saturday’s match at Rowe Park.' });
    await expect(savedCard.getByRole('button', { name: 'Sensitive picture hidden. Tap to view.' })).toBeVisible();
    await savedCard.getByRole('button', { name: 'Sensitive picture hidden. Tap to view.' }).click();
    await expect(savedCard.getByRole('button', { name: 'Hide' })).toBeVisible();
  });

  test('7. at 390px the cover fits and the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serveMedia(page, mp4);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${imagePost}`);
    await expect(cover(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, 'mobile-blurred-picture');
    await cover(page).click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
    await shot(page, 'mobile-revealed-picture');
  });
});
