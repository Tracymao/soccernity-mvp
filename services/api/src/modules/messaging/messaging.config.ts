import { DEFAULT_MESSAGE_RETENTION_MONTHS } from './messaging.constants';

export interface ConfigReader {
  get(key: string): string | undefined;
}

export interface MessagingConfig {
  retentionMonths: number;
}

// A positive whole number, else the default: a blank, zero, negative or non-numeric value never silently
// disables the retention clock (same rule as contact.config.ts).
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
}

// The name is spelled out as a literal so src/env-completeness.spec.ts (B-018) can see it.
export function readMessagingConfig(config: ConfigReader): MessagingConfig {
  return {
    retentionMonths: positiveInt(config.get('MESSAGE_RETENTION_MONTHS'), DEFAULT_MESSAGE_RETENTION_MONTHS),
  };
}
