import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { buildDobEncryptionWith } from '../../crypto/test-dob-encryption';
import { PasswordService } from '../auth/password/password.service';
import { FakeTwoFactorRedis, FakeTwoFactorRepository } from './test-support/in-memory-two-factor.fakes';
import { TwoFactorAttemptLimiter } from './two-factor-attempt.limiter';
import { TwoFactorPendingStore } from './two-factor-pending.store';
import { TwoFactorTokenStore } from './two-factor-token.store';
import { CODE_ATTEMPTS_MAX } from './two-factor.constants';
import { TwoFactorService } from './two-factor.service';
import { generateTotpCode } from './totp.util';

// Key rotation (docs/dob-encryption-rollback.md): the 10-minute pending-enrolment secret in Redis is encrypted with the
// key of the moment and is NOT rewritten by the rotation script. After a rotation one may no longer decrypt. That must
// behave like an expired enrolment (the person starts again), never a 500, and must not cost a failed attempt.
const T0 = 1_800_000_000_000;
const OLD = randomBytes(32).toString('base64');
const NEW = randomBytes(32).toString('base64');

function services() {
  const redis = new FakeTwoFactorRedis();
  const users = new FakeTwoFactorRepository();
  const admins = new FakeTwoFactorRepository();
  const passwords = { hash: async (p: string) => `hash:${p}`, verify: async (h: string, p: string) => h === `hash:${p}` };
  const make = (vars: Record<string, string>) =>
    new TwoFactorService(
      users as never,
      admins as never,
      buildDobEncryptionWith(vars),
      passwords as unknown as PasswordService,
      new TwoFactorTokenStore(redis),
      new TwoFactorPendingStore(redis),
      new TwoFactorAttemptLimiter(redis),
      new ConfigService({}),
      { now: () => new Date(T0) },
    );
  return { redis, users, admins, make };
}

describe('TwoFactorService: a pending enrolment that outlives a key rotation', () => {
  it('a pending secret written under the OLD key, read with the key ring that no longer holds it, is a 400 "start again", not an error', async () => {
    const s = services();
    s.users.seed({ id: 'u1' });
    const before = s.make({ DOB_ENCRYPTION_KEY: OLD }); // v1
    const { secret } = await before.startEnrolment('user', 'u1');
    expect(s.redis.rawValue('2fa:pending:user:u1')?.startsWith('v1:')).toBe(true);

    // The rotation finished and the previous key has been removed: only the new key (version 2) is held.
    const after = s.make({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: '2' });
    await expect(after.confirmEnrolment('user', 'u1', generateTotpCode(secret, T0))).rejects.toMatchObject({
      status: 400,
      response: { code: 'two_factor_no_pending_enrolment', message: 'Start enrolment first, or it has expired.' },
    });

    // The dead pending value is cleared, so it cannot keep failing.
    expect(s.redis.rawValue('2fa:pending:user:u1')).toBeUndefined();
    // The person can simply start again, and the new enrolment works under the new key.
    const restarted = await after.startEnrolment('user', 'u1');
    expect(s.redis.rawValue('2fa:pending:user:u1')?.startsWith('v2:')).toBe(true);
    await expect(after.confirmEnrolment('user', 'u1', generateTotpCode(restarted.secret, T0))).resolves.toHaveLength(10);
  });

  it('it costs no failed attempt: many such confirms never lock the account out', async () => {
    const s = services();
    s.users.seed({ id: 'u1' });
    const before = s.make({ DOB_ENCRYPTION_KEY: OLD });
    const after = s.make({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: '2' });
    for (let i = 0; i < CODE_ATTEMPTS_MAX + 2; i++) {
      await before.startEnrolment('user', 'u1');
      await expect(after.confirmEnrolment('user', 'u1', '123456')).rejects.toMatchObject({
        response: { code: 'two_factor_no_pending_enrolment' },
      });
    }
    // Still able to enrol: nothing was locked.
    const fresh = await after.startEnrolment('user', 'u1');
    await expect(after.confirmEnrolment('user', 'u1', generateTotpCode(fresh.secret, T0))).resolves.toHaveLength(10);
  });

  it('the same for an admin enrolment', async () => {
    const s = services();
    s.admins.seed({ id: 'a1' });
    const before = s.make({ DOB_ENCRYPTION_KEY: OLD });
    const { secret } = await before.startEnrolment('admin', 'a1');
    const after = s.make({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: '2' });
    await expect(after.confirmEnrolment('admin', 'a1', generateTotpCode(secret, T0))).rejects.toMatchObject({
      response: { code: 'two_factor_no_pending_enrolment' },
    });
  });

  it('while the previous key is still configured the pending enrolment survives the rotation and confirms', async () => {
    const s = services();
    s.users.seed({ id: 'u1' });
    const before = s.make({ DOB_ENCRYPTION_KEY: OLD });
    const { secret } = await before.startEnrolment('user', 'u1');
    const during = s.make({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: OLD });
    await expect(during.confirmEnrolment('user', 'u1', generateTotpCode(secret, T0))).resolves.toHaveLength(10);
  });

  it('a key CONFIGURATION error is not hidden as an expired enrolment (it still surfaces)', async () => {
    const s = services();
    s.users.seed({ id: 'u1' });
    const before = s.make({ DOB_ENCRYPTION_KEY: OLD });
    await before.startEnrolment('user', 'u1');
    const broken = s.make({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: 'two' });
    await expect(broken.confirmEnrolment('user', 'u1', '123456')).rejects.toThrow(/DOB_ENCRYPTION_KEY_VERSION/);
  });
});
