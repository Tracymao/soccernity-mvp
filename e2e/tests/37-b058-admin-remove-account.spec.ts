import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, getAdminToken } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { ADMIN_CREDENTIALS, URLS } from '../support/stack';

// B-058: Remove account on the Roles list (Decision Log #472: a SOFT remove -- the account and its history are kept and it
// can no longer sign in), in real Chrome with the real API, Postgres and Redis. Scoped to this screen.
//
// Remove account is the existing deactivate action: PATCH /admin/staff/:id/status. The QA admin is a superadmin. Targets are
// made through the real POST /admin/staff with a password this spec chooses, so a removed target can be proved unable to sign
// in. Admin logins are limited to 5 per 15 minutes per IP (Decision Log #190); this spec spends 2 (the cached QA admin token
// and the removed account's refused sign-in).
test.use({ viewport: { width: 1440, height: 1184 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b058-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const PASSWORD = `remove-${RUN}-pw1`;

async function makeAdmin(label: string, role: 'editor' | 'moderator' | 'superadmin'): Promise<{ id: string; email: string; name: string }> {
  const token = await getAdminToken();
  const email = `qa-b058-${label}-${RUN}@soccernity.test`;
  const name = `Remove ${label[0].toUpperCase()}${label.slice(1)}`;
  const res = await api('POST', '/admin/staff', { token, body: { email, fullName: name, role, temporaryPassword: PASSWORD } });
  expect([200, 201]).toContain(res.status);
  return { id: res.body.id as string, email, name };
}

test.describe.serial('admin Remove account', () => {
  let target: { id: string; email: string; name: string };
  let second: { id: string; email: string; name: string };
  let third: { id: string; email: string; name: string };

  test.beforeAll(async () => {
    target = await makeAdmin('target', 'moderator');
    second = await makeAdmin('second', 'editor');
    third = await makeAdmin('third', 'moderator');
  });

  test('confirm dialog: Cancel changes nothing, then Remove ends in the Done state and the account really cannot sign in', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings`);
    await expect(page.getByText(target.name)).toBeVisible();

    await page.getByRole('button', { name: `Remove account: ${target.name}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove this account?' });
    await expect(dialog).toContainText(`${target.name}’s account and history are kept, but they can no longer sign in.`);
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await shot(page, '01-confirm');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await db().adminUser.findUnique({ where: { id: target.id } })).accountStatus).toBe('active');

    // Slow the answer so the Removing state can be seen and checked.
    await page.route(`${URLS.api}/admin/staff/${target.id}/status`, async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.getByRole('button', { name: `Remove account: ${target.name}` }).click();
    await page.getByRole('button', { name: 'Remove account', exact: true }).click();
    const busy = page.getByRole('button', { name: 'Removing…' });
    await expect(busy).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await shot(page, '02-removing');

    await expect(dialog).toHaveCount(0);
    const banner = page.getByRole('status');
    await expect(banner).toContainText('Account removed');
    await expect(banner).toContainText(`${target.name} can no longer sign in. Their account and history are kept.`);
    const row = page.locator('.rl-table__row', { hasText: target.name });
    await expect(row.getByText('Removed')).toBeVisible();
    await expect(row.getByRole('button', { name: /Remove account/ })).toHaveCount(0);
    await shot(page, '03-done');

    // The server agrees: soft remove (the row and its history stay), audited, and the person cannot sign in.
    const stored = await db().adminUser.findUnique({ where: { id: target.id } });
    expect(stored.accountStatus).toBe('deactivated');
    expect(stored.email).toBe(target.email);
    const log = await db().adminActionLog.findFirst({ where: { targetId: target.id, action: 'admin_user.status_updated' } });
    expect(log).not.toBeNull();
    const signIn = await api('POST', '/admin/auth/login', { body: { email: target.email, password: PASSWORD } });
    expect(signIn.status).toBe(401);

    // A reload shows the same: Removed and nothing to remove again.
    await page.reload();
    const again = page.locator('.rl-table__row', { hasText: target.name });
    await expect(again.getByText('Removed')).toBeVisible();
    await expect(again.getByRole('button', { name: /Remove account/ })).toHaveCount(0);
    await page.context().close();
  });

  test('a failed request shows the could-not-remove state, changes nothing, and Try again then succeeds', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings`);
    await page.route(`${URLS.api}/admin/staff/${second.id}/status`, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) }),
    );

    await page.getByRole('button', { name: `Remove account: ${second.name}` }).click();
    await page.getByRole('button', { name: 'Remove account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Couldn’t remove the account' });
    await expect(dialog).toContainText(`${second.name}’s account hasn’t changed. Check the connection and try again.`);
    await expect(dialog).not.toContainText('Service unavailable');
    expect((await db().adminUser.findUnique({ where: { id: second.id } })).accountStatus).toBe('active');
    await shot(page, '04-could-not-remove');

    await page.unroute(`${URLS.api}/admin/staff/${second.id}/status`);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Account removed');
    expect((await db().adminUser.findUnique({ where: { id: second.id } })).accountStatus).toBe('deactivated');
    await page.context().close();
  });

  test('your own account: the dialog explains and the server is never called', async ({ browser }) => {
    const page = await adminPage(browser);
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes('/admin/staff/')) calls.push(req.url());
    });
    await page.goto(`${URLS.admin}/settings`);
    await page.getByRole('button', { name: `Remove account: ${ADMIN_CREDENTIALS.fullName}` }).click();
    const dialog = page.getByRole('dialog', { name: 'You can’t remove your own account' });
    await expect(dialog).toContainText('Ask another super admin to remove it.');
    await expect(page.getByRole('button', { name: 'Remove account', exact: true })).toHaveCount(0);
    await shot(page, '05-own-account');
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    expect(calls).toEqual([]);
    expect((await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } })).accountStatus).toBe('active');
    await page.context().close();
  });

  test('the server refuses to remove the last active super admin (409), and the dialog says so', async ({ browser }) => {
    // From the UI a 409 cannot be reached against the real server: the signed-in admin is an active super admin, so any OTHER
    // super admin is never the last, and removing yourself is stopped in the browser. So the real refusal is proved on the API
    // (the QA admin made the only active super admin, then put back), and the dialog's 409 state is driven by that answer.
    const token = await getAdminToken();
    const me = await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } });
    const others = await db().adminUser.findMany({ where: { role: 'superadmin', accountStatus: 'active', id: { not: me.id } } });
    try {
      await db().adminUser.updateMany({ where: { id: { in: others.map((o: { id: string }) => o.id) } }, data: { accountStatus: 'deactivated' } });
      const refused = await api('PATCH', `/admin/staff/${me.id}/status`, { token, body: { status: 'deactivated' } });
      expect(refused.status).toBe(409);
      expect((await db().adminUser.findUnique({ where: { id: me.id } })).accountStatus).toBe('active');
    } finally {
      await db().adminUser.updateMany({ where: { id: { in: others.map((o: { id: string }) => o.id) } }, data: { accountStatus: 'active' } });
    }

    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings`);
    await page.route(`${URLS.api}/admin/staff/${third.id}/status`, (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Cannot deactivate the last active superadmin' }) }),
    );
    await page.getByRole('button', { name: `Remove account: ${third.name}` }).click();
    await page.getByRole('button', { name: 'Remove account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'This is the last active super admin' });
    await expect(dialog).toContainText(
      'At least one active super admin is needed to manage staff. Give another account the Super Admin role first, then remove this one.',
    );
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await shot(page, '06-last-super-admin');
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    expect((await db().adminUser.findUnique({ where: { id: third.id } })).accountStatus).toBe('active');
    await page.context().close();
  });
});
