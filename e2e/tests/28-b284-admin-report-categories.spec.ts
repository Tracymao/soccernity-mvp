import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, registerViaApi, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// B-284 (Decision Log #465): the report reason category in the Admin Console, in real Chrome against the real API,
// Postgres and Redis. Scoped to this work: the Moderation Queue column, Report Detail (Reason category and
// Description) and the Reports group of admin search (REASON CATEGORY column, the "Reason category" matched-on label,
// and the reporter's free text never being searched). Reports are made through the real POST /reports with a
// reasonCategory (the field the backend now requires); one is then set back to "no category" in Postgres to stand
// for a report made before categories existed.
//
// Appeal Review shows the same two rows; it is covered by unit tests (an appealed report needs a second admin to
// decide, which this spec does not set up).
test.use({ viewport: { width: 1440, height: 1184 } });

// Screenshots for the visual check against the Figma frames (6947:40930 queue, 6947:41119 detail, 6947:41433 search).
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b284-admin-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);

async function reportAgainst(
  reporter: Account,
  target: Account,
  body: { reasonCategory: string; reason?: string },
): Promise<string> {
  const res = await api('POST', '/reports', {
    token: reporter.accessToken,
    body: { targetType: 'user', targetId: target.userId, ...body },
  });
  if (res.status !== 201) throw new Error(`POST /reports failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

/** The queue row for a report about this user (the queue shows the reported id's first 8 characters). */
function queueRow(page: Page, target: Account) {
  return page.locator('.mod-table__row', { hasText: target.userId.slice(0, 8) });
}

async function searchFor(page: Page, text: string): Promise<void> {
  const bar = page.getByRole('textbox', { name: 'Search Soccernity' });
  await bar.fill(text);
  await bar.press('Enter');
}

test.describe.serial('admin: report reason categories', () => {
  let reporter: Account;
  let harassed: Account;
  let otherTarget: Account;
  let oldTarget: Account;
  let spamTarget: Account;
  let harassmentId = '';
  let otherId = '';
  let oldId = '';
  let spamId = '';
  const DESCRIPTION = `Insults the player every week ${RUN}`;
  const SECRET_WORD = `zzdesc${RUN}`;

  test.beforeAll(async () => {
    reporter = await registerViaApi({ age: 30, label: 'rc-reporter' });
    harassed = await registerViaApi({ age: 30, label: 'rc-harassed' });
    otherTarget = await registerViaApi({ age: 30, label: 'rc-other' });
    oldTarget = await registerViaApi({ age: 30, label: 'rc-old' });
    spamTarget = await registerViaApi({ age: 30, label: 'rc-spam' });
    harassmentId = await reportAgainst(reporter, harassed, { reasonCategory: 'harassment_or_bullying', reason: DESCRIPTION });
    otherId = await reportAgainst(reporter, otherTarget, { reasonCategory: 'other', reason: `Something else entirely ${RUN}` });
    // Description is optional for every category except "other": no free text at all.
    spamId = await reportAgainst(reporter, spamTarget, { reasonCategory: 'spam_or_scam' });
    // A report made before categories existed: the same row with no category, its old free text kept.
    oldId = await reportAgainst(reporter, oldTarget, { reasonCategory: 'hate_or_abusive_language', reason: `Old free text ${SECRET_WORD}` });
    await db().report.update({ where: { id: oldId }, data: { reasonCategory: null } });
  });

  test('the Moderation Queue column is "Reason category": the label per row, and "Not categorised" for the older report', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation`);
    await expect(page.locator('.mod-table__row--head')).toContainText('Reason category');

    await expect(queueRow(page, harassed)).toContainText('Harassment or bullying');
    await expect(queueRow(page, otherTarget)).toContainText('Other');
    await expect(queueRow(page, spamTarget)).toContainText('Spam or scam');
    await expect(queueRow(page, oldTarget)).toContainText('Not categorised');
    // The reporter's description is not in the row (Report Detail shows it).
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);
    await shot(page, '01-queue');
    await page.context().close();
  });

  test('Report Detail shows Reason category and Description; an older report reads "Not categorised" with its old text', async ({ browser }) => {
    const page = await adminPage(browser);

    await page.goto(`${URLS.admin}/moderation/reports/${harassmentId}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    const details = page.locator('.mod-card', { hasText: 'Report details' });
    await expect(details.locator('.mod-field', { hasText: 'Reason category' }).locator('.mod-field__value')).toHaveText('Harassment or bullying');
    await expect(details.locator('.mod-field', { hasText: 'Description' }).locator('.mod-field__value')).toHaveText(DESCRIPTION);
    await shot(page, '02-detail');

    // A category with no description: no Description row at all.
    await page.goto(`${URLS.admin}/moderation/reports/${spamId}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    const spamDetails = page.locator('.mod-card', { hasText: 'Report details' });
    await expect(spamDetails.locator('.mod-field', { hasText: 'Reason category' }).locator('.mod-field__value')).toHaveText('Spam or scam');
    await expect(spamDetails.locator('.mod-field__label', { hasText: 'Description' })).toHaveCount(0);

    await page.goto(`${URLS.admin}/moderation/reports/${oldId}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    const oldDetails = page.locator('.mod-card', { hasText: 'Report details' });
    await expect(oldDetails.locator('.mod-field', { hasText: 'Reason category' }).locator('.mod-field__value')).toHaveText('Not categorised');
    await expect(oldDetails.locator('.mod-field', { hasText: 'Description' }).locator('.mod-field__value')).toHaveText(`Old free text ${SECRET_WORD}`);
    await shot(page, '03-detail-older-report');
    await page.context().close();
  });

  test('search finds a report by its category and shows REASON CATEGORY and "Reason category" as the match', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/search`);
    await expect(
      page.getByText('Email lookups need the full address, for example name@example.com. Reports can be found by reference, username or reason category.'),
    ).toBeVisible();

    await searchFor(page, 'harassment');
    const reports = page.getByRole('table', { name: 'Reports' });
    await expect(reports).toBeVisible();
    const headers = await reports.getByRole('columnheader').allTextContents();
    expect(headers.slice(0, 4)).toEqual(['Report', 'Type', 'Reason category', 'Status']);
    const row = reports.getByRole('row').filter({ hasText: `#${harassmentId.slice(0, 8)}` });
    await expect(row).toContainText('Harassment or bullying');
    await expect(row).toContainText('Reason category');
    // The reporter's description is never in the results.
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);
    await shot(page, '04-search-category');

    // A prefix of another label finds that category's report, and the row opens the report.
    await searchFor(page, 'spam or');
    const spamRow = page.getByRole('table', { name: 'Reports' }).getByRole('row').filter({ hasText: `#${spamId.slice(0, 8)}` });
    await expect(spamRow).toContainText('Spam or scam');
    await spamRow.getByRole('link', { name: /^Review report/ }).click();
    await expect(page).toHaveURL(new RegExp(`/moderation/reports/${spamId}$`));
    await page.context().close();
  });

  test('a word that is only in a report\'s free-text description finds nothing, and a null category reads "Not categorised"', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/search`);
    await searchFor(page, SECRET_WORD);
    await expect(page.getByText('0 results')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Reports' })).toHaveCount(0);

    // The older report, found by its target's report reference, reads "Not categorised".
    await searchFor(page, oldId.slice(0, 8));
    const row = page.getByRole('table', { name: 'Reports' }).getByRole('row').filter({ hasText: `#${oldId.slice(0, 8)}` });
    await expect(row).toContainText('Not categorised');
    await shot(page, '05-search-not-categorised');
    await page.context().close();
  });
});
