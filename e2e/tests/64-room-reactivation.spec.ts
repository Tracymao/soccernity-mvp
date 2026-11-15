import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { adminPageAs, api, createQaAdmin, db, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// Staff reactivation of a Bants room (backend/room-staff-reactivation, PR #795; Decision Log #515) from the admin
// report detail: apps/admin/src/pages/moderation/ReportDetailPage.tsx -> ReportedRoomCard.tsx. Real Chrome, real API,
// Postgres and Redis. There is no Figma frame for this action; it reuses the Deactivate Room control.
//   1. a moderator deactivates a room from a report, then reactivates it from the same report
//   2. the room is usable again for a member
//   3. a room the CREATOR deactivated shows no Reactivate Room, and the real API refuses staff with the same answer
//   4. a stale page (another moderator reactivated first) reads "already active" from the server's code
// The acting admins are moderators created in Postgres and used through a locally signed token (createQaAdmin): the
// admin login is throttled and the suite spends that budget elsewhere. Every person is a synthetic account.
test.use({ viewport: { width: 1440, height: 1100 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'admin-reactivate-room-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const RUN = Date.now().toString(36);

async function createRoom(by: Verified, name: string): Promise<string> {
  const res = await api('POST', '/banter-rooms', { token: by.token, body: { name, scopeType: 'topic' } });
  if (![200, 201].includes(res.status)) throw new Error(`room create failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

async function reportRoom(reporter: Verified, roomId: string): Promise<string> {
  const res = await api('POST', '/reports', {
    token: reporter.token,
    body: { targetType: 'banter_room', targetId: roomId, reasonCategory: 'harassment_or_bullying', reason: `room ${RUN}` },
  });
  if (res.status !== 201) throw new Error(`POST /reports failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

async function staffDeactivate(admin: QaAdmin, reportId: string): Promise<void> {
  const res = await api('PATCH', `/admin/moderation/reports/${reportId}`, { token: admin.token, body: { action: 'room_deactivated' } });
  if (res.status !== 200) throw new Error(`room_deactivated failed ${res.status} ${JSON.stringify(res.body)}`);
}

async function roomStatus(roomId: string): Promise<string> {
  const row = await db().banterRoom.findUnique({ where: { id: roomId } });
  return row.status as string;
}

const reactivateButton = (page: Page) => page.getByRole('button', { name: 'Reactivate Room', exact: true });
const roomCard = (page: Page) => page.locator('.mod-card', { has: page.getByRole('heading', { name: 'Bants room' }) });

test.describe.serial('staff reactivate a Bants room from the admin report', () => {
  let mod: QaAdmin;
  let mod2: QaAdmin;
  let creator: Verified;
  let member: Verified;
  let reporter: Verified;

  let roomA = '';
  let reportA = '';
  let roomB = '';
  let reportB = '';
  let roomC = '';
  let reportC = '';

  test.beforeAll(async () => {
    mod = await createQaAdmin('moderator', `Room Mod ${RUN}`);
    mod2 = await createQaAdmin('moderator', `Room Mod Two ${RUN}`);
    creator = await verifiedAccount('rrcreator');
    member = await verifiedAccount('rrmember');
    reporter = await verifiedAccount('rrreporter');
    roomA = await createRoom(creator, `Reactivate A ${RUN}`);
    reportA = await reportRoom(reporter, roomA);
  });

  test('a moderator deactivates the room from its report, and the report then offers Reactivate Room', async ({ browser }) => {
    const page = await adminPageAs(browser, mod.token);
    await page.goto(`${URLS.admin}/moderation/reports/${reportA}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();

    // Open and active room: the card shows Active and offers no reactivation.
    await expect(roomCard(page).getByText('Active', { exact: true })).toBeVisible();
    await expect(reactivateButton(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Deactivate Room', exact: true }).click();
    await page.waitForURL(`${URLS.admin}/moderation`);
    expect(await roomStatus(roomA)).toBe('inactive');

    // The same report again: the room is Inactive, staff deactivated it, so the button is there.
    await page.goto(`${URLS.admin}/moderation/reports/${reportA}`);
    await expect(roomCard(page).getByText('Inactive', { exact: true })).toBeVisible();
    await expect(reactivateButton(page)).toBeVisible();
    await shot(page, '01-inactive-with-reactivate');
    await page.context().close();
  });

  test('pressing Reactivate Room makes the room active, leaves the page in place and writes one audit entry', async ({ browser }) => {
    const page = await adminPageAs(browser, mod.token);
    await page.goto(`${URLS.admin}/moderation/reports/${reportA}`);
    await reactivateButton(page).click();

    await expect(roomCard(page).getByText('Active', { exact: true })).toBeVisible();
    await expect(roomCard(page).getByText('Room reactivated.')).toBeVisible();
    await expect(reactivateButton(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/moderation/reports/${reportA}$`));
    await shot(page, '02-reactivated');

    expect(await roomStatus(roomA)).toBe('active');
    const audit = await db().adminActionLog.findMany({ where: { action: 'banter_room.reactivated', targetId: roomA } });
    expect(audit).toHaveLength(1);
    expect(audit[0].adminId).toBe(mod.id);
    // A reload still shows the room as Active with no button: the server says so, not local state.
    await page.reload();
    await expect(roomCard(page).getByText('Active', { exact: true })).toBeVisible();
    await expect(reactivateButton(page)).toHaveCount(0);
    await page.context().close();
  });

  test('the room is usable again: a member reads it as active and can post in it', async () => {
    const read = await api('GET', `/banter-rooms/${roomA}`, { token: member.token });
    expect(read.status).toBe(200);
    expect(read.body.status).toBe('active');
    const post = await api('POST', `/banter-rooms/${roomA}/posts`, {
      token: member.token,
      body: { contentText: `back in the room ${RUN}` },
    });
    expect([200, 201]).toContain(post.status);
    const feed = await api('GET', `/banter-rooms/${roomA}/posts`, { token: member.token });
    expect(feed.status).toBe(200);
    expect(JSON.stringify(feed.body)).toContain(`back in the room ${RUN}`);
  });

  test('a room the creator deactivated shows its status and no Reactivate Room, and the API refuses staff the same way', async ({ browser }) => {
    roomB = await createRoom(creator, `Reactivate B ${RUN}`);
    const off = await api('PATCH', `/banter-rooms/${roomB}/status`, { token: creator.token, body: { status: 'inactive' } });
    expect(off.status).toBe(200);
    reportB = await reportRoom(reporter, roomB);

    const page = await adminPageAs(browser, mod.token);
    await page.goto(`${URLS.admin}/moderation/reports/${reportB}`);
    await expect(roomCard(page).getByText('Inactive', { exact: true })).toBeVisible();
    await expect(reactivateButton(page)).toHaveCount(0);
    await shot(page, '03-creator-deactivated-no-action');
    await page.context().close();

    // The server is the authority: a direct call is a 409 with the stable code, and nothing changes.
    const direct = await api('POST', `/admin/banter-rooms/${roomB}/reactivate`, { token: mod.token });
    expect(direct.status).toBe(409);
    expect(direct.body.code).toBe('banter_room_not_staff_deactivated');
    expect(await roomStatus(roomB)).toBe('inactive');
  });

  test('a stale page: another moderator reactivated first, so the press reads "already active" and the room stays active', async ({ browser }) => {
    roomC = await createRoom(creator, `Reactivate C ${RUN}`);
    reportC = await reportRoom(reporter, roomC);
    await staffDeactivate(mod2, reportC);
    expect(await roomStatus(roomC)).toBe('inactive');

    const page = await adminPageAs(browser, mod.token);
    await page.goto(`${URLS.admin}/moderation/reports/${reportC}`);
    await expect(reactivateButton(page)).toBeVisible();

    // The other moderator gets there first, through the real API.
    const first = await api('POST', `/admin/banter-rooms/${roomC}/reactivate`, { token: mod2.token });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ id: roomC, status: 'active' });

    await reactivateButton(page).click();
    await expect(page.getByRole('alert')).toHaveText('This room is already active.');
    await expect(roomCard(page).getByText('Active', { exact: true })).toBeVisible();
    await expect(reactivateButton(page)).toHaveCount(0);
    await shot(page, '04-already-active');

    expect(await roomStatus(roomC)).toBe('active');
    // Only the first press wrote an audit entry.
    const audit = await db().adminActionLog.findMany({ where: { action: 'banter_room.reactivated', targetId: roomC } });
    expect(audit).toHaveLength(1);
    expect(audit[0].adminId).toBe(mod2.id);
    await page.context().close();
  });
});
