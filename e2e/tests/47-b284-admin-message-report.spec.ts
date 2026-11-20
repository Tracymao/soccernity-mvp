import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { ADMIN_CREDENTIALS, URLS } from '../support/stack';

// B-284 slice: a report about a chat message in the Admin Console (backend/b067-message-report), in real Chrome
// against the real API, Postgres and Redis. Scoped to this work: the Moderation Queue row for a message report (the
// "Message" label, never the message text) and Report Detail for the three states of the reported message (as sent,
// edited, deleted for everyone) plus the "message is gone" state. Messages are made and edited through the real
// messaging routes and reported through the real POST /reports by the person who received them.
test.use({ viewport: { width: 1440, height: 1184 } });

// Screenshots for the visual check against the Figma frames R11 7011:57380, R12 7011:57551, R13 7011:57728.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b284-admin-message-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string): Promise<Verified> {
  const a = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const username = uniqueUsername(label);
  expect((await api('PATCH', `/users/${a.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...a, token, username };
}

async function reportMessage(reporter: Verified, messageId: string, body: { reasonCategory: string; reason?: string }) {
  const res = await api('POST', '/reports', {
    token: reporter.token,
    body: { targetType: 'message', targetId: messageId, ...body },
  });
  if (res.status !== 201) throw new Error(`POST /reports failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

test.describe.serial('admin: reports about a chat message', () => {
  let sender: Verified;
  let reporter: Verified;
  let conversationId = '';
  const PLAIN = `Plain message ${RUN}: see you at training`;
  const EDITED_NOW = `Edited message ${RUN}: sorry, training is at 7am`;
  const EDITED_FIRST = `First text ${RUN}: you are useless, quit the team`;
  const DELETED = `Deleted message ${RUN}: stop messaging me`;
  const GONE = `Gone message ${RUN}: this row will be removed`;
  let plainMsg = '';
  let editedMsg = '';
  let deletedMsg = '';
  let goneMsg = '';
  let plainReport = '';
  let editedReport = '';
  let deletedReport = '';
  let goneReport = '';

  test.beforeAll(async () => {
    sender = await verifiedAdult('mr-sender');
    reporter = await verifiedAdult('mr-reporter');
    const started = await api('POST', '/conversations', { token: sender.token, body: { recipientId: reporter.userId } });
    expect([200, 201]).toContain(started.status);
    conversationId = started.body.id as string;

    const send = async (text: string) => {
      const r = await api('POST', `/conversations/${conversationId}/messages`, { token: sender.token, body: { contentText: text } });
      expect([200, 201]).toContain(r.status);
      return r.body.id as string;
    };
    plainMsg = await send(PLAIN);
    editedMsg = await send(EDITED_FIRST);
    deletedMsg = await send(DELETED);
    goneMsg = await send(GONE);

    // The sender edits one message (inside the 15 minutes); another is reported and then deleted for everyone.
    const edit = await api('PATCH', `/conversations/${conversationId}/messages/${editedMsg}`, {
      token: sender.token,
      body: { contentText: EDITED_NOW },
    });
    expect(edit.status).toBe(200);
    plainReport = await reportMessage(reporter, plainMsg, { reasonCategory: 'harassment_or_bullying', reason: 'Insults the player each week.' });
    editedReport = await reportMessage(reporter, editedMsg, { reasonCategory: 'hate_or_abusive_language' });
    deletedReport = await reportMessage(reporter, deletedMsg, { reasonCategory: 'threats_or_violence' });
    // The sender deletes it for everyone AFTER it was reported (a message deleted before cannot be reported at all).
    const del = await api('DELETE', `/conversations/${conversationId}/messages/${deletedMsg}?scope=everyone`, { token: sender.token });
    expect(del.status).toBe(204);
    goneReport = await reportMessage(reporter, goneMsg, { reasonCategory: 'spam_or_scam' });
    // A message row that no longer exists (nothing does this in the product; the report must still open).
    await db().message.delete({ where: { id: goneMsg } });
  });

  test('the queue labels the row "Message" and never shows the message text; Review opens the detail with the message', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation`);
    const row = page.locator('.mod-table__row', { hasText: plainMsg.slice(0, 8) });
    await expect(row).toContainText('Message');
    await expect(row).toContainText('Harassment or bullying');
    for (const text of [PLAIN, EDITED_NOW, EDITED_FIRST, DELETED]) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
    // No tooltip anywhere on the queue carries message text.
    const titles = await page.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''));
    for (const t of titles) expect(t).not.toContain(`${RUN}:`);
    await shot(page, '01-queue');

    // Review hands the queue row over (no message on it); the page then reads the message.
    await row.getByRole('link', { name: /Review/ }).click();
    await expect(page).toHaveURL(new RegExp(`/moderation/reports/${plainReport}$`));
    await expect(page.getByText(PLAIN)).toBeVisible();
    await page.context().close();
  });

  test('a message report shows Type, Sender, Sent and the message text, and says what Remove Content does', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/reports/${plainReport}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    const content = page.locator('.mod-card', { hasText: 'Reported content' });
    await expect(content.locator('.mod-field', { hasText: 'Type' }).locator('.mod-field__value')).toHaveText('Message');
    await expect(content.locator('.mod-field', { hasText: 'Sender' }).locator('.mod-field__value')).toHaveText(sender.username);
    await expect(content.locator('.mod-field', { hasText: 'Sent' }).locator('.mod-field__value')).toContainText(/\d{4}/);
    await expect(content.locator('.mod-field', { hasText: 'Message text' }).locator('.mod-message-text')).toHaveText(PLAIN);
    await expect(content.locator('.mod-field__label', { hasText: 'Edited' })).toHaveCount(0);
    await expect(content.locator('.mod-field__label', { hasText: 'Message status' })).toHaveCount(0);

    // Nothing offers to delete the message, and the note says what Remove Content does.
    await expect(page.getByRole('button', { name: /delete message/i })).toHaveCount(0);
    await expect(page.getByText(/Remove Content hides it from everyone but you and the other moderators/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Content' })).toBeVisible();
    // The page title and heading carry no message text.
    expect(await page.title()).not.toContain(RUN);
    await expect(page.getByRole('heading', { name: /^Report #/ })).not.toContainText(RUN);
    await shot(page, '02-detail-message');
    await page.context().close();
  });

  test('an edited message shows the Edited line, the current text and the original text', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/reports/${editedReport}`);
    const content = page.locator('.mod-card', { hasText: 'Reported content' });
    await expect(content.locator('.mod-field', { hasText: 'Edited' }).locator('.mod-field__value')).toContainText(/^Yes, at /);
    await expect(content.locator('.mod-field', { hasText: 'Message text (current)' }).locator('.mod-message-text')).toHaveText(EDITED_NOW);
    await expect(content.locator('.mod-field', { hasText: 'Original text (before the edit)' }).locator('.mod-message-text')).toHaveText(EDITED_FIRST);
    await shot(page, '03-detail-edited');
    await page.context().close();
  });

  test('a message deleted for everyone shows the status and keeps its text for review', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/reports/${deletedReport}`);
    const content = page.locator('.mod-card', { hasText: 'Reported content' });
    await expect(content.locator('.mod-field', { hasText: 'Message status' }).locator('.mod-field__value')).toHaveText('Deleted by the sender');
    await expect(content.locator('.mod-field', { hasText: 'Message text' }).locator('.mod-message-text')).toHaveText(DELETED);
    await shot(page, '04-detail-deleted');
    await page.context().close();
  });

  // Since PR #730 (B-297) and PR #721 (B-293) a report whose Message row is gone counts as "a child may be involved"
  // (fail closed), so only a child-safety-vetted admin may act on it. The QA admin is not vetted by default, so this
  // test vets it for its own run and puts it back exactly as found in `finally`, so no later spec inherits the change.
  // The unvetted refusal itself is proved by the B-304 spec on hidden context and vetting.
  test('a message that is gone says so and the rest of the report still shows and can be dismissed', async ({ browser }) => {
    const admin = await db().adminUser.findUnique({ where: { email: ADMIN_CREDENTIALS.email } });
    const before = {
      childSafetyVetted: admin.childSafetyVetted,
      vettedAt: admin.vettedAt,
      vettedByAdminId: admin.vettedByAdminId,
    };
    await db().adminUser.update({
      where: { id: admin.id },
      data: { childSafetyVetted: true, vettedAt: new Date(), vettedByAdminId: admin.id },
    });
    try {
      const page = await adminPage(browser);
      await page.goto(`${URLS.admin}/moderation/reports/${goneReport}`);
      await expect(page.getByText('The reported message is no longer available.')).toBeVisible();
      const details = page.locator('.mod-card', { hasText: 'Report details' });
      await expect(details.locator('.mod-field', { hasText: 'Reason category' }).locator('.mod-field__value')).toHaveText('Spam or scam');
      await shot(page, '05-detail-gone');

      await page.getByRole('button', { name: 'Dismiss Report' }).click();
      await expect(page).toHaveURL(`${URLS.admin}/moderation`);
      expect((await db().report.findUnique({ where: { id: goneReport } })).status).toBe('reviewed');
      await page.context().close();
    } finally {
      await db().adminUser.update({ where: { id: admin.id }, data: before });
    }
  });
});
