// `npm run email:preview [-- <outDir>]`: renders every email template with sample data to <outDir>/<template>.html
// (default /tmp/email-previews). Writes files only: no network, no send, no database, no .env.
// WEB_APP_BASE_URL, if set in the shell, is where the previews load the logo from.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { renderPasswordResetHtml } from '../modules/auth/password-reset/email/password-reset-email.service';
import { RegistrationEmailTemplate, renderEmailHtml } from '../modules/auth/registration/email/registration-email.service';
import { emailSamples } from './email-preview-samples';

const outDir = process.argv[2] ?? '/tmp/email-previews';
const base = process.env.WEB_APP_BASE_URL?.trim() || 'https://app.soccernity.com';
const samples = emailSamples(base);

mkdirSync(outDir, { recursive: true });
for (const template of Object.keys(samples) as RegistrationEmailTemplate[]) {
  writeFileSync(join(outDir, `${template}.html`), renderEmailHtml({ template, ...samples[template] }, base));
}
writeFileSync(
  join(outDir, 'password-reset.html'),
  renderPasswordResetHtml('Reset your Soccernity password', `${base}/reset-password?token=sample`, base),
);
console.log(`Wrote ${Object.keys(samples).length + 1} email previews to ${outDir}`);
