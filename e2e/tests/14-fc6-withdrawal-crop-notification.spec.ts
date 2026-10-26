import { test, expect, type Page } from '@playwright/test';
import {
  api,
  db,
  linkPath,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  userByEmail,
  userLogin,
  verifyEmailViaApi,
  waitForEmail,
  guardianConfirmViaApi,
  type Account,
} from '../support/helpers';

// FC6 (build register B-080 / B-112, B-210 / B-227, B-217, #414): the guardian withdrawal page, the
// interactive cover crop, the rejection reason, and the image-decision notification row -- all in a
// real browser against the real API, Postgres and Redis.

async function verifiedAdultWithUsername(label: string): Promise<Account & { token: string }> {
  const a = await registerViaApi({ age: 30, label, displayName: 'Quinn Player' });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const res = await api('PATCH', `/users/${a.userId}`, { token, body: { username: uniqueUsername(label) } });
  expect(res.status).toBe(200);
  return { ...a, token };
}

/** Signs in through the UI and waits until the login has finished (the app has left /login). */
async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

/** Builds a real PNG of the given size in the browser and puts it in a file input. */
async function chooseGeneratedImage(page: Page, testId: string, width: number, height: number): Promise<void> {
  await page.evaluate(
    async ({ testId, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#7BB929');
      gradient.addColorStop(1, '#282E65');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      const file = new File([blob], 'generated.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { testId, width, height },
  );
}

/**
 * Records what the page actually uploads as the cover: Playwright cannot read a Blob request body, so the
 * page's own fetch is wrapped (before the app loads) and the uploaded file is decoded in the browser.
 */
async function recordCoverUploads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (init?.body instanceof FormData && /\/users\/[^/]+\/cover$/.test(url)) {
        const file = init.body.get('file');
        if (file instanceof Blob) {
          const bitmap = await createImageBitmap(file);
          (window as unknown as { __coverUpload: unknown }).__coverUpload = {
            width: bitmap.width,
            height: bitmap.height,
            type: file.type,
          };
        }
      }
      return original(input, init);
    };
  });
}

test.describe.serial('guardian withdrawal page (B-080 / B-112)', () => {
  test('request -> emailed link opens Confirm PRE-FILLED -> withdraw closes the account; the spent link is then refused', async ({
    page,
  }) => {
    const minor = await registerViaApi({ age: 15, label: 'wd1' });
    await verifyEmailViaApi(minor);
    await guardianConfirmViaApi(minor);

    // Frame 1 -> 2: the request step takes the MINOR's email; the answer never says whether it matched.
    await page.goto('/guardian-consent/withdraw');
    await expect(page.getByRole('heading', { name: 'Withdraw your consent' })).toBeVisible();
    await page.getByLabel('Email address of the Soccernity account').fill(minor.email);
    await page.getByRole('button', { name: 'Send withdrawal link' }).click();
    await expect(page.getByRole('heading', { name: 'Check the guardian’s inbox' })).toBeVisible();

    // The email goes to the GUARDIAN and carries the token as ?token=.
    const mail = await waitForEmail(minor.guardianEmail!, 'guardian-consent-withdrawal-request');
    const link = linkPath(mail.data.link);
    expect(link).toMatch(/^\/guardian-consent\/withdraw\?token=/);

    // Frame 3, pre-filled from the link. Opening it withdraws nothing.
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Confirm withdrawing consent' })).toBeVisible();
    await expect(page.getByLabel('Withdrawal code')).toHaveValue(mail.data.withdrawalToken);
    expect((await userByEmail(minor.email)).accountStatus).toBe('active');

    // Frame 4.
    await page.getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(page.getByRole('heading', { name: 'Consent withdrawn' })).toBeVisible();
    await expect(page.getByText('We have emailed the account holder to tell them.')).toBeVisible();
    expect((await userByEmail(minor.email)).accountStatus).toBe('pending_deletion');
    expect((await userLogin(minor.email)).status).toBe(401);

    // Frame 5: the same link again is single-use.
    await page.goto(link);
    await page.getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(page.getByRole('heading', { name: 'This withdrawal link can’t be used' })).toBeVisible();
    await page.getByRole('button', { name: 'Request a new link' }).click();
    await expect(page.getByRole('heading', { name: 'Withdraw your consent' })).toBeVisible();
    await expect(page).toHaveURL(/\/guardian-consent\/withdraw$/);
  });

  test('an address that matches nothing gets the SAME answer (no enumeration)', async ({ page }) => {
    await page.goto('/guardian-consent/withdraw');
    await page.getByLabel('Email address of the Soccernity account').fill('nobody.at.all@qa.soccernity.test');
    await page.getByRole('button', { name: 'Send withdrawal link' }).click();
    await expect(page.getByRole('heading', { name: 'Check the guardian’s inbox' })).toBeVisible();
    await expect(page.getByText(/If that account has confirmed guardian consent/)).toBeVisible();
  });

  test('an unknown code shows the link-invalid frame and changes nothing', async ({ page }) => {
    await page.goto('/guardian-consent/withdraw?token=00000000-0000-4000-8000-000000000000');
    await page.getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(page.getByRole('heading', { name: 'This withdrawal link can’t be used' })).toBeVisible();
  });

  test('the throttle shows "Too many attempts"; Try again returns to frame 1 (runs last: it spends the budget)', async ({
    page,
  }) => {
    // 5 attempts per 15 minutes per IP per route: spend what is left through the API, then use the UI.
    for (let i = 0; i < 8; i += 1) {
      const res = await api('POST', '/auth/guardian-consent/withdraw/request', { body: { email: 'burn@qa.soccernity.test' } });
      if (res.status === 429) break;
    }
    await page.goto('/guardian-consent/withdraw');
    await page.getByLabel('Email address of the Soccernity account').fill('someone@qa.soccernity.test');
    await page.getByRole('button', { name: 'Send withdrawal link' }).click();
    await expect(page.getByRole('heading', { name: 'Too many attempts' })).toBeVisible();
    await expect(page.getByText('Nothing has been changed.')).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Withdraw your consent' })).toBeVisible();
  });
});

