import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';
import { makeMp4 } from '../support/media-fixtures';

// R112: the one minimal video player, in real Chrome against the real API, Postgres and Redis. Run alone.
// The video file is a real 2 second H.264 MP4 answered (with byte ranges) from the test for an invented host.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'r112-screens');
fs.mkdirSync(OUT, { recursive: true });
const HOST = 'https://media.e2e.test';

interface Member extends Account {
  token: string;
}

async function member(label: string): Promise<Member> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const token = (await me(acct)).token;
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username: uniqueUsername(label.slice(0, 4)) } })).status).toBe(200);
  return { ...acct, token };
}

async function seedVideoPost(author: Member): Promise<string> {
  const file = 'r112.mp4';
  const url = `${HOST}/post-media/${author.userId}/${file}`;
  const post = await db().post.create({ data: { authorId: author.userId, contentText: 'Training clip', mediaUrls: [url] }, select: { id: true } });
  await db().postMedia.create({
    data: {
      uploaderId: author.userId,
      postId: post.id,
      kind: 'video',
      declaredContentType: 'video/mp4',
      declaredSize: 1000,
      uploadState: 'ready',
      status: 'approved',
      decisionSource: 'auto',
      decidedAt: new Date(),
      publishedAt: new Date(),
      publicUrl: url,
      publicKey: `post-media/${author.userId}/${file}`,
      contentType: 'video/mp4',
      byteSize: 1000,
    },
  });
  return post.id as string;
}

async function serve(page: Page, mp4: string): Promise<void> {
  const bytes = fs.readFileSync(mp4);
  await page.route(`${HOST}/**`, async (route: Route) => {
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
  });
}

const state = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector('.vp video') as HTMLVideoElement;
    return { paused: v.paused, muted: v.muted, t: v.currentTime, hasControls: v.hasAttribute('controls') };
  });

const mp4 = makeMp4();

test.describe.serial('R112 minimal video player', () => {
  test.skip(!mp4, 'ffmpeg is not available to make a test video');
  let viewer: Member;
  let postId = '';

  test.beforeAll(async () => {
    viewer = await member('vpv');
    const author = await member('vpa');
    postId = await seedVideoPost(author);
  });

  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    test(`${name}: play, pause, mute, seek by bar and keys, no native chrome`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await serve(page, mp4!);
      await loginViaUi(page, viewer.email);
      await expect(page).not.toHaveURL(/\/login/);
      await page.goto(`/posts/${postId}`);

      const player = page.locator('.vp').first();
      await expect(player).toBeVisible();
      await expect(player.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 15000 }).catch(() => undefined);
      expect((await state(page)).hasControls).toBe(false);
      await expect(player.locator('video')).not.toHaveAttribute('controls', /.*/);
      await expect(player.getByRole('button', { name: /fullscreen|download|speed|picture/i })).toHaveCount(0);
      await page.screenshot({ path: path.join(OUT, `${name}-paused.png`) });

      // Tap the video to play, tap again to pause; the name follows the state.
      const surface = player.getByRole('button', { name: 'Play video' });
      await surface.click();
      await expect(player.getByRole('button', { name: 'Pause video' })).toBeVisible();
      await expect.poll(async () => (await state(page)).paused).toBe(false);
      await page.screenshot({ path: path.join(OUT, `${name}-playing.png`) });
      await player.getByRole('button', { name: 'Pause video' }).click();
      await expect.poll(async () => (await state(page)).paused).toBe(true);

      // Mute: easy to hit (44px at least), pressed state, real muted flag.
      const mute = player.getByRole('button', { name: 'Mute video' });
      const box = await mute.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await mute.click();
      const unmute = player.getByRole('button', { name: 'Unmute video' });
      await expect(unmute).toHaveAttribute('aria-pressed', 'true');
      expect((await state(page)).muted).toBe(true);
      await unmute.click();
      expect((await state(page)).muted).toBe(false);

      // The progress bar is a slider; a click in the middle seeks about half way, a drag moves it.
      const bar = player.getByRole('slider', { name: 'Video progress' });
      await expect(bar).toHaveAttribute('aria-valuemin', '0');
      const b = (await bar.boundingBox())!;
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height - 2);
      const mid = (await state(page)).t;
      expect(mid).toBeGreaterThan(0.6);
      expect(mid).toBeLessThan(1.4);
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height - 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.9, b.y + b.height - 2, { steps: 5 });
      await page.mouse.up();
      expect((await state(page)).t).toBeGreaterThan(1.5);
      await expect(bar).toHaveAttribute('aria-valuetext', /of 0:0\d/);

      // Keyboard: Home, End, arrows (5 s steps clamp to the 2 s clip).
      await bar.focus();
      await page.keyboard.press('Home');
      expect((await state(page)).t).toBe(0);
      await page.keyboard.press('ArrowRight');
      expect((await state(page)).t).toBeGreaterThan(1.5);
      await page.keyboard.press('ArrowLeft');
      expect((await state(page)).t).toBe(0);
      await page.keyboard.press('End');
      expect((await state(page)).t).toBeGreaterThan(1.5);

      // Focus order inside the player: video surface, mute, progress bar.
      await player.getByRole('button', { name: /Play video|Pause video/ }).focus();
      await page.keyboard.press('Tab');
      await expect(player.getByRole('button', { name: /Mute video|Unmute video/ })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(bar).toBeFocused();
    });
  }
});
