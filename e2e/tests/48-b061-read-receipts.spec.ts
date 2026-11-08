import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-061 read receipts, the web leg (backend: PR #686): the Read receipts switch on Settings > Privacy > Direct
// Messages and the "Seen 08:09 AM" label under my latest message, in real Chrome against the real API, Postgres
// and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// REAL: the saved setting (read back through GET /users/me/settings and from Postgres), the age default (on for an
// adult, off for an under-18 account), the server deciding whether a read time is returned (both people on), and
// the label drawn from the real `readAt`. STUBBED IN THE BROWSER: the failed save (a 500 on the PATCH), which
// cannot be produced against a healthy server.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b061-readreceipt-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string): Promise<Verified> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const { token } = await me(acct);
  const username = uniqueUsername(label);
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...acct, token, username };
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

async function send(from: Verified, conversationId: string, text: string): Promise<{ id: string }> {
  const sent = await api('POST', `/conversations/${conversationId}/messages`, { token: from.token, body: { contentText: text } });
  expect([200, 201]).toContain(sent.status);
  return { id: sent.body.id as string };
}

async function markRead(reader: Verified, conversationId: string): Promise<void> {
  const res = await api('PATCH', `/conversations/${conversationId}/read`, { token: reader.token });
  expect(res.status).toBe(200);
}

async function setReceipts(who: Verified, on: boolean): Promise<void> {
  const res = await api('PATCH', '/users/me/settings', { token: who.token, body: { readReceipts: on } });
  expect(res.status).toBe(200);
  expect(res.body.readReceipts).toBe(on);
}

