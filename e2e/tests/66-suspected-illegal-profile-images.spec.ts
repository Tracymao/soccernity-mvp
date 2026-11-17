import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { test, expect, type Page } from '@playwright/test';
import { adminPageAs, createQaAdmin, db, registerViaApi, COPY_TAG, type QaAdmin } from '../support/helpers';
import { pngOfWidth } from '../support/media-fixtures';
import { FAKE_MEDIA, URLS } from '../support/stack';

// B-206 (backend PR #806, admin PR #803 + this one): the "Suspected illegal imagery" action on a PROFILE PICTURE or
// COVER PHOTO item of the media review queue, in real Chrome against the real API, Postgres and Redis. A new spec
// (66) rather than an extension of 65, because it needs its own seeded users and pending profile pictures.
// Scope: set aside a profile picture and a cover end to end, the record in the list with the right label, and what
// a moderator who is NOT child-safety vetted gets. No Figma frame exists for these screens.
// Pictures are seeded the way spec 34 does it (pending, ProfileImageCheck row at 'review', private object in the fake
// store); everything the page does after that is the real API. Moderators are minted with createQaAdmin so the
// 5-per-15-minutes admin login limit is not spent.
test.use({ viewport: { width: 1440, height: 1184 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b206-profile-admin-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const BUCKET = FAKE_MEDIA.privateBucket;

interface Seeded {
  userId: string;
  kind: 'avatar' | 'cover';
  key: string;
  id: string; // the queue item id: "<kind>:<userId>:<file>"
}

async function putObject(key: string, body: Buffer) {
  const res = await fetch(`${FAKE_MEDIA.storage}/${BUCKET}/${key}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`fake store PUT ${key} failed ${res.status}`);
}
async function objectExists(key: string): Promise<boolean> {
  const res = await fetch(`${FAKE_MEDIA.storage}/${BUCKET}/${key}`, { method: 'GET' });
  return res.ok;
}

async function seed(label: string, kind: 'avatar' | 'cover', opts: { minor?: boolean } = {}): Promise<Seeded> {
  const acct = await registerViaApi({ age: 30, label: `si-${label}`, displayName: `${label} ${RUN}` });
  const file = `${randomUUID()}.png`;
  const key = `private-profile/${acct.userId}/${file}`;
  await putObject(key, pngOfWidth(kind === 'cover' ? 200 : 64));
  const uploadedAt = new Date(Date.now() - 30 * 60_000);
  await db().user.update({
    where: { id: acct.userId },
    data: {
      username: `${label}_${RUN}`.toLowerCase().slice(0, 28),
      ...(opts.minor ? { isMinor: true } : {}),
      ...(kind === 'avatar'
        ? { avatarKey: key, avatarUrl: `https://example.test/${file}`, avatarStatus: 'pending', avatarUploadedAt: uploadedAt }
        : { coverKey: key, coverUrl: `https://example.test/${file}`, coverStatus: 'pending', coverUploadedAt: uploadedAt }),
    },
  });
  await db().profileImageCheck.create({ data: { userId: acct.userId, kind, objectKey: key, state: 'review', attempts: 1 } });
  return { userId: acct.userId, kind, key, id: `${kind}:${acct.userId}:${file}` };
}

const itemUrl = (s: Seeded) => `${URLS.admin}/moderation/media/${encodeURIComponent(s.id)}`;
const REASON = 'Seen in review; looks like it may depict a child.';

