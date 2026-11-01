import { Logger } from '@nestjs/common';
import {
  GUARDIAN_SECURITY_EVENTS,
  GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX,
  GuardianSecurityEventKey,
} from './guardian-security-notice.constants';
import { GuardianSecurityNoticeService, formatNoticeTime } from './guardian-security-notice.service';

// backend/b275-guardian-security-notices (B-275; Decision Log #456). Rules under test: only a MINOR with a CONFIRMED
// guardian and an address on file is emailed; the sign-in-lock notice is throttled to one per account per 24 hours
// and is skipped (not sent) when Redis is unavailable; a failure never reaches the caller; the email carries no
// data beyond the minor's display name, the event sentence and the time.

type UserRow = {
  isMinor: boolean;
  displayName: string;
  guardian: { email: string | null; consentStatus: string } | null;
};

const NOW = new Date('2026-11-01T14:32:09.000Z');
const ALL_KEYS = Object.keys(GUARDIAN_SECURITY_EVENTS) as GuardianSecurityEventKey[];

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
  const email = { sendGuardianSecurityNoticeEmail: jest.fn(async () => undefined) };
  const service = new GuardianSecurityNoticeService(prisma as never, redis as never, email as never);
  return { service, prisma, redis, email, claimed };
}

function confirmedMinor(over: Partial<UserRow> = {}): UserRow {
  return {
    isMinor: true,
    displayName: 'Sam',
    guardian: { email: 'parent@example.com', consentStatus: 'confirmed' },
    ...over,
  };
}

