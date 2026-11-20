import { ConfigService } from '@nestjs/config';
import { PushConfig } from './push.config';

function config(values: Record<string, string | undefined>): PushConfig {
  return new PushConfig(new ConfigService(values));
}

describe('PushConfig', () => {
  const REAL = { VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key', VAPID_SUBJECT: 'mailto:support@soccernity.com' };

  it('is configured when all three are set', () => {
    const c = config(REAL);
    expect(c.isConfigured()).toBe(true);
    expect(c.vapid()).toEqual({ publicKey: 'pub-key', privateKey: 'priv-key', subject: 'mailto:support@soccernity.com' });
  });

  it('accepts an https subject', () => {
    expect(config({ ...REAL, VAPID_SUBJECT: 'https://soccernity.com' }).isConfigured()).toBe(true);
  });

  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])('is unavailable when %s is unset', (key) => {
    expect(config({ ...REAL, [key]: undefined }).isConfigured()).toBe(false);
  });

  it.each(['', '   ', 'replace-me'])('is unavailable when a key is %j', (value) => {
    expect(config({ ...REAL, VAPID_PRIVATE_KEY: value }).isConfigured()).toBe(false);
    expect(config({ ...REAL, VAPID_PUBLIC_KEY: value }).isConfigured()).toBe(false);
  });

  it('is unavailable (not an error) when the subject is not mailto: or https://', () => {
    const c = config({ ...REAL, VAPID_SUBJECT: 'support@soccernity.com' });
    expect(c.isConfigured()).toBe(false);
    expect(c.vapid()).toBeNull();
  });

  it('is unavailable with nothing set', () => {
    expect(config({}).isConfigured()).toBe(false);
  });
});
