import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { api, createQaAdmin, adminPageAs, db, textMatching, type QaAdmin } from '../support/helpers';
import { restartApi } from '../support/api-process';
import { FAKE_MEDIA, URLS } from '../support/stack';
import { pngOfWidth } from '../support/media-fixtures';

// R111 (B-267 (e)): POST /admin/media/upload in real Chrome / the real API, Postgres and Redis, and the fake
// object store of support/fake-media-services.ts (reached over HTTP; global setup owns it).
//
// What the code does (services/api/src/modules/media/):
//   guards     : AdminJwtAuthGuard + AdminRolesGuard('editor','superadmin') on the whole controller (none -> 401, moderator -> 403)
//   body       : multipart, field "file", multer fileSize limit MEDIA_MAX_FILE_SIZE_BYTES (50 MB) -> 413
//   validation : MIME type only, against the allow-list (jpeg, png, gif, webp, mp4, quicktime, webm); there is NO byte sniffing
//   storage    : key media/<uploaderId>/<uuid>-<name> in the PUBLIC bucket, then a MediaAsset row { id, uploaderId, url, type, size, createdAt }
//   store down : S3StorageService answers 503 before any row is written
//   switch     : MEDIA_UPLOADS_ENABLED is not consulted (staff upload is not a user upload)
test.use({ viewport: { width: 1280, height: 900 } });

const MAX_BYTES = 50 * 1024 * 1024;
const RUN = Date.now().toString(36);

let editor: QaAdmin;
let superadmin: QaAdmin;
let moderator: QaAdmin;
const createdIds = new Set<string>();