async function threadFor(who: Verified, conversationId: string): Promise<any[]> {
  const res = await api('GET', `/conversations/${conversationId}/messages`, { token: who.token });
  expect(res.status).toBe(200);
  return res.body.items as any[];
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

test.describe.serial('Read receipts', () => {
  let a: Verified; // the person using the screens
  let b: Verified; // the other person
  let conv = '';
  let m1 = '';
  let m2 = '';

  test.beforeAll(async () => {
    a = await verifiedAdult('rr-a');
    b = await verifiedAdult('rr-b');
    const started = await api('POST', '/conversations', { token: a.token, body: { recipientId: b.userId } });
    expect([200, 201]).toContain(started.status);
    conv = started.body.id as string;
    m1 = (await send(a, conv, 'A first: are we training on Saturday')).id;
    m2 = (await send(a, conv, 'A second: seven at Rowe Park')).id;
  });

  test('Settings: an adult starts On, the row reads as drawn, and a toggle saves and survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, a.email);
    await page.goto('/settings/privacy/direct-messages');

    const toggle = page.getByRole('switch', { name: 'Read receipts' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('When this is on, people you message can see when you’ve read their messages.')).toBeVisible();
    await expect(page.getByText(/not adjustable yet/i)).toHaveCount(0);
    expect((await api('GET', '/users/me/settings', { token: a.token })).body.readReceipts).toBe(true);
    await shot(page, '01-settings-on-desktop');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toBeEnabled();
    await expect.poll(async () => (await api('GET', '/users/me/settings', { token: a.token })).body.readReceipts).toBe(false);
    expect((await db().user.findUnique({ where: { id: a.userId }, select: { readReceipts: true } })).readReceipts).toBe(false);
    await shot(page, '02-settings-off-desktop');

    await page.reload();
    await expect(page.getByRole('switch', { name: 'Read receipts' })).toHaveAttribute('aria-checked', 'false');

    // Who can message me is untouched by this setting.
    await expect(page.getByRole('radio', { name: /everyone the rules allow/i })).toBeChecked();

    await page.getByRole('switch', { name: 'Read receipts' }).click();
    await expect(page.getByRole('switch', { name: 'Read receipts' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await api('GET', '/users/me/settings', { token: a.token })).body.readReceipts).toBe(true);
  });

  test('Settings: a failed save puts the switch back and shows the banner above the row (stubbed 500)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, a.email);
    await page.goto('/settings/privacy/direct-messages');
    const toggle = page.getByRole('switch', { name: 'Read receipts' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await page.route('**/users/me/settings', (route) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.continue(),
    );
    await toggle.click();

    const banner = page.getByRole('alert');
    await expect(banner).toHaveText('Couldn’t save your change. Your setting is back to what it was.');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeEnabled();
    // Above the row: the banner sits before the title on the page.
    const bannerY = (await banner.boundingBox())!.y;
    const titleY = (await page.getByText('Read receipts', { exact: true }).boundingBox())!.y;
    expect(bannerY).toBeLessThan(titleY);
    await shot(page, '03-settings-save-failed-desktop');
    expect((await api('GET', '/users/me/settings', { token: a.token })).body.readReceipts).toBe(true);
  });

  test('Settings: an under-18 account starts Off, and the mobile layout has no sideways scroll', async ({ page }) => {
    const minor = await registerViaApi({ age: 15, label: 'rr-minor' });
    const { token } = await me(minor);
    expect((await api('GET', '/users/me/settings', { token })).body.readReceipts).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, minor.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/settings/privacy/direct-messages');
    await expect(page.getByRole('switch', { name: 'Read receipts' })).toHaveAttribute('aria-checked', 'false');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, '04-settings-off-mobile-under18');
  });

  test('mobile page: Seen shows under my latest message only, with the real read time', async ({ page }) => {
    await markRead(b, conv); // B opens the thread: both of A's messages are read
    const items = await threadFor(a, conv);
    const latest = items.find((i) => i.id === m2);
    const older = items.find((i) => i.id === m1);
    expect(latest.readAt).toBeTruthy();
    expect(older.readAt).toBeTruthy(); // both read, still only one label

    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, a.email);
    await page.goto(`/messages/${conv}`);
    await expect(page.getByText('A second: seven at Rowe Park')).toBeVisible();

    const labels = page.locator('.msg-seen');
    await expect(labels).toHaveCount(1);
    await expect(labels).toHaveText(`Seen ${clock(latest.readAt)}`);
    // Right under the latest bubble, not the older one.
    const labelBox = (await labels.boundingBox())!;
    const latestBox = (await page.locator('.msg-host', { hasText: 'A second: seven at Rowe Park' }).boundingBox())!;
    const olderBox = (await page.locator('.msg-host', { hasText: 'A first: are we training on Saturday' }).boundingBox())!;
    expect(labelBox.y).toBeGreaterThanOrEqual(latestBox.y + latestBox.height - 1);
    expect(labelBox.y).toBeGreaterThan(olderBox.y + olderBox.height);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, '05-seen-mobile');

    // They reply: the label stays under MY latest message.
    await send(b, conv, 'B reply: yes, see you there');
    await page.reload();
    await expect(page.getByText('B reply: yes, see you there')).toBeVisible();
    await expect(page.locator('.msg-seen')).toHaveCount(1);
    const replyBox = (await page.locator('.msg-host', { hasText: 'B reply: yes, see you there' }).boundingBox())!;
    expect((await page.locator('.msg-seen').boundingBox())!.y).toBeLessThan(replyBox.y);
    await shot(page, '06-seen-after-reply-mobile');
  });

  test('pop-up: Seen shows under my latest message, and is gone while my newest message is unread', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, a.email);
    await page.goto('/community');
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(b.username) }).click();
    const chat = page.getByRole('region', { name: `Chat with ${b.username}`, exact: true });
    await expect(chat.getByText('A second: seven at Rowe Park')).toBeVisible();

    const items = await threadFor(a, conv);
    const latest = items.find((i) => i.id === m2);
    await expect(chat.locator('.msg-seen')).toHaveCount(1);
    await expect(chat.locator('.msg-seen')).toHaveText(`Seen ${clock(latest.readAt)}`);
    await shot(page, '07-seen-popup-desktop');

    // A sends a new message: it is unread, so no label anywhere (the older read message does not keep it).
    await chat.getByLabel(/Write a message to/).fill('A third: bring the bibs');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByText('A third: bring the bibs')).toBeVisible();
    await expect(chat.locator('.msg-seen')).toHaveCount(0);
    await shot(page, '08-no-seen-new-message-desktop');

    // B reads it: after a reload the label is under the new message.
    await markRead(b, conv);
    await page.reload();
    await panel.getByRole('button', { name: new RegExp(b.username) }).click();
    await expect(chat.getByText('A third: bring the bibs')).toBeVisible();
    await expect(chat.locator('.msg-seen')).toHaveCount(1);
    const box = (await chat.locator('.msg-seen').boundingBox())!;
    const thirdBox = (await chat.locator('.msg-host', { hasText: 'A third: bring the bibs' }).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(thirdBox.y + thirdBox.height - 1);
  });

  test('the server decides: when either person turns receipts off, no label, and it returns when they turn it on', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, a.email);

    // THEY turn it off: A gets no read time, so no label (the thread is read, only the setting changed).
    await setReceipts(b, false);
    expect((await threadFor(a, conv)).every((i) => i.readAt === null)).toBe(true);
    await page.goto(`/messages/${conv}`);
    await expect(page.getByText('A third: bring the bibs')).toBeVisible();
    await expect(page.locator('.msg-seen')).toHaveCount(0);
    await shot(page, '09-no-seen-other-person-off-mobile');

    // They turn it back on: the earlier seen state is back.
    await setReceipts(b, true);
    await page.reload();
    await expect(page.locator('.msg-seen')).toHaveCount(1);

    // I turn mine off: no label for me either.
    await setReceipts(a, false);
    await page.reload();
    await expect(page.getByText('A third: bring the bibs')).toBeVisible();
    await expect(page.locator('.msg-seen')).toHaveCount(0);
    await setReceipts(a, true);
    await page.reload();
    await expect(page.locator('.msg-seen')).toHaveCount(1);
  });

  test('a message I received never gets a label, even though I opened and read it', async ({ page }) => {
    // B's view of the same thread: A read B's reply (A opened it above), but B's own latest message is B's.
    await markRead(a, conv);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, b.email);
    await page.goto(`/messages/${conv}`);
    await expect(page.getByText('B reply: yes, see you there')).toBeVisible();
    // The label may sit under B's latest message only; A's messages (received by B) never carry one.
    const labels = page.locator('.msg-seen');
    await expect(labels).toHaveCount(1);
    const labelY = (await labels.boundingBox())!.y;
    const replyBox = (await page.locator('.msg-host', { hasText: 'B reply: yes, see you there' }).boundingBox())!;
    expect(labelY).toBeGreaterThanOrEqual(replyBox.y + replyBox.height - 1);
    // Nothing of A's (messages B received) has one right under it.
    const thirdBox = (await page.locator('.msg-host', { hasText: 'A third: bring the bibs' }).boundingBox())!;
    expect(labelY).toBeLessThan(thirdBox.y);
  });
});
