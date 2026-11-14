import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, verifiedAccount, type Verified } from '../support/helpers';
import { restartApi } from '../support/api-process';
import { pngOfWidth } from '../support/media-fixtures';

// B-042 / B-117 (Figma pass Y, docs/figma-pass-y-report.md): the Bants "Create a topic" dialog replaces the inline
// create-room form; the room page shows the optional description under the title; the emoji picker inserts into the
// Description only; and the profile picture control shows "Uploads aren't available right now" (controls disabled, no
// Try again) when MEDIA_UPLOADS_ENABLED is off (B-306), the same state the composers already show.
//
// Real Chrome, real API, Postgres and Redis. The uploads-off test restarts the API (support/api-process.ts restartApi,
// the way spec 59 does) and puts it back on its default in afterAll, so this spec can sit anywhere in a full run.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b042-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);

async function signIn(page: Page, who: Verified): Promise<void> {
  await loginViaUi(page, who.email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

async function openDialog(page: Page) {
  await page.goto('/banter');
  await page.getByRole('button', { name: 'Create a room' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create a topic' })).toBeVisible();
  return dialog;
}

test.describe.serial('B-042: Bants create-a-topic dialog', () => {
  let author: Verified;

  test.beforeAll(async () => {
    author = await verifiedAccount('b042t');
  });

  test.afterAll(async () => {
    // Leave the harness API on the default (switch on) whatever happened below.
    await restartApi({});
  });

  test('title, description and an emoji: the new room opens with the description at the top', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, author);
    const dialog = await openDialog(page);

    const title = `Derby day ${RUN}`;
    await dialog.getByLabel('Title').fill(title);
    const description = dialog.getByLabel('Description (optional)');
    await description.fill('Who wins ');
    await dialog.getByRole('button', { name: 'Emoji' }).click();
    const picker = dialog.getByRole('group', { name: 'Emoji' });
    await expect(picker).toBeVisible();
    await shot(page, '63-dialog-picker-open-desktop');
    await picker.getByRole('button', { name: 'soccer ball' }).click();
    // Closes after one choice; the emoji sits at the caret and the counter follows.
    await expect(picker).toHaveCount(0);
    await expect(description).toHaveValue('Who wins ⚽');
    await expect(dialog.getByText('10 / 500')).toBeVisible();
    await description.pressSequentially('?');

    await dialog.getByRole('button', { name: 'Post' }).click();
    await page.waitForURL(/\/banter\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
    const shown = page.locator('.banter-room-page__description');
    await expect(shown).toHaveText('Who wins ⚽?');
    await shot(page, '63-room-with-description-desktop');

    const row = await db().banterRoom.findFirst({ where: { name: title } });
    expect(row.description).toBe('Who wins ⚽?');
  });

  test('title only: the room has no description and shows none', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, author);
    const dialog = await openDialog(page);
    const title = `Title only ${RUN}`;
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Post' }).click();
    await page.waitForURL(/\/banter\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
    await expect(page.locator('.banter-room-page__description')).toHaveCount(0);
    const row = await db().banterRoom.findFirst({ where: { name: title } });
    expect(row.description).toBeNull();
  });

  test('Post stays disabled until a title is entered; Escape closes and focus returns to the opener', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, author);
    const dialog = await openDialog(page);
    const post = dialog.getByRole('button', { name: 'Post' });
    await expect(post).toBeDisabled();
    await dialog.getByLabel('Title').fill('   ');
    await expect(post).toBeDisabled();
    await dialog.getByLabel('Title').fill('Ok title');
    await expect(post).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create a room' })).toBeFocused();
  });

  test('390 px: the dialog is a bottom sheet and the picker fits without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signIn(page, author);
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: 'Emoji' }).click();
    await expect(dialog.getByRole('group', { name: 'Emoji' })).toBeVisible();
    await shot(page, '63-dialog-picker-open-mobile');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('uploads switched off: the profile picture control says so, controls disabled, no Try again', async ({ page }) => {
    test.setTimeout(240_000);
    await restartApi({ mediaUploads: false });
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, author);
    await page.goto('/profile?edit=1');
    const avatar = page.getByTestId('profile-image-avatar');
    await expect(avatar).toBeVisible();
    await page.getByTestId('profile-image-avatar-input').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: pngOfWidth(400) });
    await expect(avatar.getByTestId('profile-image-avatar-uploads-off')).toHaveText('Uploads aren’t available right now.');
    await expect(avatar.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(avatar.locator('button:not([disabled])', { hasText: /Choose|Replace/ })).toHaveCount(0);
    await shot(page, '63-profile-uploads-off');
    const res = await api('GET', `/users/${author.userId}`, { token: author.token });
    expect(res.status).toBe(200);
    expect(res.body.avatar?.status ?? null).toBeNull();
  });
});
