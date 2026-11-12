import { test, expect } from '@playwright/test';
import { adminPageAs, api, createQaAdmin, db, userLogin, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-304 (f): the Users list and User detail (B-295, B-172, PR #623, Decision Log #462 (e), #485), in real Chrome
// against the real API, Postgres and Redis.
//   Users list  : apps/admin/src/pages/users/UsersPage.tsx. Block opens the SAME reason-category dialog the user page
//                 uses (the API refuses a suspension with no category), Unblock needs nothing more.
//   User detail : apps/admin/src/pages/users/UserDetailPage.tsx, Account card rows "Age group" and "Under 16"
//                 (the server's stored isUnder16 flag, shown for every account).
// The acting admin is a moderator created in Postgres and used through a locally signed token.
test.use({ viewport: { width: 1440, height: 1300 } });

const RUN = Date.now().toString(36);

test.describe.serial('Users list: block and unblock, and the Under 16 row', () => {
  let mod: QaAdmin;
  let adult: Verified;
  let child: Verified; // 14: under 16, guardian confirmed
  let teen: Verified; // 17: under 18, not under 16

  test.beforeAll(async () => {
    mod = await createQaAdmin('moderator', `B304 Users ${RUN}`);
    adult = await verifiedAccount('bua');
    child = await verifiedAccount('buc', 14);
    teen = await verifiedAccount('but', 17);
    expect((await db().user.findUnique({ where: { id: child.userId } })).isUnder16).toBe(true);
    expect((await db().user.findUnique({ where: { id: teen.userId } })).isUnder16).toBe(false);
  });

  test('Block opens the category dialog, needs a category, suspends; Unblock restores; the audit rows say which', async ({ browser }) => {
    const page = await adminPageAs(browser, mod.token);
    await page.goto(`${URLS.admin}/users`);
    const row = page.locator('.us-table__row', { hasText: adult.username });
    await expect(row).toBeVisible();
    await expect(row.locator('.us-pill')).toHaveText('active');

    await row.getByRole('button', { name: 'Block', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Suspend this account?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(9);
    // No category: refused client-side, nothing sent.
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Choose a reason category.' })).toBeVisible();
    expect((await db().user.findUnique({ where: { id: adult.userId } })).accountStatus).toBe('active');

    await dialog.getByRole('radio', { name: 'Harassment or bullying' }).check();
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row.locator('.us-pill')).toHaveText('suspended');
    await expect(row.getByRole('button', { name: 'Unblock', exact: true })).toBeVisible();

    const suspended = await db().user.findUnique({ where: { id: adult.userId } });
    expect(suspended.accountStatus).toBe('suspended');
    expect(suspended.suspendedByReportId).toBeNull();
    expect((await userLogin(adult.email)).status).toBe(401);
    const blockAudit = await db().adminActionLog.findFirst({ where: { action: 'user.status_updated', targetId: adult.userId }, orderBy: { createdAt: 'desc' } });
    expect(blockAudit.adminId).toBe(mod.id);
    expect(blockAudit.notes).toBe('status=suspended; reasonCategory=harassment_or_bullying');

    // The Suspended tab lists it.
    await page.getByRole('button', { name: 'Suspended', exact: true }).click();
    await expect(page.locator('.us-table__row', { hasText: adult.username })).toBeVisible();

    // Unblock: no dialog, straight back to active.
    await page.locator('.us-table__row', { hasText: adult.username }).getByRole('button', { name: 'Unblock', exact: true }).click();
    await expect.poll(async () => (await db().user.findUnique({ where: { id: adult.userId } })).accountStatus).toBe('active');
    expect([200, 201]).toContain((await userLogin(adult.email)).status);
    const unblockAudit = await db().adminActionLog.findFirst({ where: { action: 'user.status_updated', targetId: adult.userId }, orderBy: { createdAt: 'desc' } });
    expect(unblockAudit.notes).toBe('status=active');
    await page.context().close();
  });

  test('User detail shows the Under 16 row: Yes for an under-16 account, No for an adult and for a 17-year-old', async ({ browser }) => {
    const page = await adminPageAs(browser, mod.token);
    const rowOf = (label: string) => page.locator('.ud-fields__row', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });

    await page.goto(`${URLS.admin}/users/${child.userId}`);
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(rowOf('Under 16').locator('dd')).toHaveText('Yes');
    await expect(rowOf('Age group').locator('dd')).toHaveText('Under 18');
    await expect(rowOf('Guardian').locator('dd')).toHaveText('Confirmed');

    await page.goto(`${URLS.admin}/users/${teen.userId}`);
    await expect(rowOf('Under 16').locator('dd')).toHaveText('No');
    await expect(rowOf('Age group').locator('dd')).toHaveText('Under 18');

    // The brief expected no row at all for an adult; the page draws the row for every account (B-172, PR #623).
    await page.goto(`${URLS.admin}/users/${adult.userId}`);
    await expect(rowOf('Under 16')).toHaveCount(1);
    await expect(rowOf('Under 16').locator('dd')).toHaveText('No');
    await expect(rowOf('Age group').locator('dd')).toHaveText('18 or over');
    // The page reads the summary route only: opening it writes no date-of-birth audit row (B-129).
    expect(await db().adminActionLog.count({ where: { action: 'user.dob_viewed', targetId: child.userId } })).toBe(0);
    await page.context().close();
  });

  test('the flag shown is the server\'s stored flag', async () => {
    const res = await api('GET', `/admin/users/${child.userId}/summary`, { token: mod.token });
    expect(res.status).toBe(200);
    expect(res.body.isUnder16).toBe(true);
    expect(res.body.isMinor).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('dateOfBirth');
  });
});
