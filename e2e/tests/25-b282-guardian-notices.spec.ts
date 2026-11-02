import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { db, guardianConfirmViaApi, registerViaApi, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { ADMIN_CREDENTIALS, URLS } from '../support/stack';

// B-282 (Decision Log #458; backend B-280): the "Guardian notices" section on the Admin user detail page of a minor,
// in real Chrome against the real API, Postgres and Redis. Scoped to this section only.
//
// The QA admin is a superadmin and NOT child-safety vetted by default; the spec vets it directly in Postgres for
// the tests that need it and puts it back afterwards (other specs, for example 22, rely on it being unvetted).
// The minor is registered through the real API and its guardian confirms through the real emailed token.
test.use({ viewport: { width: 1440, height: 1184 } });

// Screenshots for the visual check against the Figma frames.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b282-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const REASON = 'Safeguarding concern about the home. Staff are supporting the child directly.';

async function setVetted(vetted: boolean): Promise<string> {
  const admin = await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } });
  if (!admin) throw new Error('the QA admin does not exist');
  await db().adminUser.update({
    where: { id: admin.id },
    data: vetted
      ? { childSafetyVetted: true, vettedAt: new Date(), vettedByAdminId: admin.id }
      : { childSafetyVetted: false, vettedAt: null, vettedByAdminId: null },
  });
  return admin.id as string;
}

