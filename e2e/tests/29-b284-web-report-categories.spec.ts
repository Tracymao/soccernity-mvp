import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-284 (Decision Log #465): the reason category on the two web report forms, in real Chrome against the real
// API, Postgres and Redis. Scoped to this work: the in-app report dialog on a post page (category required,
// description optional except for "Other", keyboard) and the public /report page. Every report is read back
// from Postgres. The app runs under React StrictMode here, so every test also fails on a page error or an app
// console error.
test.use({ viewport: { width: 1280, height: 1000 } });

// A request the browser itself logs as a failed load (404 / 429) is an expected error state, not an app error.
function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource/.test(msg.text())) return;
    problems.push(`console.error: ${msg.text()}`);
  });
  return problems;
}

type Member = Account & { token: string };

async function member(label: string): Promise<Member> {
  const a = await registerViaApi({ age: 30, label, displayName: `Report ${label}` });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const res = await api('PATCH', `/users/${a.userId}`, { token, body: { username: uniqueUsername(label) } });
  expect(res.status).toBe(200);
  return { ...a, token };
}

async function makePost(author: Member, text: string): Promise<string> {
  const res = await api('POST', '/posts', { token: author.token, body: { contentText: text } });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

test.describe.serial('B-284: report categories on the web forms', () => {
  let author: Member;
  let viewer: Member;
  let postA: string;
  let postB: string;

  test.beforeAll(async () => {
    author = await member('rcauthor');
    viewer = await member('rcviewer');
    postA = await makePost(author, 'Report QA: a post to report with a category');
    postB = await makePost(author, 'Report QA: a post to report as Other');
  });

  test('in-app: the dialog lists the nine categories; a category alone is enough; the row is stored', async ({ page }) => {
    const problems = watchErrors(page);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${postA}`);
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.getByRole('button', { name: 'Report post' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Report this post' })).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(9);
    await expect(dialog.getByRole('radio').first()).toBeFocused();
    const submit = dialog.getByRole('button', { name: 'Submit report' });
    await expect(submit).toBeDisabled();

    await dialog.getByRole('radio', { name: 'Spam or scam' }).check();
    await expect(dialog.getByLabel('Details (optional)')).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog.getByText('Reported — thanks')).toBeVisible();
    await expect(dialog.getByText('Our team will review it.')).toBeVisible();
    const row = await db().report.findFirst({ where: { reporterId: viewer.userId, targetType: 'post', targetId: postA } });
    expect(row).toBeTruthy();
    expect(row.reasonCategory).toBe('spam_or_scam');
    expect(row.reason).toBe(''); // no description: stored as the empty string
    expect(row.concernsMinor).toBe(false);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('in-app: Other needs a description; a written description is stored with the category', async ({ page }) => {
    const problems = watchErrors(page);
    await signIn(page, viewer.email);
    await page.goto(`/posts/${postB}`);
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.getByRole('button', { name: 'Report user' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Report this user' })).toBeVisible();
    await dialog.getByRole('radio', { name: 'Other' }).check();
    await expect(dialog.getByLabel('Details (required)')).toBeVisible();
    await expect(dialog.getByText('Details are required when you choose Other.')).toBeVisible();
    const submit = dialog.getByRole('button', { name: 'Submit report' });
    await expect(submit).toBeDisabled();

    await dialog.getByLabel('Details (required)').fill('   ');
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Details (required)').fill('  Pretending to be my coach  ');
    await expect(dialog.getByText('29 / 500')).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog.getByText('Reported — thanks')).toBeVisible();

    const row = await db().report.findFirst({ where: { reporterId: viewer.userId, targetType: 'user', targetId: author.userId } });
    expect(row).toBeTruthy();
    expect(row.reasonCategory).toBe('other');
    expect(row.reason).toBe('Pretending to be my coach');
    expect(problems).toEqual([]);
  });

  test('in-app: keyboard. Arrow keys move through the categories, Escape closes and focus returns to Report', async ({ page }) => {
    const problems = watchErrors(page);
    const second = await member('rckeys');
    const postC = await makePost(second, 'Report QA: a post for the keyboard test');
    await signIn(page, viewer.email);
    await page.goto(`/posts/${postC}`);
    const trigger = page.getByRole('button', { name: 'Report', exact: true });
    await trigger.click();
    await page.getByRole('button', { name: 'Report post' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('radio', { name: 'Hate or abusive language' })).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('radio', { name: 'Threats or violence' })).toBeChecked();

    // Tab stays inside the dialog: after enough Tabs focus is still within it.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await db().report.count({ where: { reporterId: viewer.userId, targetId: postC } })).toBe(0);
    expect(problems).toEqual([]);
  });

  test('public /report: the category step, a stored report with no reporter account, and the 404 state', async ({ page }) => {
    const problems = watchErrors(page);
    const email = `public-${Date.now()}@example.com`;
    await page.goto('/report');
    await expect(page.getByRole('heading', { name: 'Report a concern' })).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(9);

    await page.getByLabel('Your email').fill(email);
    await page.getByLabel('Where can we find it?').fill('00000000-0000-4000-8000-000000000000');
    const submit = page.getByRole('button', { name: 'Submit report' });
    await expect(submit).toBeDisabled(); // no category yet
    await page.getByRole('radio', { name: 'Harassment or bullying' }).check();
    await expect(submit).toBeEnabled();

    // A target that does not exist: the server's 404 sentence, nothing stored, the form kept.
    await submit.click();
    await expect(page.getByRole('alert')).toContainText(/not found/i);
    await expect(page.getByRole('radio', { name: 'Harassment or bullying' })).toBeChecked();
    expect(await db().report.count({ where: { reporterContactEmail: email } })).toBe(0);

    // A real target, with a description.
    await page.getByLabel('Where can we find it?').fill(postA);
    await page.getByLabel('Details (optional)').fill('Keeps targeting a young player.');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Report submitted' })).toBeVisible();

    const row = await db().report.findFirst({ where: { reporterContactEmail: email } });
    expect(row).toBeTruthy();
    expect(row.reporterId).toBeNull();
    expect(row.reasonCategory).toBe('harassment_or_bullying');
    expect(row.reason).toBe('Keeps targeting a young player.');
    expect(row.targetId).toBe(postA);
    expect(problems).toEqual([]);
  });

  test('public /report: Other waits for a description, and the sent report keeps it', async ({ page }) => {
    const problems = watchErrors(page);
    const email = `public-other-${Date.now()}@example.com`;
    await page.goto('/report');
    await page.getByLabel('Your email').fill(email);
    await page.getByLabel('Where can we find it?').fill(postB);
    await page.getByRole('radio', { name: 'Other' }).check();
    const submit = page.getByRole('button', { name: 'Submit report' });
    await expect(page.getByLabel('Details (required)')).toBeVisible();
    await expect(submit).toBeDisabled();
    await page.getByLabel('Details (required)').fill('Something I cannot name here.');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Report submitted' })).toBeVisible();

    const row = await db().report.findFirst({ where: { reporterContactEmail: email } });
    expect(row.reasonCategory).toBe('other');
    expect(row.reason).toBe('Something I cannot name here.');
    expect(problems).toEqual([]);
  });
});
