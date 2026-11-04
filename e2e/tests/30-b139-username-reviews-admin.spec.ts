import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { adminToken, api, db, getAdminToken, registerViaApi } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { ADMIN_CREDENTIALS, REPO, URLS } from '../support/stack';

// B-139 part (c) (Decision Log #467): the admin "Username reviews" screens in real Chrome, against the real API,
// Postgres and Redis. Scoped to this work; the other Playwright specs are not run by it.
//
// Roles: the QA admin is a superadmin and is the DECIDER. A moderator "Mira Okon" is the REVOKER (rows are written
// straight into RevokedUsername / UsernameReviewRequest, as the revoke and the person's request are other work), a
// second moderator "Jide Aluko" decides one request through the API behind the page's back, and an editor is signed
// in to show the nav row and the server's 403.
//
// The admin login is throttled to 5 per 15 minutes per IP (Decision Log #190): this spec makes 3 API logins
// (the QA admin through getAdminToken, Jide, the editor).
test.use({ viewport: { width: 1440, height: 1184 } });

const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b139-admin-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const PASSWORD = 'QaAdmin#2026-pass';
const GOOD_REASON = `Second review found no rule broken ${RUN}.`;

/** adminPage(), but the console's start-up refresh is answered with THIS admin's access token. */
async function adminPageAs(browser: Browser, token: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: URLS.admin });
  const cors = {
    'access-control-allow-origin': URLS.admin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-auth-mode',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  await ctx.route(`${URLS.api}/admin/auth/refresh`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        accessToken: token,
        accessTokenExpiresIn: 900,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    });
  });
  return ctx.newPage();
}

async function createAdmin(
  role: 'moderator' | 'editor',
  name: string,
  withToken: boolean,
): Promise<{ id: string; email: string; token: string }> {
  const argon2 = requireFromApi('argon2');
  const email = `qa-${role}-${RUN}-${Math.random().toString(36).slice(2, 6)}@soccernity.test`;
  const row = await db().adminUser.create({
    data: { email, fullName: name, passwordHash: await argon2.hash(PASSWORD), role, accountStatus: 'active' },
  });
  return { id: row.id, email, token: withToken ? await adminToken(email, PASSWORD) : '' };
}

interface Seeded {
  userId: string;
  name: string;
  handle: string;
  recordId: string;
  requestId: string;
}

