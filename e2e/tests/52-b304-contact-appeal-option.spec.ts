import { test, expect } from '@playwright/test';
import { adminPage } from '../support/admin-ui';
import { COPY_TAG, db, tagged, uniqueEmail } from '../support/helpers';
import { URLS } from '../support/stack';

// B-304 (a): the seventh Contact Us option, "Appeal a suspension" (B-298, Decision Log #492), in real Chrome against
// the real API, Postgres and Redis. The option label and the helper line carry the literal pending-copy tag in the
// RENDERED text (Decision Log #497, B-301); the admin inbox label does not.
//   web:   apps/web/src/pages/ContactPage.tsx (CATEGORY_LABELS line 53-60, helper block ~line 318)
//   admin: apps/admin/src/api/contactEnquiries.ts (contactCategoryLabel), ContactEnquiriesPage.tsx
test.use({ viewport: { width: 1440, height: 1100 } });

const RUN = Date.now().toString(36);
const APPEAL_LABEL = 'Appeal a suspension';
const HELPER = 'Use the email address your Soccernity account is registered with so we can find it.';

test.describe.serial('Contact Us: the seventh option, Appeal a suspension', () => {
  const email = uniqueEmail('b304-appeal');
  const subject = `Please look at my suspension (${RUN})`;
  const name = `Adaeze Appeal ${RUN}`;

  test('the dropdown lists seven options, the seventh is Appeal a suspension followed by the tag', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('combobox', { name: 'Category' }).click();
    const options = page.getByRole('listbox', { name: 'Category' }).getByRole('option');
    await expect(options).toHaveCount(7);
    const labels = (await options.allTextContents()).map((t) => t.trim());
    expect(labels.slice(0, 6)).toEqual([
      'Technical issues',
      'Editorial Complaints',
      'Data',
      'Suggestions',
      'Enquiries',
      'Feedback',
    ]);
    // The seventh (last) option is the appeal one and ends with the literal tag.
    expect(labels[6]).toBe(tagged(APPEAL_LABEL));
    expect(labels[6].endsWith(COPY_TAG)).toBe(true);
    // No other option carries the tag.
    for (const l of labels.slice(0, 6)) expect(l).not.toContain(COPY_TAG);
  });

  test('choosing it shows the helper line with the tag chip; choosing another category removes it', async ({ page }) => {
    await page.goto('/contact');
    const helper = page.locator('.contact-page__helper');
    await expect(helper).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: tagged(APPEAL_LABEL), exact: true }).click();
    await expect(helper).toHaveText(HELPER);
    // The chip beside the helper is the same tag chip the form notice uses.
    const block = page.locator('.contact-page__helper-block');
    await expect(block.locator('.contact-page__tag')).toHaveText(COPY_TAG);

    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'Data', exact: true }).click();
    await expect(page.locator('.contact-page__helper')).toHaveCount(0);
    await expect(page.locator('.contact-page__helper-block')).toHaveCount(0);
  });

  test('submitting stores the row with category suspension_appeal', async ({ page }) => {
    await page.goto('/contact');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: tagged(APPEAL_LABEL), exact: true }).click();
    await page.getByLabel('Subject', { exact: true }).fill(subject);
    await page.getByLabel('Message', { exact: true }).fill('My account was suspended and I would like a person to look at it again.');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible();

    const row = await db().contactEnquiry.findFirst({ where: { email: email.toLowerCase() } });
    expect(row).toBeTruthy();
    expect(row.category).toBe('suspension_appeal');
    expect(row.subject).toBe(subject);
    // The stored subject and message never carry the tag (it is only part of the rendered option label).
    expect(row.subject).not.toContain(COPY_TAG);
  });

  test('the admin inbox shows the label Appeal a suspension, without the tag, and the Category filter finds it', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation`);
    await page.getByRole('link', { name: 'Contact enquiries', exact: true }).click();
    await expect(page).toHaveURL(`${URLS.admin}/moderation/contact-enquiries`);

    const row = page.locator('[role="row"]', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(APPEAL_LABEL);
    await expect(row).not.toContainText(COPY_TAG);

    // The filter offers the seventh category and narrows the list to it.
    const filter = page.getByLabel('Category');
    await expect(filter.locator('option')).toContainText([
      'All',
      'Technical issues',
      'Editorial Complaints',
      'Data',
      'Suggestions',
      'Enquiries',
      'Feedback',
      APPEAL_LABEL,
    ]);
    await filter.selectOption('suspension_appeal');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.locator('[role="row"]', { hasText: name })).toBeVisible();

    // The detail page names the category the same way, untagged.
    await page.getByRole('link', { name: `Open enquiry from ${name}: ${subject}` }).click();
    await expect(page.getByRole('heading', { name: /^Enquiry #/ })).toBeVisible();
    await expect(page.getByText(APPEAL_LABEL, { exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(`${APPEAL_LABEL} ${COPY_TAG}`);
    await page.context().close();
  });
});
