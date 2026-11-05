import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { test, expect, type Page } from '@playwright/test';
import { api, db, getAdminToken, registerViaApi } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { pngOfWidth } from '../support/media-fixtures';
import { ADMIN_CREDENTIALS, FAKE_MEDIA, URLS } from '../support/stack';

// B-037 (Decision Log #468): profile pictures and cover photos in the admin Media review queue, in real Chrome
// against the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// How a profile picture gets into the queue here: the QA stack has the (fake) automatic check configured, so a
// picture is in the queue when its ProfileImageCheck row says the check left it undecided ('review'). The rows
// and the private object in the fake store are seeded directly, because the upload and the check are other work.
// The decisions themselves (approve, reject), the 409, the 404 and the retryable 503 are all the real API.
//
// The QA admin is a superadmin who is NOT child-safety vetted. A seeded minor therefore shows what an unvetted
// admin gets from the server: no row in the list and the plain "Item not found" on a direct visit.
test.use({ viewport: { width: 1440, height: 1184 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b037-admin-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const BUCKET = FAKE_MEDIA.bucket;

interface Seeded {
  userId: string;
  name: string;
  kind: 'avatar' | 'cover';
  key: string;
  file: string;
  id: string; // the queue item id: "<kind>:<userId>:<file>"
}

async function putObject(key: string, body: Buffer) {
  const res = await fetch(`${FAKE_MEDIA.storage}/${BUCKET}/${key}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body });
  if (!res.ok) throw new Error(`fake store PUT ${key} failed ${res.status}`);
}
async function deleteObject(key: string) {
  await fetch(`${FAKE_MEDIA.storage}/${BUCKET}/${key}`, { method: 'DELETE' });
}

/** An adult (or a minor) with one pending picture the automatic check left for a person. */
async function seed(
  label: string,
  kind: 'avatar' | 'cover',
  opts: { minutesAgo?: number | null; minor?: boolean; width?: number } = {},
): Promise<Seeded> {
  const name = `${label} ${RUN}`;
  const acct = await registerViaApi({ age: 30, label: `pi-${label}`, displayName: name });
  const file = `${randomUUID()}.png`;
  const key = `private-profile/${acct.userId}/${file}`;
  await putObject(key, pngOfWidth(opts.width ?? (kind === 'cover' ? 200 : 64)));
  const uploadedAt = opts.minutesAgo === null ? null : new Date(Date.now() - (opts.minutesAgo ?? 38) * 60_000);
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
  return { userId: acct.userId, name, kind, key, file, id: `${kind}:${acct.userId}:${file}` };
}

const itemUrl = (s: Seeded) => `${URLS.admin}/moderation/media/${encodeURIComponent(s.id)}`;

test.describe.serial('admin media review: profile pictures and cover photos', () => {
  let qaAdminId = '';
  let wasVetted = false;
  let ada: Seeded; // avatar, 38 min: approved in the UI
  let bola: Seeded; // cover, 2 h: rejected in the UI
  let chidi: Seeded; // avatar whose upload time is unknown
  let mina: Seeded; // a minor's avatar: never shown to an unvetted admin
  let dayo: Seeded; // avatar decided by someone else behind the page's back (409)
  let efe: Seeded; // avatar replaced after the page was opened (404)
  let gina: Seeded; // avatar whose publish fails once (503), then works

  test.beforeAll(async () => {
    const qa = await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } });
    qaAdminId = qa.id;
    wasVetted = !!qa.childSafetyVetted;
    if (wasVetted) await db().adminUser.update({ where: { id: qaAdminId }, data: { childSafetyVetted: false } });

    ada = await seed('adaprofile', 'avatar', { minutesAgo: 38 });
    bola = await seed('bolacover', 'cover', { minutesAgo: 120 });
    chidi = await seed('chidiold', 'avatar', { minutesAgo: null });
    mina = await seed('minaminor', 'avatar', { minor: true });
    dayo = await seed('dayoraced', 'avatar');
    efe = await seed('efereplaced', 'avatar');
    gina = await seed('ginaretry', 'avatar');
  });

  test.afterAll(async () => {
    if (wasVetted) await db().adminUser.update({ where: { id: qaAdminId }, data: { childSafetyVetted: true } });
    await db().$disconnect();
  });

  test('the queue lists profile pictures and cover photos, shows a dash for an unknown age, and leaves out a minor', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/media`);
    const table = page.getByRole('table', { name: 'Media review queue' });
    await expect(table).toBeVisible();

    const rowOf = (s: Seeded) => table.getByRole('row').filter({ hasText: `${s.name.split(' ')[0]}_${RUN}`.toLowerCase().slice(0, 28) });
    await expect(rowOf(ada)).toContainText('Profile picture');
    await expect(rowOf(ada)).toContainText('Automatic check');
    await expect(rowOf(ada)).toContainText('38 min');
    await expect(rowOf(bola)).toContainText('Cover photo');
    await expect(rowOf(bola)).toContainText('2 h');
    await expect(rowOf(chidi)).toContainText('Profile picture');
    await expect(rowOf(chidi).getByText('—')).toBeVisible();
    // The review link names the exact file and is URL-encoded.
    await expect(rowOf(ada).getByRole('link', { name: 'Review' })).toHaveAttribute('href', `/moderation/media/${encodeURIComponent(ada.id)}`);
    // An admin who is not child-safety vetted gets no row for a minor: the page shows what the server returned.
    await expect(table.getByText(`minaminor_${RUN}`)).toHaveCount(0);
    await expect(page.getByTestId('pending-count')).toContainText('pending');
    await shot(page, '01-queue-mixed');

    // Direct visit to the minor's item: the same plain "not found" as a missing item, no wording about vetting.
    await page.goto(itemUrl(mina));
    await expect(page.getByRole('heading', { name: 'Item not found' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/vetted|vetting|minor|child/i);
    await shot(page, '02-minor-item-not-found');
    await page.context().close();
  });

  test('a profile picture: the item screen, then Approve publishes it and shows Already decided', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/media`);
    await page.getByRole('table', { name: 'Media review queue' }).getByRole('row').filter({ hasText: 'adaprofile' }).getByRole('link', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Review profile picture' })).toBeVisible();
    const details = page.getByRole('region', { name: 'Details' });
    await expect(details.getByText(`adaprofile_${RUN}`.toLowerCase())).toBeVisible();
    await expect(details.getByText('Used in')).toBeVisible();
    await expect(details.getByText('Profile', { exact: true })).toBeVisible();
    await expect(page.getByText('The automatic check was unsure about this picture, or could not run. Look at the picture and decide.')).toBeVisible();
    await expect(page.getByText(/Suggestive|Violence|Nudity/)).toHaveCount(0);
    // The preview is the real stored file, shown through the signed link.
    const img = page.getByAltText('The profile picture under review');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await shot(page, '03-item-profile-picture');

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('You approved this profile picture just now. There is nothing more to do here.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await shot(page, '04-item-profile-picture-decided');

    const row = await db().user.findUnique({ where: { id: ada.userId } });
    expect(row.avatarStatus).toBe('approved');
    expect(row.avatarKey.startsWith('private-profile/')).toBe(false);
    const log = await db().adminActionLog.findFirst({
      where: { adminId: qaAdminId, action: 'media.approved', targetType: 'profile_image', targetId: ada.userId },
    });
    expect(log?.notes).toBe('avatar');
    await page.context().close();
  });

  test('a cover photo: the wide preview, the reject dialog with its empty-reason error, then Reject with a reason', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(itemUrl(bola));
    await expect(page.getByRole('heading', { name: 'Review cover photo' })).toBeVisible();
    await expect(page.getByTestId('media-viewer')).toBeVisible();
    await expect(page.getByAltText('The cover photo under review')).toBeVisible();
    await shot(page, '05-item-cover-photo');

    await page.getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Reject this cover photo?' })).toBeVisible();
    await expect(dialog.getByText('Say why this cover photo is being rejected. The uploader sees this reason.')).toBeVisible();
    const reason = dialog.getByLabel('Reason (required)');
    await expect(reason).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Reject cover photo' })).toBeDisabled();
    await reason.fill('   ');
    await reason.blur();
    await expect(dialog.getByText('Enter a reason to continue.')).toBeVisible();
    await shot(page, '06-reject-dialog-empty');
    await reason.fill('  This is not a cover photo of you.  ');
    await shot(page, '07-reject-dialog-entered');
    await dialog.getByRole('button', { name: 'Reject cover photo' }).click();
    await expect(page.getByText('You rejected this cover photo just now. There is nothing more to do here.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const row = await db().user.findUnique({ where: { id: bola.userId } });
    expect(row.coverStatus).toBe('rejected');
    expect(row.coverRejectionReason).toBe('This is not a cover photo of you.');
    const log = await db().adminActionLog.findFirst({
      where: { adminId: qaAdminId, action: 'media.rejected', targetType: 'profile_image', targetId: bola.userId },
    });
    expect(log?.notes).toBe('cover: This is not a cover photo of you.');
    // The person is told through the existing notification.
    const notice = await db().notification.findFirst({ where: { userId: bola.userId, type: 'profile_image_rejected' } });
    expect(notice).not.toBeNull();
    await page.context().close();
  });

  test('when someone else decided first, Approve ends in "Already decided" without claiming who', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(itemUrl(dayo));
    await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
    // Behind the page's back, another decision is made through the real API.
    const token = await getAdminToken();
    const other = await api('POST', `/admin/media-review/${encodeURIComponent(dayo.id)}/reject`, { token, body: { reason: 'Decided by someone else.' } });
    expect(other.status).toBe(200);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(
      page.getByText('Another moderator already decided this profile picture, or it is no longer waiting for review. There is nothing more to do here.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await shot(page, '08-item-already-decided-elsewhere');
    await page.context().close();
  });

  test('when the picture was replaced after the page opened, a decision ends in the plain "Item not found"', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(itemUrl(efe));
    await expect(page.getByAltText('The profile picture under review')).toBeVisible();
    const newFile = `${randomUUID()}.png`;
    const newKey = `private-profile/${efe.userId}/${newFile}`;
    await putObject(newKey, pngOfWidth(64));
    await db().user.update({ where: { id: efe.userId }, data: { avatarKey: newKey } });
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('heading', { name: 'Item not found' })).toBeVisible();
    await expect(page.getByText('It is not waiting for review. It may already have been decided, or replaced by a newer upload.')).toBeVisible();
    await page.context().close();
  });

  test('when publishing fails (503) the item stays waiting and a second Approve works', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(itemUrl(gina));
    await expect(page.getByAltText('The profile picture under review')).toBeVisible();
    // Take the stored file away so the publish (copy to the public prefix) fails, as a storage outage would.
    await deleteObject(gina.key);
    await page.getByRole('button', { name: 'Approve' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText("couldn't be published right now");
    await expect(alert).toContainText('please try again');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeEnabled();
    await shot(page, '09-item-publish-failed');
    expect((await db().user.findUnique({ where: { id: gina.userId } })).avatarStatus).toBe('pending');

    await putObject(gina.key, pngOfWidth(64));
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('You approved this profile picture just now. There is nothing more to do here.')).toBeVisible();
    expect((await db().user.findUnique({ where: { id: gina.userId } })).avatarStatus).toBe('approved');
    await page.context().close();
  });

  test('the audit log reads the decisions plainly, and the pending list no longer holds what was decided', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/activity`);
    const table = page.getByRole('table', { name: 'Audit log' });
    await expect(table).toBeVisible();
    const approved = table.getByRole('row').filter({ hasText: `User #${ada.userId.slice(0, 8)}` });
    await expect(approved.first()).toContainText('Profile picture approved');
    const rejected = table.getByRole('row').filter({ hasText: `User #${bola.userId.slice(0, 8)}` });
    await expect(rejected.first()).toContainText('Cover photo rejected');
    await expect(rejected.first()).toContainText('Reason: This is not a cover photo of you.');
    await shot(page, '10-audit-log-profile-rows');

    await page.goto(`${URLS.admin}/moderation/media`);
    const queue = page.getByRole('table', { name: 'Media review queue' });
    await expect(queue.getByText(`chidiold_${RUN}`)).toBeVisible();
    await expect(queue.getByText(`adaprofile_${RUN}`)).toHaveCount(0);
    await expect(queue.getByText(`bolacover_${RUN}`)).toHaveCount(0);
    await page.context().close();
  });
});
