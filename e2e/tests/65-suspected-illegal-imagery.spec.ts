import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { test, expect, type Page } from '@playwright/test';
import { adminPageAs, createQaAdmin, db, registerViaApi, COPY_TAG, type QaAdmin } from '../support/helpers';
import { pngOfWidth } from '../support/media-fixtures';
import { FAKE_MEDIA, URLS } from '../support/stack';

// B-206: the "Suspected illegal imagery" path in the admin console (backend PR #800), in real Chrome against the real
// API, Postgres and Redis. NO Figma frame exists for these screens; they reuse the Media review and Username reviews
// patterns. Scoped to this flow and nothing else:
//   1. a child-safety-vetted moderator sets a file aside from the item page (the reason is required);
//   2. the record shows in the list as not filed;
//   3. the moderator records a filing (body, reference, date) and the record shows filed;
//   4. a moderator who is NOT vetted does not get the action.
// The file is a pending post picture seeded straight into Postgres (the upload and the automatic check are other
// work). Everything the page does after that is the real API. Moderators are minted with createQaAdmin so the
// 5-per-15-minutes admin login limit is not spent.
test.use({ viewport: { width: 1440, height: 1184 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b206-admin-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const BUCKET = FAKE_MEDIA.privateBucket;

async function putObject(key: string, body: Buffer) {
  const res = await fetch(`${FAKE_MEDIA.storage}/${BUCKET}/${key}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`fake store PUT ${key} failed ${res.status}`);
}

/** An adult's picture the automatic check left for a person: pending, ready, in the review queue. */
async function seedPendingPicture(label: string): Promise<{ id: string; userId: string }> {
  const acct = await registerViaApi({ age: 30, label: `si-${label}`, displayName: `${label} ${RUN}` });
  const id = randomUUID();
  const privateKey = `private-media/${acct.userId}/${id}.png`;
  await putObject(privateKey, pngOfWidth(64));
  await db().postMedia.create({
    data: {
      id,
      uploaderId: acct.userId,
      kind: 'image',
      declaredContentType: 'image/png',
      declaredSize: 1024,
      uploadState: 'ready',
      status: 'pending',
      privateKey,
      publicKey: `post-media/${acct.userId}/${id}.png`,
      publicUrl: `https://example.test/post-media/${id}.png`,
      byteSize: 1024,
      contentType: 'image/png',
      confirmedAt: new Date(),
      reviewEnteredAt: new Date(),
      reviewEntrySource: 'auto_check',
    },
  });
  return { id, userId: acct.userId };
}

test.describe.serial('admin: suspected illegal imagery', () => {
  let vetted: QaAdmin;
  let unvetted: QaAdmin;
  let fileA: { id: string; userId: string }; // set aside and filed by the vetted moderator
  let fileB: { id: string; userId: string }; // opened by the non-vetted moderator
  let recordId = '';

  test.beforeAll(async () => {
    vetted = await createQaAdmin('moderator', `Vera Vetted ${RUN}`, { vetted: true });
    unvetted = await createQaAdmin('moderator', `Una Unvetted ${RUN}`);
    fileA = await seedPendingPicture('fileA');
    fileB = await seedPendingPicture('fileB');
  });

  test.afterAll(async () => {
    await db().$disconnect();
  });

  test('a vetted moderator sets a file aside from the item page: the reason is required', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/media/${fileA.id}`);
    await expect(page.getByRole('heading', { name: 'Review picture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
    await shot(page, '01-item-with-action');

    await page.getByRole('button', { name: 'Suspected illegal imagery' }).click();
    const dialog = page.getByRole('dialog', { name: /Set this picture aside as suspected illegal imagery/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('withdrawn from public view');
    await expect(dialog).toContainText('not deleted with the uploader’s account');
    await expect(dialog).not.toContainText(COPY_TAG);

    // Nothing is sent without a reason, and a too-short one is refused with its own message.
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog.getByText('Enter a reason to continue.')).toBeVisible();
    await dialog.getByLabel('Reason (required)').fill('too short');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog.getByText('Enter at least 10 characters.')).toBeVisible();
    expect(await db().suspectedIllegalMedia.count({ where: { mediaId: fileA.id } })).toBe(0);
    expect((await db().postMedia.findUnique({ where: { id: fileA.id } })).status).toBe('pending');
    await shot(page, '02-dialog-reason-required');

    await dialog.getByLabel('Reason (required)').fill('Seen in review; looks like it may depict a child.');
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    // The page now shows the record and its status; the file is rejected in the same step.
    const note = page.getByTestId('suspected-illegal-record');
    await expect(note).toContainText('Set aside as suspected illegal imagery');
    await expect(note).toContainText('Not filed');
    await expect(page.getByRole('button', { name: 'Suspected illegal imagery' })).toHaveCount(0);
    await shot(page, '03-item-after-set-aside');

    const rec = await db().suspectedIllegalMedia.findFirst({ where: { mediaId: fileA.id } });
    expect(rec.status).toBe('set_aside');
    recordId = rec.id;
    const media = await db().postMedia.findUnique({ where: { id: fileA.id } });
    expect(media.status).toBe('rejected');
    // The audit row carries no reason text.
    const audit = await db().adminActionLog.findMany({ where: { adminId: vetted.id, action: 'media.suspected_illegal_set_aside' } });
    expect(audit.length).toBe(1);
    expect(JSON.stringify(audit)).not.toContain('looks like it may depict');
    await page.context().close();
  });

  test('the record shows in the list as not filed', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/media`);
    await page.getByRole('link', { name: 'Suspected illegal imagery' }).click();
    await expect(page.getByRole('heading', { name: 'Suspected illegal imagery' }).first()).toBeVisible();
    const table = page.getByRole('table', { name: 'Suspected illegal imagery records' });
    await expect(table).toBeVisible();
    const rows = table.getByRole('row');
    // Header row plus the one record this run made (a clean QA database can hold others, so match on the open link).
    await expect(rows.filter({ hasText: 'Not filed' }).first()).toBeVisible();
    await expect(rows.filter({ hasText: 'Picture' }).first()).toBeVisible();
    await shot(page, '04-list-not-filed');
    await page.context().close();
  });

  test('the moderator records a filing with a body, reference and date, and the record shows filed', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/suspected-illegal/${recordId}`);
    await expect(page.getByRole('heading', { name: 'Record that this was filed' })).toBeVisible();
    // The page says the report is made outside Soccernity, and the suggested bodies are marked pending counsel.
    await expect(page.locator('body')).toContainText(/outside Soccernity/i);
    await expect(page.getByRole('region', { name: 'Suggested receiving bodies' })).toContainText(/pending counsel/i);
    await shot(page, '05-record-detail');

    const form = page.getByRole('form', { name: 'Record that this was filed' });
    // Required fields are checked before anything is sent.
    await form.getByRole('button', { name: 'Record that this was filed' }).click();
    await expect(form.getByText('Choose a receiving body.')).toBeVisible();
    await expect(form.getByText('Enter the reference you were given.')).toBeVisible();
    expect((await db().suspectedIllegalMedia.findUnique({ where: { id: recordId } })).status).toBe('set_aside');

    await form.getByLabel(/^Receiving body/).selectOption('iwf');
    await form.getByLabel(/^Reference you were given/).fill(`IWF-${RUN}-0042`);
    await form.getByLabel(/^Date and time it was filed/).fill('2026-11-15T09:30');
    await form.getByLabel(/^Note/).fill('Filed by phone with the duty officer.');
    await form.getByRole('button', { name: 'Record that this was filed' }).click();

    await expect(page.getByRole('region', { name: 'Decision' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Decision' })).toContainText(`IWF-${RUN}-0042`);
    await expect(page.locator('body')).toContainText('Filed');
    await expect(page.getByRole('form', { name: 'Record that this was filed' })).toHaveCount(0);
    await shot(page, '06-record-filed');

    const rec = await db().suspectedIllegalMedia.findUnique({ where: { id: recordId } });
    expect(rec.status).toBe('filed');
    expect(rec.bodyKey).toBe('iwf');
    expect(rec.reference).toBe(`IWF-${RUN}-0042`);
    expect(new Date(rec.filedAt).toISOString().startsWith('2026-11-15')).toBe(true);

    // It is now decided: the list shows it as Filed.
    await page.goto(`${URLS.admin}/moderation/suspected-illegal`);
    const table = page.getByRole('table', { name: 'Suspected illegal imagery records' });
    await expect(table.getByRole('row').filter({ hasText: 'Filed' }).first()).toBeVisible();
    await page.context().close();
  });

  test('a moderator who is not child-safety vetted does not get the action', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/media/${fileB.id}`);
    await expect(page.getByRole('heading', { name: 'Review picture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspected illegal imagery' })).toHaveCount(0);
    // The queue does not link to the list either.
    await page.goto(`${URLS.admin}/moderation/media`);
    await expect(page.getByRole('table', { name: 'Media review queue' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Suspected illegal imagery' })).toHaveCount(0);
    await shot(page, '07-not-vetted-no-action');

    // The server agrees: the route itself is refused with the coded 403 and nothing is created.
    const res = await fetch(`${URLS.api}/admin/media-review/${fileB.id}/suspected-illegal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${unvetted.token}` },
      body: JSON.stringify({ reason: 'Trying without being vetted.' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('child_safety_vetting_required');
    expect(await db().suspectedIllegalMedia.count({ where: { mediaId: fileB.id } })).toBe(0);
    expect((await db().postMedia.findUnique({ where: { id: fileB.id } })).status).toBe('pending');
    await page.context().close();
  });
});