test.describe.serial('admin username reviews', () => {
  let qaAdminId = '';
  let mira: { id: string; email: string; token: string };
  let jide: { id: string; email: string; token: string };
  let editor: { id: string; email: string; token: string };
  let ada: Seeded; // pending, revoked by Mira: reinstated in the UI
  let tolu: Seeded; // pending, revoked by Mira: declined in the UI
  let own: Seeded; // pending, revoked by the QA admin: must be absent from the QA admin's list
  let kemi: Seeded; // pending, the person has chosen a new username since: reinstate is refused
  let lola: Seeded; // pending, decided by Jide behind the page's back
  let old: Seeded; // already declined

  async function seed(label: string, name: string, revokedBy: string, opts: { status?: string; message?: string | null } = {}): Promise<Seeded> {
    const acct = await registerViaApi({ age: 30, label: `ur-${label}`, displayName: name });
    const handle = `${label}_${RUN}`.toLowerCase();
    const now = Date.now();
    const record = await db().revokedUsername.create({
      data: {
        username: handle,
        userId: acct.userId,
        revokedAt: new Date(now - 6 * 86_400_000),
        holdUntil: new Date(now + 24 * 86_400_000),
        revokedByAdminId: revokedBy,
      },
    });
    const request = await db().usernameReviewRequest.create({
      data: {
        revokedUsernameId: record.id,
        userId: acct.userId,
        message: opts.message === undefined ? `Please look again at ${handle}, it was my own name.` : opts.message,
        status: opts.status ?? 'pending',
        createdAt: new Date(now - 60_000 * (label.length + 1)),
        ...(opts.status && opts.status !== 'pending' ? { decidedAt: new Date(now - 30_000), decidedByAdminId: revokedBy } : {}),
      },
    });
    return { userId: acct.userId, name, handle, recordId: record.id, requestId: request.id };
  }

  const linkFor = (s: Seeded) => `/username-reviews/${s.requestId}`;
  const rowLink = (page: Page, s: Seeded) => page.getByRole('link', { name: new RegExp(`from ${s.name} about @${s.handle}`) });

  test.beforeAll(async () => {
    const qa = await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } });
    qaAdminId = qa.id;
    mira = await createAdmin('moderator', `Mira Okon ${RUN}`, false);
    jide = await createAdmin('moderator', `Jide Aluko ${RUN}`, true);
    editor = await createAdmin('editor', `Eddie Editor ${RUN}`, true);

    ada = await seed('adab', `Ada Bello ${RUN}`, mira.id);
    tolu = await seed('tolu', `Tolu Mensah ${RUN}`, mira.id);
    own = await seed('ownrev', `Own Revoker ${RUN}`, qaAdminId);
    kemi = await seed('kemio', `Kemi Okoro ${RUN}`, mira.id);
    lola = await seed('lola', `Lola Adeyemi ${RUN}`, mira.id);
    old = await seed('amara', `Amara Nwosu ${RUN}`, mira.id, { status: 'declined', message: null });
    // Kemi has chosen a new username since the removal.
    await db().user.update({ where: { id: kemi.userId }, data: { username: `kemi_new_${RUN}` } });
  });

  test.afterAll(async () => {
    await db().$disconnect();
  });

  test('the nav row is shown to a moderator and a superadmin, and not to an editor', async ({ browser }) => {
    const sup = await adminPage(browser);
    await sup.goto(`${URLS.admin}/dashboard`);
    const row = sup.getByRole('link', { name: 'Username reviews' });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('href', '/username-reviews');
    await sup.context().close();

    const mod = await adminPageAs(browser, jide.token);
    await mod.goto(`${URLS.admin}/dashboard`);
    await expect(mod.getByRole('link', { name: 'Username reviews' })).toBeVisible();
    await mod.context().close();

    const ed = await adminPageAs(browser, editor.token);
    await ed.goto(`${URLS.admin}/dashboard`);
    await expect(ed.getByRole('link', { name: 'Activity' })).toBeVisible();
    await expect(ed.getByRole('link', { name: 'Username reviews' })).toHaveCount(0);
    // The server still enforces it: the list answers an editor with a 403, shown as the load error.
    await ed.goto(`${URLS.admin}/username-reviews`);
    await expect(ed.getByText('Couldn’t load the review requests')).toBeVisible();
    await ed.context().close();
  });

  test('the list shows the pending requests, never the admin\'s own revocation, and links to the detail', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/username-reviews`);
    await expect(page.getByRole('heading', { level: 1, name: 'Username reviews' })).toBeVisible();
    const table = page.getByRole('table', { name: 'Username review requests' });
    await expect(table).toBeVisible();
    for (const s of [ada, tolu, kemi, lola]) {
      await expect(table.getByText(s.name)).toBeVisible();
      await expect(table.getByText(`@${s.handle}`)).toBeVisible();
    }
    await expect(table.getByText(`Mira Okon ${RUN}`).first()).toBeVisible();
    // The QA admin removed this username, so the server leaves the request out of the QA admin's list.
    await expect(table.getByText(own.name)).toHaveCount(0);
    // A decided request is not in the Pending view.
    await expect(table.getByText(old.name)).toHaveCount(0);
    await shot(page, '01-list-pending');

    await rowLink(page, ada).click();
    await expect(page).toHaveURL(new RegExp(`${linkFor(ada)}$`));
    await expect(page.getByRole('heading', { level: 1, name: `Review request #${ada.requestId.slice(0, 8)}` })).toBeVisible();
    await page.context().close();
  });

  test('the status filter: Declined shows the decided request, All shows both', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/username-reviews`);
    const table = page.getByRole('table', { name: 'Username review requests' });
    await expect(table.getByText(ada.name)).toBeVisible();

    await page.getByLabel('Status').selectOption('declined');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(table.getByText(old.name)).toBeVisible();
    await expect(table.getByText('Declined').first()).toBeVisible();
    await expect(table.getByText(ada.name)).toHaveCount(0);
    await expect(rowLink(page, old)).toHaveText('View');
    await shot(page, '02-list-declined');

    await page.getByLabel('Status').selectOption('all');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(table.getByText(old.name)).toBeVisible();
    await expect(table.getByText(ada.name)).toBeVisible();
    await page.context().close();
  });

  test('the detail shows only what the server returns, and survives a refresh', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}${linkFor(tolu)}`);
    // A direct visit: no router state, so the page re-reads the list.
    await expect(page.getByRole('heading', { level: 1, name: `Review request #${tolu.requestId.slice(0, 8)}` })).toBeVisible();
    const removal = page.getByRole('region', { name: 'Removal' });
    await expect(removal.getByText(tolu.name)).toBeVisible();
    await expect(removal.getByText(`@${tolu.handle}`)).toBeVisible();
    await expect(removal.getByText(`Mira Okon ${RUN}`)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Request' }).getByText(`Please look again at ${tolu.handle}, it was my own name.`)).toBeVisible();
    await expect(page.getByText('Reason recorded at removal')).toHaveCount(0);
    await expect(page.getByText('New username chosen')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reinstate username' })).toBeVisible();
    await expect(page.getByText('A decision is final. There is no second review.')).toBeVisible();
    await shot(page, '03-detail-pending');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: `Review request #${tolu.requestId.slice(0, 8)}` })).toBeVisible();
    await page.context().close();
  });

  test('reinstating: the reason is required, the decision is saved, the username comes back', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/username-reviews`);
    await rowLink(page, ada).click();
    await page.getByRole('button', { name: 'Reinstate username' }).click();
    const dialog = page.getByRole('dialog', { name: 'Decide on this request' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Reason (internal, required)')).toBeFocused();
    await expect(dialog.getByRole('radio', { name: /Reinstate/ })).toBeChecked();
    await expect(dialog.getByText('0 / 500')).toBeVisible();

    // Too short: refused in the dialog, nothing sent.
    await dialog.getByLabel('Reason (internal, required)').fill('too short');
    await dialog.getByRole('button', { name: 'Reinstate username' }).click();
    await expect(dialog.getByText('Enter at least 10 characters.')).toBeVisible();
    expect(await db().usernameReviewRequest.findUnique({ where: { id: ada.requestId } })).toMatchObject({ status: 'pending' });
    await shot(page, '04-dialog-reason-too-short');

    await dialog.getByLabel('Reason (internal, required)').fill(GOOD_REASON);
    await expect(dialog.getByText(`${GOOD_REASON.length} / 500`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Reinstate username' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Decision recorded')).toBeVisible();
    await expect(page.getByText(`Reinstated. @${ada.handle} is back on ${ada.name}’s account and the removal record is deleted.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reinstate username' })).toHaveCount(0);
    await shot(page, '05-detail-reinstated');

    // The server did it: username back, record and request gone, one audit row with the reason, one notification.
    expect((await db().user.findUnique({ where: { id: ada.userId } })).username).toBe(ada.handle);
    expect(await db().revokedUsername.findUnique({ where: { id: ada.recordId } })).toBeNull();
    expect(await db().usernameReviewRequest.findUnique({ where: { id: ada.requestId } })).toBeNull();
    const audit = await db().adminActionLog.findMany({ where: { targetId: ada.userId, action: 'user.username_review_decided' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].adminId).toBe(qaAdminId);
    expect(audit[0].notes).toBe(`decision=reinstate; username=${ada.handle}; reason=${GOOD_REASON}`);
    const notes = await db().notification.findMany({ where: { userId: ada.userId, type: 'username_review_decided' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].payloadRefId).toBe('reinstated');

    // A reinstated request no longer exists, so the list does not show it and a reload of its page says so.
    await page.goto(`${URLS.admin}/username-reviews`);
    await expect(page.getByRole('table', { name: 'Username review requests' }).getByText(ada.name)).toHaveCount(0);
    await page.goto(`${URLS.admin}${linkFor(ada)}`);
    await expect(page.getByText('Request not found')).toBeVisible();
    await page.context().close();
  });

  test('declining: opened from Decline, saved, and the record and the bar stay', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/username-reviews`);
    await rowLink(page, tolu).click();
    await page.getByRole('button', { name: 'Decline request' }).click();
    const dialog = page.getByRole('dialog', { name: 'Decide on this request' });
    await expect(dialog.getByRole('radio', { name: /Decline/ })).toBeChecked();
    await dialog.getByLabel('Reason (internal, required)').fill(GOOD_REASON);
    await dialog.getByRole('button', { name: 'Decline request' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(`Declined. @${tolu.handle} stays removed. This decision is final.`)).toBeVisible();
    await shot(page, '06-detail-declined');

    expect(await db().usernameReviewRequest.findUnique({ where: { id: tolu.requestId } })).toMatchObject({
      status: 'declined',
      decidedByAdminId: qaAdminId,
    });
    expect(await db().revokedUsername.findUnique({ where: { id: tolu.recordId } })).not.toBeNull();
    expect((await db().user.findUnique({ where: { id: tolu.userId } })).username).toBeNull();
    const audit = await db().adminActionLog.findFirst({ where: { targetId: tolu.userId, action: 'user.username_review_decided' } });
    expect(audit.notes).toBe(`decision=decline; username=${tolu.handle}; reason=${GOOD_REASON}`);

    // It now shows in the Declined view, read-only.
    await page.goto(`${URLS.admin}/username-reviews`);
    await page.getByLabel('Status').selectOption('declined');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(rowLink(page, tolu)).toHaveText('View');
    await page.context().close();
  });

  test('the person chose a new username: reinstate is refused in the dialog, the reason is kept, decline still works', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/username-reviews`);
    await rowLink(page, kemi).click();
    await page.getByRole('button', { name: 'Reinstate username' }).click();
    const dialog = page.getByRole('dialog', { name: 'Decide on this request' });
    await dialog.getByLabel('Reason (internal, required)').fill(GOOD_REASON);
    await dialog.getByRole('button', { name: 'Reinstate username' }).click();
    await expect(dialog.getByText('This request can’t be decided any more')).toBeVisible();
    await expect(dialog.getByText(`${kemi.name} has already chosen a new username, so @${kemi.handle} can’t be reinstated.`)).toBeVisible();
    await expect(dialog.getByLabel('Reason (internal, required)')).toHaveValue(GOOD_REASON);
    await shot(page, '07-dialog-new-username-chosen');
    expect(await db().usernameReviewRequest.findUnique({ where: { id: kemi.requestId } })).toMatchObject({ status: 'pending' });

    await dialog.getByRole('radio', { name: /Decline/ }).check();
    await dialog.getByRole('button', { name: 'Decline request' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Decision recorded')).toBeVisible();
    expect(await db().usernameReviewRequest.findUnique({ where: { id: kemi.requestId } })).toMatchObject({ status: 'declined' });
    await page.context().close();
  });

  test('another admin decides first: the dialog says so, and closing it shows the result', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/username-reviews`);
    await rowLink(page, lola).click();
    await page.getByRole('button', { name: 'Decline request' }).click();
    const dialog = page.getByRole('dialog', { name: 'Decide on this request' });
    await dialog.getByLabel('Reason (internal, required)').fill(GOOD_REASON);

    // Jide decides the same request through the API while the dialog is open.
    const res = await api('POST', `/admin/username-reviews/${lola.requestId}/decide`, {
      token: jide.token,
      body: { decision: 'decline', reason: 'Decided by the other admin first.' },
    });
    expect(res.status).toBe(200);

    await dialog.getByRole('button', { name: 'Decline request' }).click();
    await expect(dialog.getByText('This request was already decided')).toBeVisible();
    await expect(dialog.getByText('Another admin has decided it. Close this dialog to see the result.')).toBeVisible();
    await shot(page, '08-dialog-already-decided');

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    // The page re-read the request: it is decided and read-only now.
    await expect(page.getByRole('region', { name: 'Decision' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline request' })).toHaveCount(0);
    // The QA admin's own decision never happened.
    const audit = await db().adminActionLog.findMany({ where: { targetId: lola.userId, action: 'user.username_review_decided' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].adminId).toBe(jide.id);
    await page.context().close();
  });

  test('the revoking admin\'s own request is not in the list, and deciding it is refused by the server', async () => {
    // Absent from the QA admin's list (checked above). The server also refuses a decide by the revoker, which the
    // UI can only reach through a stale link, so it is proven here against the real API with the QA admin token.
    const res = await api('POST', `/admin/username-reviews/${own.requestId}/decide`, {
      token: await getAdminToken(),
      body: { decision: 'decline', reason: GOOD_REASON },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('username_review_own_revocation');
    expect(await db().usernameReviewRequest.findUnique({ where: { id: own.requestId } })).toMatchObject({ status: 'pending' });
  });
});
