import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, getAdminToken, uniqueEmail } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// B-046 part B (Decision Log #444, #445): the Contact enquiries tab, Enquiry Detail and the Escalate dialog, in real
// Chrome against the real API, Postgres and Redis. Scoped to this screen only.
//
// The enquiries are submitted through the real public route (POST /contact); the admin console is then driven in the
// browser: open the tab, open an enquiry, mark it handled and reopen it, escalate it into a report, find the report in
// the Moderation Queue, dismiss it. The QA admin is a superadmin and is NOT child-safety vetted, which is what the
// restricted-notice test relies on.
test.use({ viewport: { width: 1440, height: 1184 } });

// Screenshots for the visual check against the Figma frames (docs/figma-admin-contact-enquiries-screens).
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b046-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);

async function submitEnquiry(label: string): Promise<{ id: string; name: string; email: string; subject: string }> {
  const name = `Chioma ${label} ${RUN}`;
  const email = uniqueEmail(`enq-${label}`);
  const subject = `Score not updating (${label} ${RUN})`;
  const res = await api('POST', '/contact', {
    body: {
      name,
      email,
      category: 'technical_issues',
      subject,
      message: 'The live score for last night’s match has been stuck at 0–0 since half time. Is this a known issue?',
    },
  });
  if (res.status !== 201) throw new Error(`POST /contact failed ${res.status} ${JSON.stringify(res.body)}`);
  expect(res.body).toEqual({ received: true });
  const row = await db().contactEnquiry.findFirst({ where: { email: email.toLowerCase() } });
  if (!row) throw new Error('the enquiry was not stored');
  return { id: row.id as string, name, email, subject };
}

async function openFromTab(page: Page, enq: { name: string; subject: string }): Promise<void> {
  await page.goto(`${URLS.admin}/moderation`);
  await page.getByRole('link', { name: 'Contact enquiries', exact: true }).click();
  await expect(page).toHaveURL(`${URLS.admin}/moderation/contact-enquiries`);
  const open = page.getByRole('link', { name: `Open enquiry from ${enq.name}: ${enq.subject}` });
  await expect(open).toBeVisible();
  await open.click();
}

