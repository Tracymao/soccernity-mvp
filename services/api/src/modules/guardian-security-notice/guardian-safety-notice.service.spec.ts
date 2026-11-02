import { Logger } from '@nestjs/common';
import { GUARDIAN_SECURITY_EVENTS, GuardianSecurityEventKey } from './guardian-security-notice.constants';
import { GuardianSecurityNoticeService } from './guardian-security-notice.service';

// backend/b279-guardian-safety-notices (B-279; Decision Log #456 A and C). Rules under test for the SAFETY events:
// only a MINOR with a CONFIRMED guardian and an address on file is emailed; one notice per kind per account per
// hour; a failure never reaches the caller; a pre-read recipient (for an action that deletes the Guardian row)
// is honoured; and the notice says the kind of action and nothing else.

const NOW = new Date('2026-11-01T14:32:09.000Z');
const SAFETY_KEYS = (Object.keys(GUARDIAN_SECURITY_EVENTS) as GuardianSecurityEventKey[]).filter(
  (k) => GUARDIAN_SECURITY_EVENTS[k].kind === 'safety',
);

type UserRow = {
  isMinor: boolean;
  displayName: string;
  guardian: { email: string | null; consentStatus: string } | null;
};

function confirmedMinor(over: Partial<UserRow> = {}): UserRow {
  return {
    isMinor: true,
    displayName: 'Sam',
    guardian: { email: 'parent@example.com', consentStatus: 'confirmed' },
    ...over,
  };
}

function build(user: UserRow | null = confirmedMinor()) {
  const prisma = { user: { findUnique: jest.fn(async () => user) } };
  const claimed = new Set<string>();
  const redis = {
    set: jest.fn(async (key: string) => {
      if (claimed.has(key)) return null;
      claimed.add(key);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      claimed.delete(key);
      return 1;
    }),
  };
  const email = {
    sendGuardianSafetyNoticeEmail: jest.fn(async () => undefined),
    sendGuardianSecurityNoticeEmail: jest.fn(async () => undefined),
  };
  const service = new GuardianSecurityNoticeService(prisma as never, redis as never, email as never);
  return { service, prisma, redis, email, claimed };
}