test.describe('cover photo crop (B-210 / B-227)', () => {
  test('choose -> crop at 796:192 with zoom 1x to 3x -> only the CROPPED image is uploaded', async ({ page }) => {
    const a = await verifiedAdultWithUsername('crop1');
    await recordCoverUploads(page);
    await signIn(page, a.email);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit Profile' }).click();

    await chooseGeneratedImage(page, 'profile-image-cover-input', 1600, 1200);
    const dialog = page.getByRole('dialog', { name: 'Crop your cover photo' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('cover-crop-zoom-value')).toHaveText('1.0x');
    // K10 / FC7: "1x" and "3x" sit under the ends of the track.
    await expect(dialog.locator('.cover-crop__zoom-ends')).toHaveText('1x3x');

    // Zoom to 2x with the real slider.
    await dialog.getByLabel('Zoom', { exact: true }).fill('2');
    await expect(dialog.getByTestId('cover-crop-zoom-value')).toHaveText('2.0x');

    // Drag the picture inside the crop window (real pointer events).
    const box = (await dialog.getByTestId('cover-crop-window').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 10, { steps: 6 });
    await page.mouse.up();

    // The crop window really is 796:192 on screen.
    expect(box.width / box.height).toBeCloseTo(796 / 192, 1);

    await dialog.getByRole('button', { name: 'Save cover photo' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__coverUpload ?? null)).not.toBeNull();
    const upload = (await page.evaluate(() => (window as any).__coverUpload)) as { width: number; height: number; type: string };
    // 2x of a 1600x1200 image: a region of 800 x ~193, NOT the 1600x1200 original.
    expect(upload.type).toBe('image/png');
    expect(upload.width).toBe(800);
    expect(upload.width / upload.height).toBeCloseTo(796 / 192, 1);
    expect(upload.width * upload.height).toBeLessThan(1600 * 1200);
    await expect(dialog).toBeHidden();
  });

  test('an image under 796 px wide is refused in the crop step, and Cancel leaves nothing behind', async ({ page }) => {
    const a = await verifiedAdultWithUsername('crop2');
    await signIn(page, a.email);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit Profile' }).click();

    let uploaded = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/cover$/.test(r.url())) uploaded = true;
    });
    await chooseGeneratedImage(page, 'profile-image-cover-input', 700, 500);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('alert')).toContainText('at least 796 pixels wide');
    await expect(dialog.getByRole('alert')).toContainText('This one is 700 pixels wide');
    await expect(dialog.getByRole('heading', { name: 'This image is too small' })).toBeVisible();
    // FC7: the refusal carries the semantic/alert accent bar (a 3px left border).
    expect(await dialog.getByRole('alert').evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe('3px');
    await expect(dialog.getByRole('button', { name: 'Save cover photo' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(uploaded).toBe(false);
  });
});

test.describe('rejection reason and the image-decision notification (B-217, #414 items 3 and 4)', () => {
  test('a rejected avatar shows the moderator reason to its owner; the notification row opens Edit Profile', async ({
    page,
  }) => {
    const a = await verifiedAdultWithUsername('rej1');
    await db().user.update({
      where: { id: a.userId },
      data: {
        avatarUrl: 'https://example.test/a.png',
        avatarKey: 'qa/a.png',
        avatarStatus: 'rejected',
        avatarRejectionReason: 'Not a clear photo of you',
      },
    });
    await db().notification.create({ data: { userId: a.userId, type: 'profile_image_rejected', payloadRefId: 'avatar' } });

    await signIn(page, a.email);
    await page.goto('/notifications');
    const row = page.getByRole('link', { name: /Your picture wasn’t approved — see why in Edit Profile/ });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page).toHaveURL(/\/profile(\?edit=1)?$/);
    const avatar = page.getByTestId('profile-image-avatar');
    await expect(avatar).toContainText('This picture wasn’t approved.');
    await expect(page.getByTestId('profile-image-avatar-reason')).toHaveText('Reason: Not a clear photo of you');
    await expect(avatar.getByRole('button', { name: 'Choose another picture' })).toBeVisible();
  });

  test('the same row serves a rejected cover photo, and an unknown type renders a generic row', async ({ page }) => {
    const a = await verifiedAdultWithUsername('rej2');
    await db().user.update({
      where: { id: a.userId },
      data: {
        coverUrl: 'https://example.test/c.png',
        coverKey: 'qa/c.png',
        coverStatus: 'rejected',
        coverRejectionReason: 'Contains a logo we cannot show',
      },
    });
    await db().notification.create({ data: { userId: a.userId, type: 'profile_image_rejected', payloadRefId: 'cover' } });
    await db().notification.create({ data: { userId: a.userId, type: 'some_future_type', payloadRefId: 'x' } });

    await signIn(page, a.email);
    await page.goto('/notifications');
    await expect(page.getByText(/Your cover photo wasn’t approved — see why in Edit Profile/)).toBeVisible();
    await expect(page.getByText('You have a new notification')).toBeVisible();

    await page.getByText(/Your cover photo wasn’t approved/).click();
    await expect(page.getByTestId('profile-image-cover-reason')).toHaveText('Reason: Contains a logo we cannot show');
  });
});