test.describe.serial('guardian notices: the vetted-admin section on a minor', () => {
  let minor: Account;
  let adult: Account;
  let adminId = '';

  test.beforeAll(async () => {
    minor = await registerViaApi({ age: 14, label: 'gn-minor', displayName: 'Tolu Adeyemi' });
    await guardianConfirmViaApi(minor);
    adult = await registerViaApi({ age: 30, label: 'gn-adult', displayName: 'Ada Adult' });
    adminId = await setVetted(false);
  });

  test.afterAll(async () => {
    await setVetted(false);
  });

  test('an admin who is not vetted sees nothing and the page asks for nothing', async ({ browser }) => {
    await setVetted(false);
    const page = await adminPage(browser);
    const noticeRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/guardian-notices')) noticeRequests.push(req.url());
    });
    await page.goto(`${URLS.admin}/users/${minor.userId}`);
    await expect(page.getByRole('heading', { name: 'Tolu Adeyemi' })).toBeVisible();
    // The Account card still shows the two facts to every admin.
    const account = page.getByRole('region', { name: 'Account' });
    await expect(account).toContainText('Under 18');
    await expect(account).toContainText('Confirmed');
    await expect(page.getByRole('region', { name: 'Guardian notices' })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(noticeRequests).toEqual([]);
    await page.context().close();
  });

  test('a vetted admin does not get the section on an adult account', async ({ browser }) => {
    await setVetted(true);
    const page = await adminPage(browser);
    const noticeRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/guardian-notices')) noticeRequests.push(req.url());
    });
    await page.goto(`${URLS.admin}/users/${adult.userId}`);
    await expect(page.getByRole('heading', { name: 'Ada Adult' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Account' })).toContainText('18 or over');
    await expect(page.getByRole('region', { name: 'Guardian notices' })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(noticeRequests).toEqual([]);
    await page.context().close();
  });

  test('a vetted admin sets, reviews and clears the flag on a minor, and it is stored and audited', async ({ browser }) => {
    await setVetted(true);
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${minor.userId}`);
    const section = page.getByRole('region', { name: 'Guardian notices' });
    await expect(section).toBeVisible();
    await expect(section.getByText('Sending normally')).toBeVisible();
    await expect(section.getByText('[COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await shot(page, '01-off');

    // Set: an empty reason is refused on the page, nothing is stored.
    await section.getByRole('button', { name: 'Withhold guardian notices' }).click();
    const setDialog = page.getByRole('dialog', { name: 'Withhold guardian notices?' });
    await expect(setDialog).toContainText('Tolu Adeyemi is under 18 and has a confirmed guardian.');
    await setDialog.getByRole('button', { name: 'Withhold notices' }).click();
    await expect(setDialog.getByText('A reason is required.')).toBeVisible();
    expect(await db().guardianNoticeWithhold.count({ where: { userId: minor.userId } })).toBe(0);
    await shot(page, '02-set-dialog-empty-error');
    await setDialog.getByLabel('Reason (required)').fill(REASON);
    await setDialog.getByRole('button', { name: 'Withhold notices' }).click();

    await expect(section.getByText('Withholding')).toBeVisible();
    await expect(section.getByText('Guardian notices are being withheld')).toBeVisible();
    await expect(section.getByText('Never')).toBeVisible();
    await expect(section.getByText(REASON)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await shot(page, '03-on');
    const row = await db().guardianNoticeWithhold.findUnique({ where: { userId: minor.userId } });
    expect(row.reason).toBe(REASON);
    expect(row.setByAdminId).toBe(adminId);
    expect(await db().adminActionLog.count({ where: { targetId: minor.userId, action: 'user.guardian_notices_withheld' } })).toBe(1);

    // The reason is not in the URL, the title or browser storage.
    expect(page.url()).not.toContain('Safeguarding');
    expect(await page.title()).not.toContain('Safeguarding');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Safeguarding');

    // A reload shows the same state from the server.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Guardian notices' }).getByText('Withholding')).toBeVisible();

    // Review: a note is required, then the date and note of the latest review show.
    await section.getByRole('button', { name: 'Record review' }).click();
    const reviewDialog = page.getByRole('dialog', { name: 'Record a review' });
    await reviewDialog.getByRole('button', { name: 'Record review' }).click();
    await expect(reviewDialog.getByText('A note is required.')).toBeVisible();
    await reviewDialog.getByLabel('Note (required)').fill('Still supporting the child directly.');
    await reviewDialog.getByRole('button', { name: 'Record review' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(section.getByText('Still supporting the child directly.')).toBeVisible();
    await expect(section.getByText('Never')).toHaveCount(0);
    const reviewed = await db().guardianNoticeWithhold.findUnique({ where: { userId: minor.userId } });
    expect(reviewed.lastReviewNote).toBe('Still supporting the child directly.');
    expect(reviewed.lastReviewedAt).not.toBeNull();
    expect(await db().adminActionLog.count({ where: { targetId: minor.userId, action: 'user.guardian_notices_reviewed' } })).toBe(1);
    await shot(page, '04-reviewed');

    // Clear: a reason is required, then the banner shows and the section is OFF again.
    await section.getByRole('button', { name: 'Clear' }).click();
    const clearDialog = page.getByRole('dialog', { name: 'Clear guardian-notice withholding?' });
    await clearDialog.getByRole('button', { name: 'Clear' }).click();
    await expect(clearDialog.getByText('A reason is required.')).toBeVisible();
    await clearDialog.getByLabel('Reason (required)').fill('The concern has ended.');
    await clearDialog.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('status')).toContainText('Guardian notices cleared');
    await expect(section.getByText('Sending normally')).toBeVisible();
    await shot(page, '05-cleared');
    expect(await db().guardianNoticeWithhold.count({ where: { userId: minor.userId } })).toBe(0);
    expect(await db().adminActionLog.count({ where: { targetId: minor.userId, action: 'user.guardian_notices_cleared' } })).toBe(1);
    await page.context().close();
  });

  test('a page loaded while vetted is refused once vetting is gone: the restricted dialog, then the section disappears', async ({
    browser,
  }) => {
    await setVetted(true);
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${minor.userId}`);
    const section = page.getByRole('region', { name: 'Guardian notices' });
    await expect(section.getByText('Sending normally')).toBeVisible();

    // Vetting is withdrawn behind the page's back.
    await setVetted(false);
    await section.getByRole('button', { name: 'Withhold guardian notices' }).click();
    const setDialog = page.getByRole('dialog', { name: 'Withhold guardian notices?' });
    await setDialog.getByLabel('Reason (required)').fill(REASON);
    await setDialog.getByRole('button', { name: 'Withhold notices' }).click();

    const restricted = page.getByRole('dialog', { name: 'Withhold guardian notices' });
    await expect(restricted).toContainText('Restricted — child-safety vetting required');
    await shot(page, '06-restricted');
    // The admin's profile is re-read, so the stale section goes away.
    await expect(page.getByRole('region', { name: 'Guardian notices' })).toHaveCount(0);
    expect(await db().guardianNoticeWithhold.count({ where: { userId: minor.userId } })).toBe(0);
    await restricted.getByRole('button', { name: 'Close' }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.context().close();
  });
});
