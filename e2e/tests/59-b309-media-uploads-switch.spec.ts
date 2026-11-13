import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, verifiedAccount, type Verified } from '../support/helpers';
import { restartApi } from '../support/api-process';
import { WIDTH_CLEAR } from '../support/fake-media-services';
import { pngOfWidth } from '../support/media-fixtures';
import { URLS } from '../support/stack';

// B-309 (b): the upload switch (B-306, Decision Log #501) in real Chrome against the real API process, Postgres and Redis.
// MEDIA_UPLOADS_ENABLED=false (the harness starts the API through support/api-process.ts restartApi({ mediaUploads: false }),
// the same way specs 17 and 19 restart it) closes the four routes that create or finish an upload:
//   POST /media/uploads, POST /media/uploads/:id/confirm, POST /users/:id/avatar, POST /users/:id/cover
// with 403 { code: 'media_uploads_disabled' }, before any database write or storage call. Reading and deleting what exists,
// reporting media and every other route are not gated. The switch is read on every request.
//   web composer : apps/web MediaUploadTray / useMediaUploads (an unknown code -> the generic "Upload failed" card)
//   web profile  : apps/web ProfileImageControl (shows the server sentence)
// What the person SEES with the switch off is recorded in docs/qa-b309-playwright-specs-report.md; the assertions here only
// require that the screen ends in a readable state: no endless spinner, no raw JSON.
//
// This spec restarts the API twice (off, then on) and leaves it on the default (switch on) in afterAll, so it can sit anywhere
// in a run. The fake object store and the fake image check live in global-setup and are not restarted. It cannot list the
// store, so "no object created" rests on the other half of the rule: an object can only be created through an upload link,
// and a link needs the PostMedia row, which the test counts.
test.use({ viewport: { width: 1280, height: 1000 } });

const RUN = Date.now().toString(36);
const OFF = { statusCode: 403, code: 'media_uploads_disabled' };

async function createUpload(token: string, bytes: Buffer): Promise<{ status: number; body: any }> {
  return api('POST', '/media/uploads', { token, body: { contentType: 'image/png', size: bytes.length } });
}

/** A whole upload through the real routes: link, PUT to the (fake) store, confirm. Returns the media id. */
async function uploadWhileOn(token: string, width: number): Promise<string> {
  const bytes = pngOfWidth(width);
  const link = await createUpload(token, bytes);
  expect(link.status, JSON.stringify(link.body)).toBe(201);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(link.body.uploadHeaders as Record<string, string>)) if (k.toLowerCase() !== 'content-length') headers[k] = v;
  const put = await fetch(link.body.uploadUrl as string, { method: link.body.uploadMethod, headers, body: new Uint8Array(bytes) });
  expect(put.ok, `PUT ${put.status}`).toBe(true);
  const confirmed = await api('POST', `/media/uploads/${link.body.id}/confirm`, { token });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  return link.body.id as string;
}