test.describe.serial('contact enquiries: the tab, the detail page and escalating to a report', () => {
  let main: { id: string; name: string; email: string; subject: string };
  let minor: { id: string; name: string; email: string; subject: string };
  let reportId = '';

  test('set-up: two enquiries are submitted through the public route', async () => {
    main = await submitEnquiry('main');
    minor = await submitEnquiry('minor');
    const stored = await db().contactEnquiry.findUnique({ where: { id: main.id } });
    expect(stored.status).toBe('new');
    expect(stored.escalatedReportId).toBeNull();
  });

  test('the tab lists them (no message text), filters work, and an enquiry opens with its message', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation`);
    // The tab row carries the new tab.
    await expect(page.getByRole('link', { name: 'Contact enquiries', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Contact enquiries', exact: true }).click();

    const table = page.getByRole('table', { name: 'Contact enquiries' });
    await expect(table).toBeVisible();
    const row = table.getByRole('row', { name: new RegExp(main.subject.replace(/[()]/g, '\\$&')) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(main.name);
    await expect(row).toContainText(main.email);
    await expect(row).toContainText('Technical issues');
    await expect(row).toContainText('New');
    await expect(row).toContainText('Guest');
    // The list carries no message text.
    await expect(table).not.toContainText('stuck at 0–0');
    await shot(page, '01-tab-list');

    // A filter that matches nothing here: "Handled" (neither is handled yet) -> the empty state.
    await page.getByLabel('Status').selectOption('handled');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByText('No contact enquiries')).toBeVisible();
    await expect(page.getByText('Messages sent through the Contact Us form will appear here.')).toBeVisible();
    await shot(page, '02-tab-empty');
    // Back to All (and a category that matches): the rows return.
    await page.getByLabel('Status').selectOption('');
    await page.getByLabel('Category').selectOption('technical_issues');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByRole('table', { name: 'Contact enquiries' }).getByRole('row', { name: new RegExp(main.name) })).toBeVisible();

    // Open it: the detail shows the message and the actions.
    await page.getByRole('link', { name: `Open enquiry from ${main.name}: ${main.subject}` }).click();
    await expect(page.getByRole('heading', { name: `Enquiry #${main.id.slice(0, 8)}` })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Message' })).toContainText('stuck at 0–0 since half time');
    await expect(page.getByRole('link', { name: 'Reply by email' })).toHaveAttribute('href', `mailto:${main.email}`);
    await expect(
      page.getByText('Enquiries are deleted automatically 12 months after the last message.', { exact: false }),
    ).toBeVisible();
    await shot(page, '03-detail');
    await page.context().close();
  });

  test('mark handled and reopen are saved on the server', async ({ browser }) => {
    const page = await adminPage(browser);
    await openFromTab(page, main);
    await page.getByRole('button', { name: 'Mark handled' }).click();
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
    const handled = await db().contactEnquiry.findUnique({ where: { id: main.id } });
    expect(handled.status).toBe('handled');
    expect(handled.handledAt).not.toBeNull();
    expect(handled.handledByAdminId).not.toBeNull();

    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('button', { name: 'Mark handled' })).toBeVisible();
    const reopened = await db().contactEnquiry.findUnique({ where: { id: main.id } });
    expect(reopened.status).toBe('new');
    expect(reopened.handledAt).toBeNull();
    expect(reopened.handledByAdminId).toBeNull();
    expect(await db().adminActionLog.count({ where: { targetId: main.id, action: { in: ['contact_enquiry.handled', 'contact_enquiry.reopened'] } } })).toBe(2);
    await page.context().close();
  });

  test('escalating to a report: focus, validation, then the report exists and the page shows the escalated state', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await openFromTab(page, main);

    const opener = page.getByRole('button', { name: 'Escalate to a report' });
    await opener.focus();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Escalate to a report' });
    await expect(dialog).toContainText(`Enquiry #${main.id.slice(0, 8)}. This creates a report in the Moderation Queue and links it to this enquiry.`);
    // Focus moves to the first field, and Tab stays inside.
    await expect(dialog.getByLabel('Severity')).toBeFocused();
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await shot(page, '04-escalate-dialog');

    // Escape closes it and gives focus back to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await db().report.count({ where: { targetType: 'enquiry', targetId: main.id } })).toBe(0);

    // Open again: a short reason is refused in the dialog and nothing is created.
    await opener.click();
    await dialog.getByLabel('Severity').selectOption('high');
    await dialog.getByLabel('Reason (required)').fill('too short');
    await dialog.getByRole('button', { name: 'Escalate to a report' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Give a reason of at least 10 characters.');
    expect(await db().report.count({ where: { targetType: 'enquiry', targetId: main.id } })).toBe(0);

    // A real reason: the dialog closes and the page shows the escalated state.
    await dialog.getByLabel('Reason (required)').fill('The message describes a safety concern.');
    await dialog.getByRole('button', { name: 'Escalate to a report' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Escalated', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Escalate to a report' })).toHaveCount(0);

    const stored = await db().contactEnquiry.findUnique({ where: { id: main.id } });
    expect(stored.escalatedReportId).not.toBeNull();
    reportId = stored.escalatedReportId as string;
    await expect(page.getByRole('link', { name: `View report #${reportId.slice(0, 8)}` })).toHaveAttribute('href', `/moderation/reports/${reportId}`);
    await expect(page.getByText(`Escalated to report #${reportId.slice(0, 8)}.`, { exact: false })).toBeVisible();
    await shot(page, '05-escalated');

    // The real rows: a Report with no reporter account, the admin's severity, the audit entry with the reason.
    const report = await db().report.findUnique({ where: { id: reportId } });
    expect(report.targetType).toBe('enquiry');
    expect(report.targetId).toBe(main.id);
    expect(report.reporterId).toBeNull();
    expect(report.reporterContactEmail).toBe(main.email.toLowerCase());
    expect(report.severity).toBe('high');
    expect(report.concernsMinor).toBe(false);
    expect(report.status).toBe('open');
    const audit = await db().adminActionLog.findFirst({ where: { action: 'contact_enquiry.escalated', targetId: main.id } });
    expect(audit.notes).toContain('The message describes a safety concern.');
    await page.context().close();
  });

  test('the escalated report is in the Moderation Queue and opens as an enquiry report: no reported user, no hold actions', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation`);
    // The queue lists it as a Contact enquiry from Contact Us (not as a public report). Its "reported" cell is the
    // enquiry's id, since an enquiry report's target is the enquiry.
    const row = page.locator('.mod-table__row', { hasText: main.id.slice(0, 8) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Contact enquiry');
    await expect(row).toContainText('Contact Us');
    await expect(row).not.toContainText('Public report');
    await row.getByRole('link', { name: 'Review ›' }).click();

    await expect(page.getByRole('heading', { name: `Report #${reportId.slice(0, 8)}` })).toBeVisible();
    const card = page.getByRole('region', { name: 'Reported enquiry' });
    await expect(card).toContainText('From Contact Us');
    await expect(card).toContainText(main.subject);
    await expect(card).toContainText(main.name);
    await expect(card).toContainText(main.email);
    await expect(card).toContainText('stuck at 0–0 since half time');
    await expect(page.getByRole('region', { name: 'Report details' })).toContainText('High');
    for (const name of ['Reporter acted in bad faith', 'Legal hold', 'Remove Content', 'Suspend User']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('link', { name: `View enquiry #${main.id.slice(0, 8)}` })).toHaveAttribute(
      'href',
      `/moderation/contact-enquiries/${main.id}`,
    );
    await shot(page, '06-report-from-enquiry');

    // Dismiss it: back to the queue, the report is dismissed, and nobody is notified (no reported user, no reporter account).
    const before = await db().notification.count({ where: { type: 'moderation_decision' } });
    await page.getByRole('button', { name: 'Dismiss Report' }).click();
    await expect(page).toHaveURL(`${URLS.admin}/moderation`);
    const dismissed = await db().report.findUnique({ where: { id: reportId } });
    expect(dismissed.status).toBe('reviewed');
    expect(dismissed.actionTaken).toBe('dismissed');
    expect(await db().notification.count({ where: { type: 'moderation_decision' } })).toBe(before);
    await page.context().close();
  });

  test('a second escalation of the same enquiry is refused by the server (the button is gone in the UI)', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/contact-enquiries/${main.id}`);
    await expect(page.getByRole('link', { name: `View report #${reportId.slice(0, 8)}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Escalate to a report' })).toHaveCount(0);
    const res = await api('POST', `/admin/contact-enquiries/${main.id}/escalate`, {
      token: await getAdminToken(),
      body: { severity: 'low', concernsMinor: false, reason: 'Trying to escalate it a second time.' },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('contact_enquiry_already_escalated');
    expect(await db().report.count({ where: { targetType: 'enquiry', targetId: main.id } })).toBe(1);
    await page.context().close();
  });

  test('"This concerns a minor" by an admin who is not child-safety vetted shows the restricted notice in the dialog and creates nothing', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await openFromTab(page, minor);
    await page.getByRole('button', { name: 'Escalate to a report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Escalate to a report' });
    await dialog.getByLabel(/This concerns a minor/).check();
    await dialog.getByLabel('Reason (required)').fill('The sender says the account holder is a child.');
    await dialog.getByRole('button', { name: 'Escalate to a report' }).click();

    await expect(page.getByText('Restricted — child-safety vetting required')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Escalate to a report' })).toBeVisible();
    await expect(page.getByLabel('Reason (required)')).toHaveCount(0);
    await shot(page, '07-escalate-restricted');
    // Nothing was created.
    expect((await db().contactEnquiry.findUnique({ where: { id: minor.id } })).escalatedReportId).toBeNull();
    expect(await db().report.count({ where: { targetType: 'enquiry', targetId: minor.id } })).toBe(0);

    // Close: the page behind still offers the action.
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Escalate to a report' })).toBeVisible();
    await page.context().close();
  });
});
