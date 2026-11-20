import { Logger } from '@nestjs/common';
import {
  GUARDIAN_SECURITY_EVENTS,
  GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX,
  GuardianSecurityEventKey,
} from './guardian-security-notice.constants';
import { GuardianSecurityNoticeService } from './guardian-security-notice.service';

// backend/b280-withhold-guardian-notices (B-280; Decision Log #458). The gate lives in decide(), the one place that
// decides whether a guardian may be emailed. While a GuardianNoticeWithhold row exists for the account, EVERY B-275
// security notice and EVERY B-279 safety notice is skipped silently: no email, no throttle claim, an internal log
// line with no reason, no admin, no address and no name.

const NOW = new Date('2026-11-01T14:32:09.000Z');
const ALL_KEYS = Object.keys(GUARDIAN_SECURITY_EVENTS) as GuardianSecurityEventKey[];
const SECRET_REASON = 'Safeguarding concern about the home. Staff are supporting the child directly.';

interface UserRow {
  isMinor: boolean;
  displayName: string;
  guardian: { email: string | null; consentStatus: string } | null;
  guardianNoticeWithhold: { id: string } | null;
}

function build(over: Partial<UserRow> = {}) {
  const user: UserRow = {
    isMinor: true,
    displayName: 'Sam',
    guardian: { email: 'parent@example.com', consentStatus: 'confirmed' },
    guardianNoticeWithhold: null,
    ...over,
  };
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
    sendGuardianSecurityNoticeEmail: jest.fn(async () => undefined),
    sendGuardianSafetyNoticeEmail: jest.fn(async () => undefined),
  };
  const service = new GuardianSecurityNoticeService(prisma as never, redis as never, email as never);
  return { service, user, prisma, redis, email, claimed };
}

describe('GuardianSecurityNoticeService: the withhold gate (B-280)', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('covers every registered event, security and safety (the list is not hand-picked)', () => {
    expect(ALL_KEYS.some((k) => GUARDIAN_SECURITY_EVENTS[k].kind === 'safety')).toBe(true);
    expect(ALL_KEYS.some((k) => GUARDIAN_SECURITY_EVENTS[k].kind !== 'safety')).toBe(true);
  });

  it.each(ALL_KEYS)('"%s": a withheld minor is skipped with no email at all', async (key) => {
    const { service, email } = build({ guardianNoticeWithhold: { id: 'w1' } });

    await expect(service.notify('user-1', key, NOW)).resolves.toBe('skipped_withheld');

    expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
  });

  it.each(ALL_KEYS.filter((k) => GUARDIAN_SECURITY_EVENTS[k].throttleSeconds))(
    '"%s" (a throttled event): a withheld account never takes the throttle claim, so clearing the flag later is not blocked by an old one',
    async (key) => {
      const { service, redis, claimed } = build({ guardianNoticeWithhold: { id: 'w1' } });

      await service.notify('user-1', key, NOW);

      expect(redis.set).not.toHaveBeenCalled();
      expect(claimed.size).toBe(0);
      expect([...claimed].some((k) => k.startsWith(GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX))).toBe(false);
    },
  );

  it('the same account sends again once the flag is gone, with the throttle still free', async () => {
    const { service, user, email, claimed } = build({ guardianNoticeWithhold: { id: 'w1' } });
    await service.notify('user-1', 'login_locked', NOW);
    expect(claimed.size).toBe(0);

    user.guardianNoticeWithhold = null; // cleared

    await expect(service.notify('user-1', 'login_locked', NOW)).resolves.toBe('sent');
    expect(email.sendGuardianSecurityNoticeEmail).toHaveBeenCalledTimes(1);
  });

  it('skipped notices are NOT queued: clearing the flag does not send what was skipped', async () => {
    const { service, user, email } = build({ guardianNoticeWithhold: { id: 'w1' } });
    await service.notify('user-1', 'password_changed', NOW);
    await service.notify('user-1', 'content_removed', NOW);

    user.guardianNoticeWithhold = null;

    expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
    expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
  });

  it('logs an internal line that says only that it was withheld: no reason, no admin, no address, no name', async () => {
    const { service } = build({ guardianNoticeWithhold: { id: 'w1' } });

    await service.notify('user-1', 'password_changed', NOW);

    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].flat().join(' ');
    expect(logged).toContain('withheld');
    expect(logged).not.toContain('parent@example.com');
    expect(logged).not.toContain('Sam');
    expect(logged).not.toContain(SECRET_REASON);
  });

  it('never reads the reason: the user query selects the flag\'s id only', async () => {
    const { service, prisma } = build({ guardianNoticeWithhold: { id: 'w1' } });
    await service.notify('user-1', 'password_changed', NOW);
    const arg = (prisma.user.findUnique.mock.calls[0] as unknown[])[0] as { select: Record<string, unknown> };
    expect(arg.select.guardianNoticeWithhold).toEqual({ select: { id: true } });
  });

  it('prepare() (used before an action that deletes the Guardian row) returns null for a withheld account', async () => {
    const { service } = build({ guardianNoticeWithhold: { id: 'w1' } });
    await expect(service.prepare('user-1')).resolves.toBeNull();
  });

  it('prepare() still returns the recipient when nothing is withheld', async () => {
    const { service } = build();
    await expect(service.prepare('user-1')).resolves.toEqual({ to: 'parent@example.com', displayName: 'Sam' });
  });

  it('the account-removal path: prepare() null => notify() with no recipient is skipped_withheld, nothing is sent', async () => {
    const { service, email } = build({ guardianNoticeWithhold: { id: 'w1' } });
    const prepared = (await service.prepare('user-1')) ?? undefined;
    await expect(service.notify('user-1', 'account_removed', NOW, prepared)).resolves.toBe('skipped_withheld');
    expect(email.sendGuardianSafetyNoticeEmail).not.toHaveBeenCalled();
  });

  it('an ADULT is skipped as not-a-minor (the flag is inert), and that is not logged', async () => {
    const { service, email } = build({ isMinor: false, guardianNoticeWithhold: { id: 'w1' } });
    await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('skipped_not_minor');
    expect(email.sendGuardianSecurityNoticeEmail).not.toHaveBeenCalled();
  });

  it('a withheld account with no confirmed guardian is still just skipped_withheld (the flag is checked first)', async () => {
    const { service } = build({ guardian: null, guardianNoticeWithhold: { id: 'w1' } });
    await expect(service.notify('user-1', 'password_changed', NOW)).resolves.toBe('skipped_withheld');
  });
});
