import { test, expect } from '@playwright/test';
import {
  api,
  db,
  dobForAge,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  userByEmail,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';

// Username rules (Decision Log #364, #369, #406 item 8). Driven both through
// the Create Profile form and straight at PATCH /users/:id.

async function verifiedAdult(label: string): Promise<Account & { token: string }> {
  const a = await registerViaApi({ age: 30, label, displayName: 'Quinn Player' });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  return { ...a, token };
}
async function patchUsername(a: { userId: string; token: string }, username: string | null) {
  return api('PATCH', `/users/${a.userId}`, { token: a.token, body: { username } });
}

test.describe('Create Profile form', () => {
  test('client-side checks: too short, bad characters', async ({ page }) => {
    const a = await verifiedAdult('cpf1');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);
    const msg = 'Username must be 3-30 characters: letters, numbers and underscores only.';
    for (const bad of ['ab', 'has space', 'bad-chars!', 'x'.repeat(31)]) {
      await page.getByLabel('Username').fill(bad);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('alert')).toHaveText(msg);
    }
    expect((await userByEmail(a.email)).username).toBeNull();
  });

  test('server refusals are shown inline, generic for most, specific for personal data; nothing is saved', async ({
    page,
  }) => {
    const a = await verifiedAdult('cpf2');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);

    for (const blocked of ['admin', 'Soccernity_fan', 'nazi_fan', 'my_gmail_acct']) {
      await page.getByLabel('Username').fill(blocked);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('alert')).toHaveText('That username is not available. Please choose another.');
      await expect(page).toHaveURL(/\/create-profile$/);
    }

    await page.getByLabel('Username').fill('quinnplayer');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      "Usernames can't include your name, email address, phone number or date of birth. Please choose another.",
    );
    expect((await userByEmail(a.email)).username).toBeNull();
  });

  test('a valid username is accepted and the user moves on to the Club Picker', async ({ page }) => {
    const a = await verifiedAdult('cpf3');
    await loginViaUi(page, a.email);
    const name = uniqueUsername('ok');
    await page.getByLabel('Username').fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/signup\/clubs$/);
    expect((await userByEmail(a.email)).username).toBe(name.toLowerCase());
  });
});