async function avatarUpload(userId: string, token: string, kind: 'avatar' | 'cover'): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pngOfWidth(400))], { type: 'image/png' }), 'qa.png');
  const res = await fetch(`${URLS.api}/users/${userId}/${kind}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body };
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

test.describe.serial('MEDIA_UPLOADS_ENABLED=false closes the upload routes and nothing else', () => {
  let owner: Verified; // holds an approved upload made while the switch was on
  let viewer: Verified; // reports it while the switch is off
  let browserUser: Verified; // used in the browser phase
  let existingId = '';
  let rowsBefore = 0;

  test.afterAll(async () => {
    // Leave the harness API on the default (switch on) whatever happened above.
    await restartApi({});
  });

  test('setup (switch ON): a real upload is made and approved by the automatic check', async () => {
    test.setTimeout(300_000);
    await restartApi({ mediaUploads: true });
    owner = await verifiedAccount('b309mo');
    viewer = await verifiedAccount('b309mv');
    browserUser = await verifiedAccount('b309mb');
    existingId = await uploadWhileOn(owner.token, WIDTH_CLEAR);
    // The media sweep runs once a minute; a width of 64 px is the fake check's "clear" answer.
    await expect
      .poll(async () => (await db().postMedia.findUnique({ where: { id: existingId } }))?.status, { timeout: 150_000, intervals: [3_000] })
      .toBe('approved');
    rowsBefore = await db().postMedia.count({ where: { uploaderId: owner.userId } });
    expect(rowsBefore).toBe(1);
  });

  test('switch ON control: the same four routes work (link, confirm, avatar, cover)', async () => {
    const ok = await uploadWhileOn(browserUser.token, WIDTH_CLEAR); // link + PUT + confirm
    expect(await db().postMedia.findUnique({ where: { id: ok } })).not.toBeNull();
    const avatar = await avatarUpload(browserUser.userId, browserUser.token, 'avatar');
    expect([200, 201], JSON.stringify(avatar.body)).toContain(avatar.status);
    const cover = await avatarUpload(browserUser.userId, browserUser.token, 'cover');
    expect([200, 201], JSON.stringify(cover.body)).toContain(cover.status);
    // Put the rows back so the OFF phase starts from a clean state for this person.
    await db().user.update({ where: { id: browserUser.userId }, data: { avatarUrl: null, avatarKey: null, avatarStatus: null, avatarUploadedAt: null, coverUrl: null, coverKey: null, coverStatus: null, coverUploadedAt: null } });
    await db().postMedia.deleteMany({ where: { uploaderId: browserUser.userId } });
  });

  test('switch OFF: the four routes answer 403 media_uploads_disabled and write nothing', async () => {
    test.setTimeout(120_000);
    await restartApi({ mediaUploads: false });
    const before = await db().user.findUnique({ where: { id: owner.userId } });
    const rows = await db().postMedia.count({ where: { uploaderId: owner.userId } });

    const bytes = pngOfWidth(WIDTH_CLEAR);
    const link = await createUpload(owner.token, bytes);
    expect(link.status).toBe(403);
    expect(link.body).toEqual(expect.objectContaining(OFF));
    expect(link.body.uploadUrl).toBeUndefined();

    // Confirm of an upload the person already holds is refused too (nothing new is finished while off).
    const confirm = await api('POST', `/media/uploads/${existingId}/confirm`, { token: owner.token });
    expect(confirm.status).toBe(403);
    expect(confirm.body).toEqual(expect.objectContaining(OFF));

    const avatar = await avatarUpload(owner.userId, owner.token, 'avatar');
    expect(avatar.status).toBe(403);
    expect(avatar.body).toEqual(expect.objectContaining(OFF));
    const cover = await avatarUpload(owner.userId, owner.token, 'cover');
    expect(cover.status).toBe(403);
    expect(cover.body).toEqual(expect.objectContaining(OFF));

    // No PostMedia row (so no upload link and so no object could exist) and no change to the avatar/cover columns.
    expect(await db().postMedia.count({ where: { uploaderId: owner.userId } })).toBe(rows);
    expect(rows).toBe(rowsBefore);
    const after = await db().user.findUnique({ where: { id: owner.userId } });
    for (const col of ['avatarUrl', 'avatarKey', 'avatarStatus', 'avatarUploadedAt', 'coverUrl', 'coverKey', 'coverStatus', 'coverUploadedAt']) {
      expect(after[col], col).toEqual(before[col]);
    }
    // Anonymous callers still get the sign-in answer first, not the switch answer.
    const anon = await api('POST', '/media/uploads', { body: { contentType: 'image/png', size: bytes.length } });
    expect(anon.status).toBe(401);
  });

  test('switch OFF: reading and deleting an existing upload, and reporting media, still work', async () => {
    const got = await api('GET', `/media/uploads/${existingId}`, { token: owner.token });
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(existingId);
    expect(got.body.status).toBe('approved');

    // The report route: another person reports the approved file. An approved file is visible only through its post in
    // the product, but the route itself must not be gated by the switch; the answer is the report's own, never the switch's.
    const rep = await api('POST', `/media/${existingId}/report`, { token: viewer.token, body: { reason: `b309 ${RUN}` } });
    expect(rep.body?.code).not.toBe('media_uploads_disabled');
    expect([200, 201, 404], JSON.stringify(rep.body)).toContain(rep.status);

    // Delete: not gated. (Delete also frees the stored file; the row goes.)
    const del = await api('DELETE', `/media/uploads/${existingId}`, { token: owner.token });
    expect(del.status).toBe(204);
    expect(await db().postMedia.findUnique({ where: { id: existingId } })).toBeNull();
    // DELETE avatar and cover are not gated either (nothing to delete here: a clean 204 or a plain 404, never the switch's 403).
    for (const kind of ['avatar', 'cover']) {
      const r = await api('DELETE', `/users/${owner.userId}/${kind}`, { token: owner.token });
      expect(r.body?.code, `${kind} delete`).not.toBe('media_uploads_disabled');
    }
  });

  test('switch OFF, in the browser: the post composer ends in a readable state (no endless spinner, no raw JSON)', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, browserUser.email);
    await page.goto('/community');
    await page.getByLabel("What's happening?").fill(`b309 switch off ${RUN}`);
    await page.getByTestId('picture-input').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: pngOfWidth(WIDTH_CLEAR) });
    // B-306's report: the composer maps the unknown code to the generic card "Upload failed" /
    // "Check your connection and try again." with Try again and Remove (misleading wording, recorded in the QA report).
    await expect(page.getByText('Upload failed', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('media_uploads_disabled');
    await expect(page.locator('body')).not.toContainText('statusCode');
    const card = page.locator('.media-item').first();
    await expect(card).toBeVisible();
    // The page is not stuck: Remove clears the card, and the text post can still be sent.
    await card.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.media-item')).toHaveCount(0);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(`b309 switch off ${RUN}`).first()).toBeVisible();
    expect(await db().postMedia.count({ where: { uploaderId: browserUser.userId } })).toBe(0);
  });

  test('switch OFF, in the browser: choosing a profile picture shows the server sentence with Try again, no hang', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, browserUser.email);
    await page.goto('/profile?edit=1');
    const avatar = page.getByTestId('profile-image-avatar');
    await expect(avatar).toBeVisible();
    await page.getByTestId('profile-image-avatar-input').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: pngOfWidth(400) });
    await expect(avatar.getByRole('progressbar')).toHaveCount(0, { timeout: 30_000 });
    await expect(avatar.getByText('Uploads are not available right now.')).toBeVisible();
    await expect(avatar.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('media_uploads_disabled');
    await expect(page.locator('body')).not.toContainText('statusCode');
    const row = await db().user.findUnique({ where: { id: browserUser.userId } });
    expect(row.avatarKey).toBeNull();
    expect(row.avatarStatus).toBeNull();
  });

  test('switch back ON: everything works as before (link, confirm, avatar) and the browser composer takes a file again', async ({ page }) => {
    test.setTimeout(240_000);
    await restartApi({ mediaUploads: true });
    const id = await uploadWhileOn(browserUser.token, WIDTH_CLEAR);
    expect(await db().postMedia.findUnique({ where: { id } })).not.toBeNull();
    const avatar = await avatarUpload(browserUser.userId, browserUser.token, 'avatar');
    expect([200, 201], JSON.stringify(avatar.body)).toContain(avatar.status);

    await signIn(page, viewer.email);
    await page.goto('/community');
    await page.getByLabel("What's happening?").fill(`b309 switch on ${RUN}`);
    await page.getByTestId('picture-input').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: pngOfWidth(WIDTH_CLEAR) });
    await expect(page.getByText('Checking', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Upload failed', { exact: true })).toHaveCount(0);
  });
});
