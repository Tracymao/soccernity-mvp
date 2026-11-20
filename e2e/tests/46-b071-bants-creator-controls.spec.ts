import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-071 (Decision Log #472): the Bants room creator's controls on the room page -- Deactivate / Reactivate room,
// Add topics, remove a topic. Real Chrome, real API, Postgres and Redis. Scoped to this work; no other Playwright
// spec is run by it. Everything asserted on the page is also read back from the API or from Postgres.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b071-screens');
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

async function attach(by: Verified, roomId: string, names: string[]) {
  const res = await api('POST', `/banter-rooms/${roomId}/topics`, { token: by.token, body: { names } });
  expect([200, 201]).toContain(res.status);
  return res.body.topics as { id: string; name: string }[];
}

async function roomOf(by: Verified, roomId: string) {
  const res = await api('GET', `/banter-rooms/${roomId}`, { token: by.token });
  expect(res.status).toBe(200);
  return res.body as { status: string; topics: { id: string; name: string }[] };
}

async function openRoom(page: Page, who: Verified, roomId: string) {
  await loginViaUi(page, who.email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
  await page.goto(`/banter/${roomId}`);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe.serial('Bants room creator controls', () => {
  let creator: Verified;
  let outsider: Verified;
  let roomId = '';
  let catalogueRoomId = '';

  test.beforeAll(async () => {
    creator = await verifiedAdult('b071-creator');
    outsider = await verifiedAdult('b071-outsider');
    roomId = await createRoom(creator, `English Premier League Room ${Date.now()}`);
    await attach(creator, roomId, ['Premier League', 'Arsenal']);
    // A second room puts two more topics in the shared catalogue for the "pick an existing topic" list.
    catalogueRoomId = await createRoom(creator, `Catalogue room ${Date.now()}`);
    await attach(creator, catalogueRoomId, ['Transfer window', 'NPFL']);
  });

  test('desktop: Deactivate (with its confirmation) and Reactivate change the real room status', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRoom(page, creator, roomId);

    await expect(page.getByRole('img', { name: 'Active room' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Room menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Arsenal' })).toBeVisible();
    await expect(page.getByRole('button', { name: /add topic/i })).toBeVisible();
    await shot(page, '01-creator-controls-desktop');

    await page.getByRole('button', { name: 'Room menu' }).click();
    await shot(page, '02-room-menu-desktop');
    await page.getByRole('menuitem', { name: 'Deactivate room' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Deactivate this room?' })).toBeVisible();
    await expect(dialog.getByText('People can still read the room. It shows as inactive in the list until you reactivate it.')).toBeVisible();
    await shot(page, '03-deactivate-confirm-desktop');

    // Cancel changes nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await roomOf(creator, roomId)).status).toBe('active');

    await page.getByRole('button', { name: 'Room menu' }).click();
    await page.getByRole('menuitem', { name: 'Deactivate room' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate room' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Inactive room' })).toBeVisible();
    expect((await roomOf(creator, roomId)).status).toBe('inactive');
    expect((await db().banterRoom.findUnique({ where: { id: roomId } }))?.status).toBe('inactive');
    await shot(page, '04-inactive-room-desktop');

    // Reactivate: no confirmation.
    await page.getByRole('button', { name: 'Room menu' }).click();
    await shot(page, '05-reactivate-menu-desktop');
    await page.getByRole('menuitem', { name: 'Reactivate room' }).click();
    await expect(page.getByText('Inactive', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Active room' })).toBeVisible();
    expect((await roomOf(creator, roomId)).status).toBe('active');
  });

  test('desktop: Add topics sends one typed name and one picked topic, and the chips survive a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRoom(page, creator, roomId);

    await page.getByRole('button', { name: /add topic/i }).click();
    const popover = page.getByRole('dialog');
    await expect(popover.getByRole('heading', { name: 'Add topics' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Add topic' })).toBeDisabled();
    // Already-attached topics are not offered again; the other room's topics are.
    await expect(popover.getByRole('button', { name: 'Transfer window' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Arsenal' })).toHaveCount(0);
    await shot(page, '06-add-topics-popover-desktop');

    // A one-letter name shows the rule and keeps Add disabled.
    const field = popover.getByPlaceholder('Type a topic, for example Transfer window');
    await field.fill('A');
    await expect(popover.getByText('Use 2 to 60 characters.')).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Add topic' })).toBeDisabled();
    await shot(page, '07-add-topics-rule-desktop');

    await field.fill('Derby day');
    await popover.getByRole('button', { name: 'Transfer window' }).click();
    await expect(popover.getByRole('button', { name: 'Add 2 topics' })).toBeEnabled();
    await shot(page, '08-add-topics-two-desktop');
    await popover.getByRole('button', { name: 'Add 2 topics' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const chips = page.getByRole('list', { name: 'Topics' });
    await expect(chips.getByText('Derby day')).toBeVisible();
    await expect(chips.getByText('Transfer window')).toBeVisible();
    const names = (await roomOf(creator, roomId)).topics.map((t) => t.name).sort();
    expect(names).toEqual(['Arsenal', 'Derby day', 'Premier League', 'Transfer window']);

    await page.reload();
    await expect(page.getByRole('list', { name: 'Topics' }).getByText('Derby day')).toBeVisible();
  });

  test('desktop: the remove cross unlinks the topic from this room only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRoom(page, creator, roomId);
    const before = (await roomOf(creator, roomId)).topics.find((t) => t.name === 'Arsenal');
    expect(before).toBeTruthy();

    // A second room uses Arsenal too: it must keep it.
    const other = await createRoom(creator, `Arsenal chat ${Date.now()}`);
    await attach(creator, other, ['Arsenal']);

    await page.getByRole('button', { name: 'Remove Arsenal' }).click();
    await expect(page.getByRole('list', { name: 'Topics' }).getByText('Arsenal')).toHaveCount(0);
    await shot(page, '09-topic-removed-desktop');

    expect((await roomOf(creator, roomId)).topics.map((t) => t.name)).not.toContain('Arsenal');
    // Only the junction row went: the shared Topic and the other room's link are intact.
    expect(await db().topic.count({ where: { id: before!.id } })).toBe(1);
    expect((await roomOf(creator, other)).topics.map((t) => t.name)).toContain('Arsenal');
  });

  test('someone who is not the creator sees read-only chips, and the real endpoints refuse them', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openRoom(page, outsider, roomId);
    const topics = page.getByRole('list', { name: 'Topics' });
    await expect(topics.getByText('Premier League')).toBeVisible();
    await expect(page.getByRole('button', { name: /add topic|^remove |room menu|deactivate|reactivate/i })).toHaveCount(0);
    await shot(page, '10-non-creator-desktop');

    const topic = (await roomOf(creator, roomId)).topics[0];
    expect((await api('PATCH', `/banter-rooms/${roomId}/status`, { token: outsider.token, body: { status: 'inactive' } })).status).toBe(403);
    expect((await api('POST', `/banter-rooms/${roomId}/topics`, { token: outsider.token, body: { names: ['Nope'] } })).status).toBe(403);
    expect((await api('DELETE', `/banter-rooms/${roomId}/topics/${topic.id}`, { token: outsider.token })).status).toBe(403);
    expect((await roomOf(creator, roomId)).status).toBe('active');
  });

  test('390 px: the Add topics sheet, a failed status change then Try again, and no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openRoom(page, creator, roomId);
    await expect(page.getByRole('button', { name: 'Room menu' })).toBeVisible();
    await shot(page, '11-creator-controls-mobile');

    await page.getByRole('button', { name: /add topic/i }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Add topics' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Transfer window' }).or(sheet.getByRole('button', { name: 'NPFL' }))).toBeVisible();
    await shot(page, '12-add-topics-sheet-mobile');
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A network failure on the status change: the frame's banner, then Try again goes through.
    await page.route('**/banter-rooms/*/status', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Room menu' }).click();
    await page.getByRole('menuitem', { name: 'Deactivate room' }).click();
    const dialog = page.getByRole('dialog');
    await shot(page, '13-deactivate-confirm-mobile');
    await dialog.getByRole('button', { name: 'Deactivate room' }).click();
    await expect(dialog.getByText('Couldn’t change the room status. Check your connection and try again.')).toBeVisible();
    await shot(page, '14-deactivate-error-mobile');
    expect((await roomOf(creator, roomId)).status).toBe('active');

    await page.unroute('**/banter-rooms/*/status');
    await dialog.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
    expect((await roomOf(creator, roomId)).status).toBe('inactive');
    await shot(page, '15-inactive-room-mobile');

    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
