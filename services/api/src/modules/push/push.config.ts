import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VapidDetails {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function isRealValue(value: string | undefined): value is string {
  const v = value?.trim();
  return !!v && v !== 'replace-me';
}

// backend/b285-web-push: reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. Unset, blank or the
// 'replace-me' placeholder in ANY of the three means the feature is unavailable: nothing else breaks and no test
// needs real keys. VAPID_SUBJECT must be a mailto: or https: address (the push services require it); anything else
// is treated as not configured, with ONE warning that names the variable and never a value.
@Injectable()
export class PushConfig {
  private readonly logger = new Logger(PushConfig.name);
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  /** The VAPID details, or null when the feature is unavailable. Read fresh each call (cheap, keeps tests simple). */
  vapid(): VapidDetails | null {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!isRealValue(publicKey) || !isRealValue(privateKey) || !isRealValue(subject)) return null;
    const trimmedSubject = subject.trim();
    if (!/^(mailto:|https:\/\/)/i.test(trimmedSubject)) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn('VAPID_SUBJECT must start with mailto: or https://; web push is unavailable until it does.');
      }
      return null;
    }
    return { publicKey: publicKey.trim(), privateKey: privateKey.trim(), subject: trimmedSubject };
  }

  isConfigured(): boolean {
    return this.vapid() !== null;
  }
}
