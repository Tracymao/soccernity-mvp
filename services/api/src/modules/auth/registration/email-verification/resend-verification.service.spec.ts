import {
  RESEND_VERIFICATION_MAX_PER_WINDOW,
  RESEND_VERIFICATION_WINDOW_SECONDS,
  ResendVerificationLimiter,
} from './resend-verification.limiter';
import { ResendVerificationService } from './resend-verification.service';

// B-128 (Decision Log #406 item 3): the resend-verification-email rules.

type UserRow = { id: string; email: string; verificationStatus: string; accountStatus: string };

function build(user: UserRow | null, allowed = true) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const tokenStore = { issue: jest.fn().mockResolvedValue('fresh-token') };
  const emailService = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
  const limiter = { tryAcquire: jest.fn().mockResolvedValue(allowed) };
  const service = new ResendVerificationService(
    prisma as never,
    tokenStore as never,
    emailService as never,
    limiter as never,
  );
  return { service, prisma, tokenStore, emailService, limiter };
}

const unverified: UserRow = {
  id: 'u-1',
  email: 'kid@example.com',
  verificationStatus: 'unverified',
  accountStatus: 'active',
};

describe('ResendVerificationService', () => {
  it('sends a fresh link to an active, unverified account', async () => {
    const { service, tokenStore, emailService, limiter } = build(unverified);
    await service.resend('kid@example.com');
    expect(limiter.tryAcquire).toHaveBeenCalledWith('u-1');
    expect(tokenStore.issue).toHaveBeenCalledWith('u-1');
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('kid@example.com', 'fresh-token');
  });

  it('normalises the email the way every other lookup does (trim + lower case)', async () => {
    const { service, prisma } = build(unverified);
    await service.resend('  Kid@Example.COM ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'kid@example.com' } }),
    );
  });

  it.each([
    ['no such account', null],
    ['an already verified account', { ...unverified, verificationStatus: 'verified' }],
    ['a deactivated account', { ...unverified, accountStatus: 'deactivated' }],
    ['a suspended account', { ...unverified, accountStatus: 'suspended' }],
    ['an account on the deletion path', { ...unverified, accountStatus: 'pending_deletion' }],
    ['an anonymised account', { ...unverified, accountStatus: 'deleted' }],
  ])('sends nothing, silently, for %s', async (_label, user) => {
    const { service, tokenStore, emailService, limiter } = build(user as UserRow | null);
    await expect(service.resend('x@example.com')).resolves.toBeUndefined();
    expect(limiter.tryAcquire).not.toHaveBeenCalled();
    expect(tokenStore.issue).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('sends nothing, silently, once the per-account cap is reached (no 429 that would reveal the account)', async () => {
    const { service, tokenStore, emailService } = build(unverified, false);
    await expect(service.resend('kid@example.com')).resolves.toBeUndefined();
    expect(tokenStore.issue).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('a failing email provider does not fail the request', async () => {
    const { service, emailService } = build(unverified);
    emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('postmark down'));
    await expect(service.resend('kid@example.com')).resolves.toBeUndefined();
  });
});

describe('ResendVerificationLimiter', () => {
  function fakeRedis() {
    const counts = new Map<string, number>();
    return {
      counts,
      incr: jest.fn(async (k: string) => {
        const n = (counts.get(k) ?? 0) + 1;
        counts.set(k, n);
        return n;
      }),
      expire: jest.fn(async () => 1),
    };
  }

  it('allows exactly the cap, then refuses', async () => {
    const redis = fakeRedis();
    const limiter = new ResendVerificationLimiter(redis as never);
    const results: boolean[] = [];
    for (let i = 0; i < RESEND_VERIFICATION_MAX_PER_WINDOW + 2; i++) {
      results.push(await limiter.tryAcquire('u-1'));
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('starts the window on the first send only', async () => {
    const redis = fakeRedis();
    const limiter = new ResendVerificationLimiter(redis as never);
    await limiter.tryAcquire('u-1');
    await limiter.tryAcquire('u-1');
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith('auth:resend-verification:u-1', RESEND_VERIFICATION_WINDOW_SECONDS);
  });

  it('is per account: one account at the cap does not block another', async () => {
    const redis = fakeRedis();
    const limiter = new ResendVerificationLimiter(redis as never);
    for (let i = 0; i < RESEND_VERIFICATION_MAX_PER_WINDOW + 1; i++) await limiter.tryAcquire('u-1');
    expect(await limiter.tryAcquire('u-1')).toBe(false);
    expect(await limiter.tryAcquire('u-2')).toBe(true);
  });
});
