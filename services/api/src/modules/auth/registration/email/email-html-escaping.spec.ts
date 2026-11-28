// CH-H19: no value placed into an email HTML body can become markup. Driven from the sample map, whose Record type
// forces an entry for every RegistrationEmailTemplate member.
import { readFileSync } from 'fs';
import { join } from 'path';
import { emailSamples } from '../../../../scripts/email-preview-samples';
import { renderPasswordResetHtml } from '../../password-reset/email/password-reset-email.service';
import { escapeHtml } from './escape-html';
import { RegistrationEmailTemplate, renderEmailHtml } from './registration-email.service';

const BASE = 'https://app.soccernity.com';
const HOSTILE = `<img src=x onerror=alert(1)>"'&`;
const HOSTILE_URL = `${BASE}/x?a=1&b=${HOSTILE}`;

type Data = Record<string, string>;
const samples = emailSamples(BASE);
const cases: [string, RegistrationEmailTemplate, Data][] = (Object.keys(samples) as RegistrationEmailTemplate[]).map(
  (t) => [t, t, samples[t].data],
);
cases.push(['appeal-decision (overturned)', 'appeal-decision', { decision: 'overturned' }]);

const fill = (data: Data, value: string): Data =>
  Object.fromEntries(Object.keys(data).map((k) => [k, k === 'decision' ? data[k] : value]));

const render = (template: RegistrationEmailTemplate, data: Data, subject = 'x'): string =>
  renderEmailHtml({ template, data, subject }, BASE);

const tags = (html: string): string[] => html.match(/<[^>]*>/g) ?? [];
const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
const hrefs = (html: string): string[] => [...html.matchAll(/ href="([^"]*)"/g)].map((m) => m[1]);

function expectInert(html: string, benign: string): void {
  expect(html).not.toContain('<img src=x');
  // Quoted attribute values are removed first: an escaped value cannot close its quotes, so what is inside is inert.
  for (const tag of tags(html)) expect(tag.replace(/"[^"]*"/g, '""')).not.toContain('onerror');
  // Same number of "<" as with harmless values: every one belongs to the layout or the template.
  expect(html.split('<').length).toBe(benign.split('<').length);
}

describe('email HTML escaping', () => {
  it.each(cases)('%s: the sample supplies every value the template reads', (_name, template, data) => {
    const read = new Set<string>();
    render(
      template,
      new Proxy(data, {
        get(target, key: string) {
          read.add(key);
          return target[key];
        },
      }),
    );
    expect([...read].filter((k) => !(k in data))).toEqual([]);
  });

  it.each(cases)('%s: a hostile value and subject stay text', (_name, template, data) => {
    expectInert(render(template, fill(data, HOSTILE), HOSTILE), render(template, fill(data, 'x')));
  });

  it.each(cases)('%s: links stay one escaped URL', (_name, template, data) => {
    const html = render(template, fill(data, HOSTILE_URL));
    expectInert(html, render(template, fill(data, `${BASE}/x`)));
    for (const href of hrefs(html)) {
      expect(href).not.toMatch(/[<>']|&(?!amp;|lt;|gt;|quot;|#39;)/);
      expect(decode(href)).toBe(HOSTILE_URL);
      expect(new URL(decode(href)).origin).toBe(BASE);
    }
    expect(hrefs(html).length).toBe(hrefs(render(template, data)).length);
  });

  it('password-reset: a hostile subject and link stay text', () => {
    const benign = renderPasswordResetHtml('x', `${BASE}/x`, BASE);
    const html = renderPasswordResetHtml(HOSTILE, HOSTILE_URL, BASE);
    expectInert(html, benign);
    expect(hrefs(html)).toEqual([escapeHtml(HOSTILE_URL)]);
    expectInert(renderPasswordResetHtml(HOSTILE, HOSTILE, BASE), benign);
  });

  it('keeps the visible wording for a normal name and link', () => {
    const visible = (template: RegistrationEmailTemplate, data: Data): string =>
      decode(
        render(template, data)
          .split('</h1>')[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' '),
      )
        .replace(/\s+/g, ' ')
        .trim();
    const link = `${BASE}/go?token=tok-1`;

    expect(visible('welcome', { firstName: 'Ada', link })).toContain(
      'Hi Ada, Your email is verified and your account is ready. Welcome aboard.',
    );
    expect(visible('verify-email', { link })).toContain(
      `Verify your Soccernity email address: Verify my email If the button does not work, copy this link into your browser: ${link} If you did not request this, you can safely ignore this email.`,
    );
    expect(
      visible('guardian-consent', { minorDisplayName: 'Ada', link, withdrawalPageLink: `${BASE}/withdraw` }),
    ).toContain(
      `Ada has registered for a Soccernity account and listed you as their guardian. To review and respond to the request (no account needed): Review the request If the button does not work, copy this link into your browser: ${link} If you approve and later change your mind, you can withdraw your consent at any time.`,
    );
  });

  // A bare ${data.x} (or string concatenation) in the HTML builder fails here, before any sample is involved.
  it('the HTML builder has no unescaped interpolation', () => {
    const source = readFileSync(join(__dirname, 'registration-email.service.ts'), 'utf8');
    const start = source.indexOf('function renderHtmlBody(');
    const body = source.slice(start, source.indexOf('SUSPENSION_GENERIC_REASON_LINE', start)).replace(/\/\/ .*$/gm, '');
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('escapeHtml(data.');
    expect(body.match(/\$\{\s*data\.\w+\s*(\}|\|\||\?\?|\+)|\+\s*data\.\w+|\bdata\.\w+\s*\+/g)).toBeNull();
  });
});