describe('GuardianSecurityNoticeService: safety events (B-279)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('registers exactly the eleven safety events decided in B-279', () => {
    expect([...SAFETY_KEYS].sort()).toEqual(
      [
        'account_reinstated',
        'account_removed',
        'account_suspended',
        'appeal_overturned',
        'appeal_upheld',
        'content_removed',
        'media_not_approved',
        'profile_image_not_approved',
        'room_deactivated',
        'username_removed',
        'warning_issued',
      ].sort(),
    );
  });

  describe.each(SAFETY_KEYS)('%s', (key) => {
    it('a minor with a confirmed guardian: sent, on the SAFETY email, with the registry subject, sentence and time', async () => {
      const { service, email } = build();

      await expect(service.notify('user-1', key, NOW)).resolves.toBe('sent');

      const def = GUARDIAN_SECURITY_EVENTS[key];
      expect(email.sendGuardianSafetyNoticeEmail).toHaveBeenCalledTimes(1);
      expect(email.sendGuardianSafetyNoticeEmail).toHaveBeenCalledWith(
        'parent@example.com',
        def.subject('Sam'),
        def.summary('Sam'),
        '1 November 2026, 14:32 UTC',
      );
      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    });

    it('an adult: not sent (even with an old confirmed Guardian row)', async () => {
      const { service, email } = build(confirmedMinor({ isMinor: false }));
      await expect(service.notify('user-1', key, NOW)).resolves.toBe('skipped_not_minor');
      expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['pending', { email: 'parent@example.com', consentStatus: 'pending' }],
      ['declined', { email: 'parent@example.com', consentStatus: 'declined' }],
      ['missing', null],
    ])('a minor whose guardian is %s: not sent', async (_label, guardian) => {
      const { service, email } = build(confirmedMinor({ guardian }));
      await expect(service.notify('user-1', key, NOW)).resolves.toBe('skipped_guardian_not_confirmed');
      expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
    });

    it('a confirmed guardian with no address on file: not sent', async () => {
      const { service, email } = build(confirmedMinor({ guardian: { email: '  ', consentStatus: 'confirmed' } }));
      await expect(service.notify('user-1', key, NOW)).resolves.toBe('skipped_no_guardian_email');
      expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
    });

    it('is throttled to ONE per hour per account: the second is dropped, and the key expires after one hour', async () => {
      const { service, email, redis } = build();

      await expect(service.notify('user-1', key, NOW)).resolves.toBe('sent');
      await expect(service.notify('user-1', key, NOW)).resolves.toBe('skipped_throttled');
      expect(email.sendGuardianSafetyNoticeEmail).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(`guardian-security-notice:${key}:user-1`, '1', 'EX', 3600, 'NX');
    });

    it("a different account is not affected by this account's throttle", async () => {
      const { service, email } = build();
      await service.notify('user-1', key, NOW);
      await expect(service.notify('user-2', key, NOW)).resolves.toBe('sent');
      expect(email.sendGuardianSafetyNoticeEmail).toHaveBeenCalledTimes(2);
    });

    it('states the kind of action only: no reason, rule, report, reporter, moderator, post content or other data', () => {
      const def = GUARDIAN_SECURITY_EVENTS[key];
      const text = `${def.subject('Sam')} ${def.summary('Sam')}`.toLowerCase();
      expect(text).toContain('sam');
      expect(text).not.toMatch(
        /report|reporter|complain|moderator|admin|reason|because|rule|guideline|breach|violat|abuse|policy|bad faith|hold|investigat|ip address|device|location|browser/,
      );
    });
  });

  describe('different kinds are throttled separately', () => {
    it('a content_removed notice does not use up the warning_issued allowance', async () => {
      const { service, email } = build();
      await expect(service.notify('user-1', 'content_removed', NOW)).resolves.toBe('sent');
      await expect(service.notify('user-1', 'warning_issued', NOW)).resolves.toBe('sent');
      expect(email.sendGuardianSafetyNoticeEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('failures never affect the action', () => {
    it('Redis unavailable: skipped and logged, never thrown, nothing sent', async () => {
      const { service, email, redis } = build();
      redis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.notify('user-1', 'content_removed', NOW)).resolves.toBe('skipped_throttle_unavailable');
      expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
    });

    it('the send throws: notify resolves "failed" and gives the throttle claim back', async () => {
      const { service, email, claimed } = build();
      email.sendGuardianSafetyNoticeEmail.mockRejectedValueOnce(new Error('postmark down'));
      await expect(service.notify('user-1', 'account_suspended', NOW)).resolves.toBe('failed');
      expect(claimed.size).toBe(0);
    });

    it('the user lookup throws: notify resolves "failed", never rejects', async () => {
      const { service, prisma, email } = build();
      prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
      await expect(service.notify('user-1', 'account_suspended', NOW)).resolves.toBe('failed');
      expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
    });

    it('notifyInBackground returns immediately and never throws, even when the send fails', async () => {
      const { service, email } = build();
      email.sendGuardianSafetyNoticeEmail.mockRejectedValueOnce(new Error('postmark down'));
      expect(() => service.notifyInBackground('user-1', 'account_suspended')).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  describe('prepare(): the recipient for an action that deletes the Guardian row', () => {
    it('returns the recipient for a minor with a confirmed guardian, and null for everyone else', async () => {
      await expect(build().service.prepare('user-1')).resolves.toEqual({
        to: 'parent@example.com',
        displayName: 'Sam',
      });
      await expect(build(confirmedMinor({ isMinor: false })).service.prepare('user-1')).resolves.toBeNull();
      await expect(build(confirmedMinor({ guardian: null })).service.prepare('user-1')).resolves.toBeNull();
      await expect(build(null).service.prepare('user-1')).resolves.toBeNull();
    });

    it('never throws when the lookup fails', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
      await expect(service.prepare('user-1')).resolves.toBeNull();
    });

    it('a notice sent with a prepared recipient does not read the user again (the row may be gone)', async () => {
      const { service, prisma, email } = build(null);
      await expect(
        service.notify('user-1', 'account_removed', NOW, { to: 'parent@example.com', displayName: 'Sam' }),
      ).resolves.toBe('sent');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(email.sendGuardianSafetyNoticeEmail).toHaveBeenCalledWith(
        'parent@example.com',
        "An update on Sam's Soccernity account",
        "Sam's Soccernity account was removed by Soccernity.",
        '1 November 2026, 14:32 UTC',
      );
    });
  });
});
