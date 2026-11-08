import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-117 (Decision Log #403 item 16, #404 item 10): Bants is an open forum. A signed-in account that has NOT
// bookmarked ("joined") a room can post in it; "Add to My Bants" is only a bookmark. Real Chrome, real API,
// Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// B is the room's creator, A is the non-member who posts. Every request that creates state goes through the real
// API; what is asserted on the page is read back from the API and from Postgres.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b117-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string): Promise<Verified> {
  const a = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const username = uniqueUsername(label);
  expect((await api('PATCH', `/users/${a.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...a, token, username };
}

async function createRoom(by: Verified, name: string): Promise<string> {
  const res = await api('POST', '/banter-rooms', { token: by.token, body: { name, scopeType: 'topic' } });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

async function memberRows(roomId: string, userId: string): Promise<number> {
  return db().banterRoomMember.count({ where: { banterRoomId: roomId, userId } });
}

async function openRoom(page: Page, who: Verified, roomId: string) {
  await loginViaUi(page, who.email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
  await page.goto(`/banter/${roomId}`);
}

test.describe.serial('Bants open forum: room page', () => {
  let creator: Verified;
  let outsider: Verified;
  let roomId = '';
  let inactiveRoomId = '';

  test.beforeAll(async () => {
    creator = await verifiedAdult('b117-creator');
    outsider = await verifiedAdult('b117-outsider');
    roomId = await createRoom(creator, `Matchday chat ${Date.now()}`);
    const attached = await api('POST', `/banter-rooms/${roomId}/topics`, {
      token: creator.token,
      body: { names: ['Premier League', 'Arsenal'] },
    });
    expect([200, 201]).toContain(attached.status);
    inactiveRoomId = await createRoom(creator, `Quiet corner ${Date.now()}`);
    const off = await api('PATCH', `/banter-rooms/${inactiveRoomId}/status`, { token: creator.token, body: { status: 'inactive' } });
    expect(off.status).toBe(200);
  });

  test('a non-member sees the open composer, posts without joining, and the bookmark stays separate', async ({ page }) => {
    expect(await memberRows(roomId, outsider.userId)).toBe(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRoom(page, outsider, roomId);

    // The bookmark reads "Add to My Bants"; nothing says "join first".
    await expect(page.getByRole('button', { name: 'Add to My Bants' })).toBeVisible();
    await expect(page.getByText(/join this room/i)).toHaveCount(0);
    await expect(page.getByText(/must join/i)).toHaveCount(0);
    const composer = page.getByPlaceholder(/say something to/i);
    await expect(composer).toBeVisible();
    await expect(composer).toBeEnabled();
    // The attach button is still disabled (no photos or video in Bants).
    await expect(page.getByRole('button', { name: /attach photo\/video/i })).toBeDisabled();
    // Topic chips are read only, for the outsider and for everyone else in this PR.
    const topics = page.getByRole('list', { name: 'Topics' });
    await expect(topics.getByText('Premier League')).toBeVisible();
    await expect(topics.getByText('Arsenal')).toBeVisible();
    await expect(page.getByRole('button', { name: /add topic|remove|deactivate|reactivate/i })).toHaveCount(0);
    await shot(page, '01-non-member-room-desktop');

    const text = `Open forum post ${Date.now()}`;
    await composer.fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();

    // Real server state: the post is in the room feed, written by the outsider, and no membership row exists.
    const feed = await api('GET', `/banter-rooms/${roomId}/posts`, { token: creator.token });
    expect(feed.status).toBe(200);
    const mine = (feed.body.items as any[]).find((p) => p.contentText === text);
    expect(mine).toBeTruthy();
    expect(mine.authorId).toBe(outsider.userId);
    expect(await memberRows(roomId, outsider.userId)).toBe(0);
    const unchanged = await api('GET', `/banter-rooms/${roomId}`, { token: outsider.token });
    expect(unchanged.body.joined).toBe(false);
    expect(unchanged.body.memberCount).toBe(1); // only the creator, auto-joined at creation
    await expect(page.getByRole('button', { name: 'Add to My Bants' })).toBeVisible();

    // The bookmark is a separate, optional action.
    await page.getByRole('button', { name: 'Add to My Bants' }).click();
    await expect(page.getByRole('button', { name: 'In My Bants' })).toBeVisible();
    await expect(page.getByText(/2 members/)).toBeVisible();
    expect(await memberRows(roomId, outsider.userId)).toBe(1);
    await expect(composer).toBeEnabled();
    await shot(page, '02-in-my-bants-desktop');

    // Removing the bookmark keeps the composer open and the post in place.
    await page.getByRole('button', { name: 'In My Bants' }).click();
    await expect(page.getByRole('button', { name: 'Add to My Bants' })).toBeVisible();
    expect(await memberRows(roomId, outsider.userId)).toBe(0);
    await expect(page.getByText(text)).toBeVisible();
  });

  test('an inactive room shows the grey dot and the Inactive pill, and can still be posted in', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openRoom(page, outsider, inactiveRoomId);

    await expect(page.getByRole('img', { name: 'Inactive room' })).toBeVisible();
    await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to My Bants' })).toBeVisible();
    const composer = page.getByPlaceholder(/say something to/i);
    await expect(composer).toBeEnabled();
    await shot(page, '03-inactive-room-mobile');

    const text = `Still talking ${Date.now()}`;
    await composer.fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();
    expect(await memberRows(inactiveRoomId, outsider.userId)).toBe(0);

    // 390 px: no sideways scroll.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('an active room shows no Inactive pill', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openRoom(page, outsider, roomId);
    await expect(page.getByRole('img', { name: 'Active room' })).toBeVisible();
    await expect(page.getByText('Inactive', { exact: true })).toHaveCount(0);
    await shot(page, '04-active-room-mobile');
  });
});