test.describe('username rules (API)', () => {
  test('letters are required: digits-only handles are refused', async () => {
    const a = await verifiedAdult('r1');
    for (const bad of ['12345678', '____', '1_2_3_4']) {
      const res = await patchUsername(a, bad);
      expect(res.status, bad).toBe(400);
      expect(res.body.code, bad).toBe('username_not_allowed');
    }
  });

  test('reserved words, noise affixes and leetspeak are refused', async () => {
    const a = await verifiedAdult('r2');
    for (const bad of ['admin', 'Administrator', 'official_admin', 'theofficial', 'a_d_m_i_n', '4dm1n', 'support_team', 'MySoccernity']) {
      const res = await patchUsername(a, bad);
      expect(res.status, bad).toBe(400);
      expect(res.body.code, bad).toBe('username_not_allowed');
    }
  });

  test('profanity and hate terms are refused', async () => {
    const a = await verifiedAdult('r3');
    for (const bad of ['nazi_fan', 'hitler_1488', 'sexy_boy', 'fuckface']) {
      const res = await patchUsername(a, bad);
      expect(res.status, bad).toBe(400);
    }
  });

  // D-06 (fixed, Decision Log #407 item 3). Long, unambiguous hate and sexual
  // terms are matched by CONTAINS, so gluing letters to them no longer helps.
  // Kept as a regression test; the test.fail() it used to carry is gone.
  test('D-06: hate terms are also refused when glued to other letters (xxhitlerxx, nazifan)', async () => {
    const a = await verifiedAdult('r3b');
    for (const bad of ['xxhitlerxx', 'nazifan']) {
      const res = await patchUsername(a, bad);
      expect(res.status, bad).toBe(400);
    }
  });

  test('D-06: innocent names that contain a short fragment are still accepted (Nazir, Essex, Hancock)', async () => {
    const a = await verifiedAdult('r3c');
    const res = await patchUsername(a, 'nazir_essex_hancock');
    expect(res.status).toBe(200);
  });

  test('contact details / other platforms are refused', async () => {
    const a = await verifiedAdult('r4');
    for (const bad of ['whatsapp_me', 'dm_on_insta_gmail', 'snapchat_ace']) {
      const res = await patchUsername(a, bad);
      expect(res.status, bad).toBe(400);
    }
  });

  test('personal data is refused, with the specific message: own name (either order), email, birth year, phone-like digits', async () => {
    const a = await verifiedAdult('r5');
    const birthYear = dobForAge(30).year;
    const emailLocal = a.email.split('@')[0].replace(/[^a-z0-9]/g, '');
    for (const bad of ['quinnplayer77', 'player_quinn', `ace${birthYear}`, emailLocal.slice(0, 28), 'a07700900123']) {
      const res = await patchUsername(a, bad);
      expect(res.status, bad).toBe(400);
      expect(res.body.message, bad).toMatch(/can't include your name/);
    }
  });

  test('a minor cannot use their guardian-flow data either: own name is refused for a minor too', async () => {
    const m = await registerViaApi({ age: 15, label: 'r5m', displayName: 'Jordan Winger' });
    await verifyEmailViaApi(m);
    const { token } = await me(m);
    const res = await patchUsername({ userId: m.userId, token }, 'jordanwinger');
    // Not asserted on the message: guardian consent may be pending, which is also a 403.
    expect([400, 403]).toContain(res.status);
  });

  test('stored lowercase; a taken name is refused case-insensitively with 409', async () => {
    const a = await verifiedAdult('r6a');
    const b = await verifiedAdult('r6b');
    const mixed = `Mixed_${uniqueUsername('Case')}`.slice(0, 30);
    const ok = await patchUsername(a, mixed);
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe(mixed.toLowerCase());
    const dupe = await patchUsername(b, mixed.toUpperCase());
    expect(dupe.status).toBe(409);
    const again = await patchUsername(a, mixed.toUpperCase());
    expect([200, 409]).toContain(again.status); // re-saving your own handle must never be a 500
  });

  test('club impersonation is refused (a handle that is just a club name, with or without FC)', async () => {
    const club = `Harbour Rovers ${Date.now().toString(36)}`;
    await db().clubPage.create({ data: { name: `${club} FC`, league: 'QA League', country: 'GB' } });
    const a = await verifiedAdult('r7');
    const handle = club.replace(/[^A-Za-z0-9]/g, '');
    for (const bad of [handle, `${handle}FC`, `${handle}_official`]) {
      const res = await patchUsername(a, bad.slice(0, 30));
      expect(res.status, bad).toBe(400);
    }
  });

  test('clearing the username is refused (400 username_required); a user cannot go back to having none', async () => {
    const a = await verifiedAdult('r8');
    expect((await patchUsername(a, uniqueUsername('own'))).status).toBe(200);
    const res = await patchUsername(a, null);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('username_required');
    expect((await userByEmail(a.email)).username).not.toBeNull();
  });

  test('change cooldown: one free correction, then 429 with an availability date (Decision Log #406 item 8)', async () => {
    const a = await verifiedAdult('r9');
    const first = await patchUsername(a, uniqueUsername('c1'));
    const second = await patchUsername(a, uniqueUsername('c2'));
    const third = await patchUsername(a, uniqueUsername('c3'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200); // the one free correction
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('username_change_cooldown');
    expect(new Date(third.body.availableAt).getTime()).toBeGreaterThan(Date.now() + 28 * 24 * 3600 * 1000);
  });

  test('a handle a user releases by changing it is free for others at once (no hold)', async () => {
    const a = await verifiedAdult('r10a');
    const b = await verifiedAdult('r10b');
    const old = uniqueUsername('rel');
    expect((await patchUsername(a, old)).status).toBe(200);
    expect((await patchUsername(a, uniqueUsername('new'))).status).toBe(200);
    expect((await patchUsername(b, old)).status).toBe(200);
  });

  test('username is hidden from everyone except as the public name: another user sees it, never the real name', async () => {
    const a = await verifiedAdult('r11a');
    const b = await verifiedAdult('r11b');
    const name = uniqueUsername('pub');
    expect((await patchUsername(a, name)).status).toBe(200);
    const view = await api('GET', `/users/${a.userId}/public-profile`, { token: b.token });
    expect(view.status).toBe(200);
    expect(view.body.publicName).toBe(name.toLowerCase());
    expect(JSON.stringify(view.body)).not.toMatch(/Quinn|Player/);
  });
});

test.describe('Edit Profile', () => {
  test('D-05: Edit Profile no longer describes the username as optional (it is required and cannot be cleared)', async ({
    page,
  }) => {
    test.fail(true, 'D-05: the Username hint still reads "Optional. If you set one..." though username is required and cannot be removed');
    const a = await verifiedAdult('ep1');
    const own = uniqueUsername('ep');
    expect((await patchUsername(a, own)).status).toBe(200);
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page.locator('#edit-profile-username')).toHaveValue(own.toLowerCase());
    await page.locator('#edit-profile-username').fill('');
    await page.getByRole('button', { name: 'Update Profile' }).click();
    // The server's refusal is shown properly (this part works) ...
    await expect(page.getByRole('alert')).toContainText(/can.t be removed/i, {
      timeout: 5000,
    });
    // ... but the hint under the field still calls the username optional.
    await expect(page.getByText(/^Optional\./)).toHaveCount(0);
  });
});
