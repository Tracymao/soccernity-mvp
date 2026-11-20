import {
  DEFAULT_CONTACT_ENQUIRY_RETENTION_MONTHS,
  DEFAULT_CONTACT_EMAIL_RATE_LIMIT_MAX,
  DEFAULT_CONTACT_EMAIL_RATE_LIMIT_WINDOW_MS,
  DEFAULT_SUPPORT_INBOX_EMAIL,
} from './contact.constants';

export interface ConfigReader {
  get(key: string): string | undefined;
}

export interface ContactConfig {
  supportInboxEmail: string;
  retentionMonths: number;
  emailRateLimitMax: number;
  emailRateLimitWindowMs: number;
}

// A positive whole number, else the default: a blank, zero, negative or non-numeric value never silently
// disables a limit or the retention clock (same rule as auth-limits.config.ts).
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
}

// Every name is spelled out as a literal so src/env-completeness.spec.ts (B-018) can see it.
export function readContactConfig(config: ConfigReader): ContactConfig {
  const inbox = config.get('SUPPORT_INBOX_EMAIL')?.trim();
  return {
    supportInboxEmail: inbox ? inbox : DEFAULT_SUPPORT_INBOX_EMAIL,
    retentionMonths: positiveInt(config.get('CONTACT_ENQUIRY_RETENTION_MONTHS'), DEFAULT_CONTACT_ENQUIRY_RETENTION_MONTHS),
    emailRateLimitMax: positiveInt(config.get('CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_MAX'), DEFAULT_CONTACT_EMAIL_RATE_LIMIT_MAX),
    emailRateLimitWindowMs: positiveInt(
      config.get('CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_WINDOW_MS'),
      DEFAULT_CONTACT_EMAIL_RATE_LIMIT_WINDOW_MS,
    ),
  };
}