describe('GuardianSecurityNoticeService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('who is notified', () => {
    it('emails the CONFIRMED guardian of a minor, with the subject, the sentence and the time', async () => {
      const { service, email } = build();

      await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('sent');

      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(1);
      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledWith(
        'parent@example.com',
        "Security change on Sam's Soccernity account",
        "The password on Sam's Soccernity account was changed.",
        '1 November 2026, 14:32 UTC',
      );
    });

    it.each(ALL_KEYS)('sends for the "%s" event, using that event\'s registry wording', async (key) => {
      const { service, email } = build();
      await expect(service.notify('user-1', key, NOW)).resolves.toBe('sent');
      const [, subject, summary] = email.sendGuardianSecurityNoticeEmail.mock.calls[0] as unknown as string[];
      expect(subject).toBe(GUARDIAN_SECURITY_EVENTS[key].subject('Sam'));
      expect(summary).toBe(GUARDIAN_SECURITY_EVENTS[key].summary('Sam'));
    });

    it('sends nothing for an adult, even one whose Guardian row still exists', async () => {
      const { service, email } = build(confirmedMinor({ isMinor: false }));

      await expect(service.notify('user-1', 'two_factor_disabled', NOW)).resolves.toBe('skipped_not_minor');

      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    });

    it.each(['pending', 'declined', 'expired', 'withdrawn', ''])(
      'sends nothing when the guardian consent is "%s" (the address is not confirmed), and logs the skip',
      async (status) => {
        const { service, email } = build(confirmedMinor({ guardian: { email: 'parent@example.com', consentStatus: status } }));

        await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('skipped_guardian_not_confirmed');

        expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('guardian not confirmed'));
      },
    );

    it('sends nothing for a minor with no Guardian row at all', async () => {
      const { service, email } = build(confirmedMinor({ guardian: null }));
      await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('skipped_guardian_not_confirmed');
      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    });

    it('sends nothing when a confirmed guardian has no address on file', async () => {
      const { service, email } = build(confirmedMinor({ guardian: { email: '  ', consentStatus: 'confirmed' } }));
      await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('skipped_no_guardian_email');
      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a user that does not exist', async () => {
      const { service, email } = build(null);
      await expect(service.notify('gone', 'password_changed', NOW)).resolves.toBe('skipped_no_user');
      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    });

    it('reads only what it needs: the minor flag, the display name, the guardian address and consent status', async () => {
      const { service, prisma } = build();
      await service.notify('user-1', 'password_changed', NOW);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          isMinor: true,
          displayName: true,
          guardian: { select: { email: true, consentStatus: true } },
        },
      });
    });

    it('logs a skip without the guardian address or the minor\'s name', async () => {
      const { service } = build(confirmedMinor({ guardian: { email: 'parent@example.com', consentStatus: 'pending' } }));
      await service.notify('user-1', 'password_changed', NOW);
      const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].flat().join(' ');
      expect(logged).not.toContain('parent@example.com');
      expect(logged).not.toContain('Sam');
    });
  });

  describe('the sign-in lock notice throttle', () => {
    it('sends the first lock notice and claims a 24-hour key for the account', async () => {
      const { service, email, redis } = build();

      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('sent');

      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(`${GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX}login_locked:user-1`, '1', 'EX', 86400, 'NX');
    });

    it('sends at most ONE lock notice per account per 24 hours', async () => {
      const { service, email } = build();

      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('sent');
      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('skipped_throttled');
      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('skipped_throttled');

      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(1);
    });

    it('throttles per account: another minor still gets their own lock notice', async () => {
      const { service, email } = build();
      await service.notify('user-1', 'login_locked', NOW);
      await expect(service.notify('user-2', 'login_locked', NOW)).resolves.toBe('sent');
      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(2);
    });

    it('does not throttle the other events: each password change, enrolment or reset is reported', async () => {
      const { service, email, redis } = build();
      for (const key of ['password_changed', 'password_changed', 'two_factor_enabled', 'two_factor_enabled', 'password_reset'] as const) {
        await expect(service.notify('user-1', key, NOW)).resolves.toBe('sent');
      }
      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(5);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('SKIPS the lock notice, and logs it, when Redis is unavailable (a missed notice beats a flood)', async () => {
      const { service, email, redis } = build();
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('skipped_throttle_unavailable');
      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('skipped_throttle_unavailable');

      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Redis'));
    });

    it('does not need Redis at all for events without a throttle', async () => {
      const { service, email, redis } = build();
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('sent');
      expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(1);
    });

    it('gives the throttle claim back if the send itself throws, so the next lock can try again', async () => {
      const { service, email, claimed } = build();
      email.sendGuardianSecurityNoticeEmail.mockRejectedValueOnce(new Error('boom'));

      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('failed');
      expect(claimed.size).toBe(0);

      await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('sent');
    });

    it('does not claim the throttle for an adult or an unconfirmed guardian', async () => {
      const adult = build(confirmedMinor({ isMinor: false }));
      await adult.service.notify('user-1', 'login_locked', NOW);
      const pending = build(confirmedMinor({ guardian: { email: 'p@example.com', consentStatus: 'pending' } }));
      await pending.service.notify('user-1', 'login_locked', NOW);
      expect(adult.redis.set).not.toHaveBeenCalled();
      expect(pending.redis.set).not.toHaveBeenCalled();
    });
  });

  describe('failures never reach the caller', () => {
    it('notify() resolves, never rejects, when the user lookup throws', async () => {
      const { service, prisma, email } = build();
      prisma.user.findUnique.mockRejectedValue(new Error('db down'));

      await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('failed');

      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('notify() resolves, never rejects, when the send throws', async () => {
      const { service, email } = build();
      email.sendGuardianSecurityNoticeEmail.mockRejectedValue(new Error('postmark down'));
      await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('failed');
    });

    it('an unregistered event key is logged, not thrown', async () => {
      const { service, email } = build();
      await expect(service.notify('user-1', 'not_a_real_event' as GuardianSecurityEventKey, NOW)).resolves.toBe('failed');
      expect(errorSpy).toHaveBeenCalled();
      expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    });

    it('notifyInBackground() returns immediately and never throws, even if everything underneath fails', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockRejectedValue(new Error('db down'));

      expect(service.notifyInBackground('user-1', 'password_changed')).toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnSpy).toHaveBeenCalled();
    });

    it('notifyInBackground() does not wait for a send that never finishes', async () => {
      const { service, email } = build();
      email.sendGuardianSecurityNoticeEmail.mockImplementation(() => new Promise<undefined>(() => undefined));

      const returned = service.notifyInBackground('user-1', 'password_changed');

      expect(returned).toBeUndefined();
    });
  });

  describe('what the email contains', () => {
    it('passes only the address, the subject, the sentence and the time: no id, IP, device, location or other account data', async () => {
      const { service, email } = build();
      await service.notify('user-1', 'login_locked', NOW);

      const args = email.sendGuardianSecurityNoticeEmail.mock.calls[0] as unknown as string[];
      expect(args).toHaveLength(4);
      const everything = args.join(' | ');
      expect(everything).not.toContain('user-1');
      expect(everything.toLowerCase()).not.toMatch(/ip address|device|location|browser|\d+\.\d+\.\d+\.\d+/);
    });

    it('every registered event has a non-empty subject and sentence that name only the minor', () => {
      for (const key of ALL_KEYS) {
        const def = GUARDIAN_SECURITY_EVENTS[key];
        expect(def.subject('Sam').length).toBeGreaterThan(10);
        expect(def.summary('Sam')).toContain('Sam');
        expect(def.summary('Sam').toLowerCase()).not.toMatch(/ip address|device|location|browser/);
      }
    });

    it('only the sign-in lock event is throttled', () => {
      const throttled = ALL_KEYS.filter((k) => GUARDIAN_SECURITY_EVENTS[k].throttleSeconds);
      expect(throttled).toEqual(['login_locked']);
    });
  });

  describe('formatNoticeTime', () => {
    it('writes a UTC date and time that does not depend on the runtime locale', () => {
      expect(formatNoticeTime(new Date('2026-11-01T14:32:09.000Z'))).toBe('1 November 2026, 14:32 UTC');
      expect(formatNoticeTime(new Date('2026-01-05T03:07:00.000Z'))).toBe('5 January 2026, 03:07 UTC');
      expect(formatNoticeTime(new Date('2026-12-31T23:59:59.999Z'))).toBe('31 December 2026, 23:59 UTC');
    });
  });
});