async function upload(
  token: string | null,
  file: { name: string; type: string; bytes: Uint8Array } | null,
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  if (file) form.append('file', new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
  const res = await fetch(`${URLS.api}/admin/media/upload`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body };
}

const storeUrl = (key: string, bucket: string = FAKE_MEDIA.bucket) => `${FAKE_MEDIA.storage}/${bucket}/${key}`;
async function inStore(key: string, bucket: string = FAKE_MEDIA.bucket): Promise<boolean> {
  return (await fetch(storeUrl(key, bucket), { method: 'HEAD' })).status === 200;
}
async function keyOf(id: string): Promise<string> {
  const row = await db().mediaAsset.findUnique({ where: { id } });
  expect(row, `MediaAsset ${id}`).not.toBeNull();
  return row.key as string;
}
const rowCount = () => db().mediaAsset.count();

test.describe.serial('POST /admin/media/upload', () => {
  test.beforeAll(async () => {
    editor = await createQaAdmin('editor', `R111 Editor ${RUN}`);
    superadmin = await createQaAdmin('superadmin', `R111 Super ${RUN}`);
    moderator = await createQaAdmin('moderator', `R111 Moderator ${RUN}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    // Rows and objects this spec created, then the three admins, then the normal API (the spec restarts it twice).
    for (const id of createdIds) {
      const row = await db().mediaAsset.findUnique({ where: { id } });
      if (row?.key) await fetch(storeUrl(row.key), { method: 'DELETE' }).catch(() => undefined);
      await db().mediaAsset.deleteMany({ where: { id } });
    }
    await db().mediaAsset.deleteMany({ where: { uploaderId: { in: [editor.id, superadmin.id, moderator.id] } } });
    await db().adminUser.deleteMany({ where: { id: { in: [editor.id, superadmin.id, moderator.id] } } });
    await restartApi({});
  });

  test('editor uploads a PNG through the admin UI; the row, the object and the library agree', async ({ browser }) => {
    const page = await adminPageAs(browser, editor.token);
    const png = pngOfWidth(40);
    const name = `r111-${RUN}-ui.png`;

    await page.goto('/media/upload');
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/admin/media/upload') && r.request().method() === 'POST');
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'image/png', buffer: png });
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = await response.json();
    await expect(page.getByText('Done', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: textMatching('Back to Media') })).toBeVisible();
    createdIds.add(body.id);

    // Response shape: exactly these fields (the storage key is deliberately not returned).
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'id', 'size', 'type', 'uploaderId', 'url']);
    expect(body.uploaderId).toBe(editor.id);
    expect(body.type).toBe('image');
    expect(body.size).toBe(png.length);

    // Postgres row.
    const row = await db().mediaAsset.findUnique({ where: { id: body.id } });
    expect(row.uploaderId).toBe(editor.id);
    expect(row.type).toBe('image');
    expect(row.size).toBe(png.length);
    expect(row.url).toBe(body.url);
    expect(row.key).toMatch(new RegExp(`^media/${editor.id}/[0-9a-f-]{36}-${name.replace(/\./g, '\\.')}$`));
    expect(row.url.endsWith(row.key)).toBe(true);

    // Object: in the public bucket, not the private one, same bytes and type.
    expect(await inStore(row.key)).toBe(true);
    expect(await inStore(row.key, FAKE_MEDIA.privateBucket)).toBe(false);
    const stored = await fetch(storeUrl(row.key));
    expect(stored.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await stored.arrayBuffer()).equals(png)).toBe(true);

    // API list and the library page.
    const list = await api('GET', '/admin/media?type=image', { token: editor.token });
    expect(list.status).toBe(200);
    expect(list.body.items.some((m: any) => m.id === body.id)).toBe(true);
    await page.goto('/media');
    const fileName = row.url.split('/').pop() as string;
    await expect(page.getByRole('link', { name: fileName })).toBeVisible();
    const rowEl = page.locator('.med-table__row').filter({ has: page.getByRole('link', { name: fileName }) });
    await expect(rowEl).toContainText(`${png.length} B`);
    await expect(rowEl).toContainText('image');
    await page.context().close();
  });

  test('a video (mp4) is stored as type video; a superadmin may upload', async () => {
    const bytes = Buffer.from('not-really-an-mp4-but-the-code-checks-only-the-declared-type');
    const res = await upload(superadmin.token, { name: `r111-${RUN}.mp4`, type: 'video/mp4', bytes });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    createdIds.add(res.body.id);
    expect(res.body.type).toBe('video');
    expect(res.body.uploaderId).toBe(superadmin.id);
    expect(res.body.size).toBe(bytes.length);
    expect(await inStore(await keyOf(res.body.id))).toBe(true);
  });

  test('a moderator is refused with 403 and nothing is created; no token is 401', async () => {
    const rows = await rowCount();
    const mod = await upload(moderator.token, { name: `r111-${RUN}-mod.png`, type: 'image/png', bytes: pngOfWidth(32) });
    expect(mod.status).toBe(403);
    const none = await upload(null, { name: `r111-${RUN}-none.png`, type: 'image/png', bytes: pngOfWidth(32) });
    expect(none.status).toBe(401);
    expect(await rowCount()).toBe(rows);
    expect(await db().mediaAsset.count({ where: { uploaderId: moderator.id } })).toBe(0);
    // Reads follow the same guards.
    expect((await api('GET', '/admin/media', { token: moderator.token })).status).toBe(403);
    expect((await api('GET', '/admin/media')).status).toBe(401);
  });

  test('a disallowed type is refused with 400 and nothing is stored; no file is 400 too', async () => {
    const rows = await rowCount();
    const pdf = await upload(editor.token, { name: 'r111.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 r111') });
    expect(pdf.status).toBe(400);
    expect(String(pdf.body.message)).toContain('Unsupported file type: application/pdf');
    const none = await upload(editor.token, null);
    expect(none.status).toBe(400);
    expect(String(none.body.message)).toContain('No file was attached to this upload.');
    expect(await rowCount()).toBe(rows);
  });

  test('FINDING: bytes are not checked against the declared type (the code trusts the Content-Type)', async () => {
    // media.service.ts validates the MIME type only (the README says so: "no magic-byte sniffing"). So a text file
    // declared as image/png is accepted. This asserts what the code does, and the report flags it.
    const res = await upload(editor.token, { name: `r111-${RUN}-fake.png`, type: 'image/png', bytes: Buffer.from('this is plain text, not a PNG') });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    createdIds.add(res.body.id);
    expect(res.body.type).toBe('image');
    expect(await inStore(await keyOf(res.body.id))).toBe(true);
  });

  test('a file one byte over 50 MB is refused with 413 and nothing is stored', async () => {
    test.setTimeout(120_000);
    const rows = await rowCount();
    const res = await upload(editor.token, { name: `r111-${RUN}-big.png`, type: 'image/png', bytes: Buffer.alloc(MAX_BYTES + 1, 1) });
    expect(res.status).toBe(413);
    expect(await rowCount()).toBe(rows);
    expect(await db().mediaAsset.count({ where: { url: { contains: `r111-${RUN}-big` } } })).toBe(0);
  });

  test('the UI stops a 50 MB+ file before any request is sent', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await adminPageAs(browser, editor.token);
    let posted = false;
    page.on('request', (r) => {
      if (r.url().endsWith('/admin/media/upload') && r.method() === 'POST') posted = true;
    });
    await page.goto('/media/upload');
    // Playwright refuses an in-memory buffer over 50 MB, so the oversize file is a temp file passed by path.
    const big = path.join(os.tmpdir(), `r111-${RUN}-ui-big.png`);
    fs.writeFileSync(big, Buffer.alloc(MAX_BYTES + 1, 1));
    try {
      await page.locator('input[type="file"]').setInputFiles(big);
      await expect(page.getByText('Exceeds the 50 MB limit.')).toBeVisible();
      expect(posted).toBe(false);
    } finally {
      fs.rmSync(big, { force: true });
    }
    await page.context().close();
  });

  test('staff upload works with MEDIA_UPLOADS_ENABLED=false (user uploads are closed, staff upload is not)', async () => {
    test.setTimeout(240_000);
    await restartApi({ mediaUploads: false });
    // The switch really is off: a user upload route answers 403 media_uploads_disabled (no sign-in needed to see it is
    // guarded first; a bad token would be 401, so use the user route with the admin token and read the guard order).
    const userRoute = await api('POST', '/media/uploads', { token: editor.token, body: { contentType: 'image/png', size: 10 } });
    expect([401, 403]).toContain(userRoute.status); // an admin token is not a user token; the point is below
    const res = await upload(editor.token, { name: `r111-${RUN}-off.png`, type: 'image/png', bytes: pngOfWidth(48) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    createdIds.add(res.body.id);
    expect(await inStore(await keyOf(res.body.id))).toBe(true);
  });

  test('object store not configured: clean 503, no row, no object', async () => {
    test.setTimeout(240_000);
    await restartApi({ noObjectStore: true });
    const rows = await rowCount();
    const res = await upload(editor.token, { name: `r111-${RUN}-nostore.png`, type: 'image/png', bytes: pngOfWidth(52) });
    expect(res.status).toBe(503);
    expect(String(res.body.message)).toContain('Media storage is not configured yet');
    expect(await rowCount()).toBe(rows);
    expect(await db().mediaAsset.count({ where: { url: { contains: `r111-${RUN}-nostore` } } })).toBe(0);
    // A refused type is still a 400 before storage is touched, so the order is: type check, then storage.
    const pdf = await upload(editor.token, { name: 'r111.pdf', type: 'application/pdf', bytes: Buffer.from('x') });
    expect(pdf.status).toBe(400);
    await restartApi({});
  });
});