test.describe.serial('admin: suspected illegal imagery on profile pictures and covers', () => {
  let vetted: QaAdmin;
  let unvetted: QaAdmin;
  let avatar: Seeded; // set aside by the vetted moderator
  let cover: Seeded; // set aside by the vetted moderator
  let adultFile: Seeded; // an adult's picture opened by the non-vetted moderator
  let minorFile: Seeded; // a minor's picture opened by the non-vetted moderator

  test.beforeAll(async () => {
    vetted = await createQaAdmin('moderator', `Vera Vetted ${RUN}`, { vetted: true });
    unvetted = await createQaAdmin('moderator', `Una Unvetted ${RUN}`);
    avatar = await seed('pavatar', 'avatar');
    cover = await seed('pcover', 'cover');
    adultFile = await seed('padult', 'avatar');
    minorFile = await seed('pminor', 'avatar', { minor: true });
  });

  test.afterAll(async () => {
    await db().$disconnect();
  });

  test('a vetted moderator sets a profile picture aside from the item page: reason required, record shown, nothing re-read', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(itemUrl(avatar));
    await expect(page.getByRole('heading', { name: 'Review profile picture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
    await shot(page, '01-avatar-item-with-action');

    await page.getByRole('button', { name: 'Suspected illegal imagery' }).click();
    const dialog = page.getByRole('dialog', { name: /Set this profile picture aside as suspected illegal imagery/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('withdrawn from public view');
    await expect(dialog).toContainText(COPY_TAG);

    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog.getByText('Enter a reason to continue.')).toBeVisible();
    await dialog.getByLabel('Reason (required)').fill('too short');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog.getByText('Enter at least 10 characters.')).toBeVisible();
    expect(await db().suspectedIllegalMedia.count({ where: { mediaId: avatar.id } })).toBe(0);
    expect((await db().user.findUnique({ where: { id: avatar.userId } })).avatarStatus).toBe('pending');
    await shot(page, '02-avatar-dialog-reason-required');

    await dialog.getByLabel('Reason (required)').fill(REASON);
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    // The picture left the queue in the same step, so the page shows the outcome and the record without re-reading it.
    const note = page.getByTestId('suspected-illegal-record');
    await expect(note).toContainText('Set aside as suspected illegal imagery');
    await expect(note).toContainText('Not filed');
    await expect(page.getByTestId('profile-decided')).toContainText('set this profile picture aside');
    await expect(page.getByRole('button', { name: 'Suspected illegal imagery' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await shot(page, '03-avatar-after-set-aside');

    const rec = await db().suspectedIllegalMedia.findFirst({ where: { mediaId: avatar.id } });
    expect(rec.status).toBe('set_aside');
    expect(rec.kind).toBe('profile_avatar');
    expect(rec.uploaderId).toBe(avatar.userId);
    const user = await db().user.findUnique({ where: { id: avatar.userId } });
    expect(user.avatarStatus).toBe('rejected');
    // The file is kept, privately (evidence), not deleted.
    expect(await objectExists(avatar.key)).toBe(true);
    // The audit row carries no reason text.
    const audit = await db().adminActionLog.findMany({ where: { adminId: vetted.id, action: 'media.suspected_illegal_set_aside', targetId: avatar.userId } });
    expect(audit.length).toBe(1);
    expect(JSON.stringify(audit)).not.toContain('looks like it may depict');

    // The record link opens the detail page, which names the kind.
    await page.getByRole('link', { name: 'Open the record' }).click();
    await expect(page.getByRole('heading', { name: 'Record that this was filed' })).toBeVisible();
    await expect(page.locator('body')).toContainText('Profile picture');
    await page.context().close();
  });

  test('a vetted moderator sets a cover photo aside', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(itemUrl(cover));
    await expect(page.getByRole('heading', { name: 'Review cover photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Suspected illegal imagery' }).click();
    const dialog = page.getByRole('dialog', { name: /Set this cover photo aside as suspected illegal imagery/ });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Reason (required)').fill(REASON);
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    const note = page.getByTestId('suspected-illegal-record');
    await expect(note).toContainText('Not filed');
    await expect(page.getByTestId('profile-decided')).toContainText('set this cover photo aside');
    await shot(page, '04-cover-after-set-aside');

    const rec = await db().suspectedIllegalMedia.findFirst({ where: { mediaId: cover.id } });
    expect(rec.status).toBe('set_aside');
    expect(rec.kind).toBe('profile_cover');
    expect((await db().user.findUnique({ where: { id: cover.userId } })).coverStatus).toBe('rejected');
    expect(await objectExists(cover.key)).toBe(true);
    await page.context().close();
  });

  test('the list shows both records as not filed with the right labels', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/suspected-illegal`);
    const table = page.getByRole('table', { name: 'Suspected illegal imagery records' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Profile picture' }).filter({ hasText: 'Not filed' }).first()).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Cover photo' }).filter({ hasText: 'Not filed' }).first()).toBeVisible();
    await shot(page, '05-list-profile-kinds');
    await page.context().close();
  });

  test('a set-aside item stays readable but read-only, and a second set-aside is refused with no second record', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(itemUrl(avatar));
    // The server keeps the page readable after a set-aside (status rejected, with the record): nothing more to do.
    await expect(page.getByRole('heading', { name: 'Review profile picture' })).toBeVisible();
    await expect(page.getByTestId('suspected-illegal-record')).toContainText('Not filed');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Suspected illegal imagery' })).toHaveCount(0);
    await shot(page, '05b-avatar-reopened-read-only');
    // The server agrees: a second set-aside of the same file is refused and no second record is made.
    const res = await fetch(`${URLS.api}/admin/media-review/${encodeURIComponent(avatar.id)}/suspected-illegal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${vetted.token}` },
      body: JSON.stringify({ reason: REASON }),
    });
    expect([404, 409]).toContain(res.status);
    expect(await db().suspectedIllegalMedia.count({ where: { mediaId: avatar.id } })).toBe(1);
    await page.context().close();
  });

  test('a moderator who is not child-safety vetted: no action on an adult item, the coded 403, and a minor item is not found', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(itemUrl(adultFile));
    await expect(page.getByRole('heading', { name: 'Review profile picture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspected illegal imagery' })).toHaveCount(0);
    await shot(page, '06-not-vetted-no-action');

    const res = await fetch(`${URLS.api}/admin/media-review/${encodeURIComponent(adultFile.id)}/suspected-illegal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${unvetted.token}` },
      body: JSON.stringify({ reason: 'Trying without being vetted.' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('child_safety_vetting_required');
    expect(await db().suspectedIllegalMedia.count({ where: { mediaId: adultFile.id } })).toBe(0);
    expect((await db().user.findUnique({ where: { id: adultFile.userId } })).avatarStatus).toBe('pending');

    // A minor's picture is the plain "not found" for this admin, with no wording about vetting.
    await page.goto(itemUrl(minorFile));
    await expect(page.getByRole('heading', { name: 'Item not found' })).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText(/vetted|vetting/i); // scoped: the sidebar shows this admin's own name
    const res2 = await fetch(`${URLS.api}/admin/media-review/${encodeURIComponent(minorFile.id)}/suspected-illegal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${unvetted.token}` },
      body: JSON.stringify({ reason: 'Trying without being vetted.' }),
    });
    expect(res2.status).toBe(404);
    expect(await db().suspectedIllegalMedia.count({ where: { mediaId: minorFile.id } })).toBe(0);
    await page.context().close();
  });
});
