// CH-H18: every outgoing HTML email goes through the one branded layout.
import type { ConfigService } from '@nestjs/config';
import { emailSamples } from '../../../../scripts/email-preview-samples';
import { PasswordResetEmailService, renderPasswordResetHtml } from '../../password-reset/email/password-reset-email.service';
import { emailLogoUrl, renderEmailButton } from './email-layout';
import { RegistrationEmailService, RegistrationEmailTemplate, renderEmailHtml } from './registration-email.service';

const mockSendEmail = jest.fn();
jest.mock('postmark', () => ({ ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })) }));

const BASE = 'https://app.soccernity.com';
const LOGO = `${BASE}/email/soccernity-logo-mark.png`;
const samples = emailSamples(BASE);

// Driven from the sample map, whose Record type forces one entry per member of the template union.
const cases: [string, string, string][] = (Object.keys(samples) as RegistrationEmailTemplate[]).map((template) => [
  template,
  samples[template].subject,
  renderEmailHtml({ template, ...samples[template] }, BASE),
]);
cases.push(
  [
    'appeal-decision (overturned)',
    'Your appeal has been reviewed',
    renderEmailHtml(
      { template: 'appeal-decision', subject: 'Your appeal has been reviewed', data: { decision: 'overturned' } },
      BASE,
    ),
  ],
  [
    'password-reset',
    'Reset your Soccernity password',
    renderPasswordResetHtml('Reset your Soccernity password', `${BASE}/reset-password?token=sample`, BASE),
  ],
);

const escaped = (s: string) => s.replace(/'/g, '&#39;');
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

describe('branded email layout', () => {
  it.each(cases)('%s is a full branded document', (_name, subject, html) => {
    expect(html.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(html.endsWith('</body></html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain(`<title>${escaped(subject)}</title>`);
    expect(html).toContain(`>${escaped(subject)}</h1>`);
    expect(html).toContain(`<img src="${LOGO}" alt="Soccernity" width="24" height="25"`);
    expect(html).toContain('>Soccernity</td>');
    expect(html).toContain('border-top:1px dashed');
    expect(html).not.toMatch(/<script|javascript:|<link\b|@import/i);
    expect(html).not.toMatch(/unsubscribe/i);
  });

  it.each(cases)('%s uses nothing Outlook or Gmail drops, and styles its tags inline', (_name, _subject, html) => {
    expect(html).not.toMatch(/display:\s*(inline-)?(flex|grid)|position:|var\(|background-image/i);
    for (const tag of html.match(/<(p|a|ul|li|strong|h1|img|body|div)\b[^>]*>/g) ?? []) expect(tag).toContain('style="');
    expect(count(html, /<table\b/g)).toBe(count(html, /<table role="presentation"/g));
  });

  it.each(cases)('%s links only over https, with escaped values', (_name, _subject, html) => {
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toMatch(/[<>']|&(?!amp;|#39;|quot;|lt;|gt;)/);
    }
  });

  it('adds no link of its own: a template without one still has none', () => {
    for (const template of ['account-reinstated', 'password-changed', 'email-change-unavailable'] as const) {
      const html = renderEmailHtml({ template, ...samples[template] }, BASE);
      expect(html).not.toMatch(/<a |href=/);
    }
  });

  it('the button escapes its label and link', () => {
    const html = renderEmailButton('A "quoted" <label>', `${BASE}/x?a=1&b="<y>`);
    expect(html).toContain('>A &quot;quoted&quot; &lt;label&gt;</a>');
    expect(html).toContain(`href="${BASE}/x?a=1&amp;b=&quot;&lt;y&gt;"`);
    expect(html).not.toContain('<label>');
    expect(html).not.toContain('<y>');
  });

  it('escapes the subject in the title and heading', () => {
    const html = renderEmailHtml({ template: 'account-reinstated', subject: 'A <b> & "c"', data: {} }, BASE);
    expect(html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(html).not.toContain('<b>');
  });

  it('shows the logo image only when the web app base URL can be trusted', () => {
    expect(emailLogoUrl(BASE)).toBe(LOGO);
    expect(emailLogoUrl('http://localhost:5173')).toBe('http://localhost:5173/email/soccernity-logo-mark.png');
    for (const base of [undefined, '', 'replace-me', 'https://app.example', 'http://app.soccernity.com']) {
      const html = renderEmailHtml({ template: 'account-reinstated', ...samples['account-reinstated'] }, base);
      expect(html).not.toContain('<img');
      expect(html).toContain('>Soccernity</td>');
    }
  });

  it('renders the Welcome email with its title, button, sign-off and footer', () => {
    const html = renderEmailHtml({ template: 'welcome', ...samples.welcome }, BASE);
    expect(html).toContain('>Welcome to Soccernity</h1>');
    const button = html.match(/<a href="([^"]*)" style="display:block;[^"]*">Sign in to Soccernity<\/a>/);
    expect(button?.[1]).toBe(`${BASE}/login`);
    expect(html).toContain('See you on the pitch,<br>The Soccernity Team</p>');
    const footer = 'You are receiving this email because you have a Soccernity account.';
    expect(html.split(footer)).toHaveLength(2);
    expect(html.indexOf(footer)).toBeGreaterThan(html.indexOf('border-top:1px dashed'));
  });

  it('is what both senders hand to the provider', async () => {
    const values: Record<string, string> = {
      EMAIL_PROVIDER_API_KEY: 'test-key',
      POSTMARK_FROM_EMAIL: 'no-reply@soccernity.com',
      WEB_APP_BASE_URL: BASE,
    };
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    mockSendEmail.mockResolvedValue({ MessageID: 'm' });
    await new RegistrationEmailService(config).sendAccountReinstatedEmail('a@example.com');
    await new PasswordResetEmailService(config).sendPasswordResetEmail('a@example.com', 'sample');
    for (const [message] of mockSendEmail.mock.calls) {
      expect(message.HtmlBody).toContain('<!doctype html>');
      expect(message.HtmlBody).toContain(LOGO);
    }
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});