test.describe('FC7: footnote link, phone cover preview, withdrawal inline errors (Decision Log #415)', () => {
  test('the guardian confirm page footnote links "guardian withdrawal page" to the request step (no token)', async ({ page }) => {
    const minor = await registerViaApi({ age: 15, label: 'fc7a' });
    await verifyEmailViaApi(minor);
    const mail = await waitForEmail(minor.guardianEmail!, 'guardian-consent');
    await page.goto(linkPath(mail.data.link));
    const link = page.getByRole('link', { name: 'guardian withdrawal page' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/guardian-consent/withdraw');
    await link.click();
    await expect(page).toHaveURL(/\/guardian-consent\/withdraw$/);
    await expect(page.getByRole('heading', { name: 'Withdraw your consent' })).toBeVisible();
    // The consent token must not travel to the withdrawal page.
    await expect(page.getByLabel('Email address of the Soccernity account')).toHaveValue('');
  });

  test('phone: the cover preview is the cover-fit result at 390:120 with the "sides are trimmed" caption', async ({ page }) => {
    const a = await verifiedAdultWithUsername('fc7b');
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, a.email);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await chooseGeneratedImage(page, 'profile-image-cover-input', 1600, 1200);
    const dialog = page.getByRole('dialog', { name: 'Crop your cover photo' });
    await expect(dialog).toBeVisible();

    const preview = dialog.getByTestId('cover-crop-preview');
    await expect(preview).toHaveAttribute('data-fit', 'cover-phone');
    await expect(dialog.getByTestId('cover-crop-preview-caption')).toHaveText(
      'This is how your cover will look on a phone. The sides are trimmed to fit.',
    );
    const slot = (await preview.boundingBox())!;
    expect(slot.width / slot.height).toBeCloseTo(390 / 120, 1);
    // The crop-shaped layer is as tall as the slot and wider than it: the sides are clipped.
    const layer = (await preview.locator('.cover-crop__preview-crop').boundingBox())!;
    expect(layer.height).toBeCloseTo(slot.height, 0);
    expect(layer.width / layer.height).toBeCloseTo(796 / 192, 1);
    expect(layer.width).toBeGreaterThan(slot.width + 20);
  });

  test('desktop: the preview keeps the 796:192 shape and the profile caption', async ({ page }) => {
    const a = await verifiedAdultWithUsername('fc7c');
    await signIn(page, a.email);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await chooseGeneratedImage(page, 'profile-image-cover-input', 1600, 1200);
    const dialog = page.getByRole('dialog', { name: 'Crop your cover photo' });
    const preview = dialog.getByTestId('cover-crop-preview');
    await expect(preview).toHaveAttribute('data-fit', 'crop');
    await expect(dialog.getByTestId('cover-crop-preview-caption')).toHaveText(
      'This is how your cover will look on your profile.',
    );
    const slot = (await preview.boundingBox())!;
    expect(slot.width / slot.height).toBeCloseTo(796 / 192, 1);
  });

  test('withdrawal: a malformed address and an empty code each show the inline message and call nothing', async ({ page }) => {
    let withdrawCalls = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /guardian-consent\/withdraw/.test(r.url())) withdrawCalls += 1;
    });
    await page.goto('/guardian-consent/withdraw');
    await page.getByLabel('Email address of the Soccernity account').fill('not-an-email');
    await page.getByRole('button', { name: 'Send withdrawal link' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter the email address of the Soccernity account.');

    await page.goto('/guardian-consent/withdraw?token=placeholder-code');
    await page.getByLabel('Withdrawal code').fill('   ');
    await page.getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(page.getByRole('alert')).toHaveText('Paste the withdrawal code from the email.');
    expect(withdrawCalls).toBe(0);
  });
});
