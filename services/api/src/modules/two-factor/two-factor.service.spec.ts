import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { PasswordService } from '../auth/password/password.service';
import { looksLikeBackupCode } from './backup-code.util';
import { FakeTwoFactorRedis, FakeTwoFactorRepository } from './test-support/in-memory-two-factor.fakes';
import { TwoFactorAttemptLimiter, CodeEntryLockedException } from './two-factor-attempt.limiter';
import { TwoFactorPendingStore } from './two-factor-pending.store';
import { TwoFactorTokenStore } from './two-factor-token.store';
import { CODE_ATTEMPTS_MAX, CODE_LOCK_SECONDS, INVALID_CHALLENGE_MESSAGE, INVALID_CODE_MESSAGE } from './two-factor.constants';
import { TwoFactorService } from './two-factor.service';
import { generateTotpCode, stepAt } from './totp.util';

// The REAL service, stores, limiter, TOTP maths and DOB_ENCRYPTION_KEY encryption; only Postgres and Redis are
// in-memory fakes and password hashing is a fast fake (argon2 itself is exercised in test/two-factor.e2e-spec.ts).
// Time is controlled: the service reads the app clock (TOTP steps) and the fake Redis has its own clock (TTLs and locks).
class FastPasswords {
  verifyCalls: string[] = [];
  async hash(plain: string) {
    return `hash:${plain}`;
  }
  async verify(hash: string, plain: string) {
    this.verifyCalls.push(hash);
    return hash === `hash:${plain}`;
  }
}

const T0 = 1_800_000_000_000; // a fixed "now" in ms; the step is stepAt(T0)

interface Harness {
  svc: TwoFactorService;
  redis: FakeTwoFactorRedis;
  users: FakeTwoFactorRepository;
  admins: FakeTwoFactorRepository;
  passwords: FastPasswords;
  dob: ReturnType<typeof buildTestDobEncryption>;
  setNow(ms: number): void;
}

let nowMs = T0;

function build(config: Record<string, string> = {}): Harness {
  nowMs = T0;
  const redis = new FakeTwoFactorRedis();
  const users = new FakeTwoFactorRepository();
  const admins = new FakeTwoFactorRepository();
  const passwords = new FastPasswords();
  const dob = buildTestDobEncryption();
  const svc = new TwoFactorService(
    users as never,
    admins as never,
    dob,
    passwords as unknown as PasswordService,
    new TwoFactorTokenStore(redis),
    new TwoFactorPendingStore(redis),
    new TwoFactorAttemptLimiter(redis),
    new ConfigService(config),
    { now: () => new Date(nowMs) },
  );
  return {
    svc,
    redis,
    users,
    admins,
    passwords,
    dob,
    setNow: (ms) => {
      nowMs = ms;
    },
  };
}

// Enrols a seeded user the way the app does and returns the secret and the 10 backup codes.
async function enrol(h: Harness, aud: 'user' | 'admin', id: string) {
  const repo = aud === 'user' ? h.users : h.admins;
  repo.seed({ id, passwordHash: 'hash:correct-password' });
  const { secret } = await h.svc.startEnrolment(aud, id);
  const codes = await h.svc.confirmEnrolment(aud, id, generateTotpCode(secret, nowMs));
  return { secret, codes };
}

afterEach(() => jest.restoreAllMocks());

describe('TwoFactorService: enrolment', () => {
  it('start returns the manual key and an otpauth URI, and parks only CIPHERTEXT in Redis, nothing on the account', async () => {
    const h = build();
    h.users.seed({ id: 'u1', email: 'kid@example.com' });
    const start = await h.svc.startEnrolment('user', 'u1');

    expect(start.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(start.otpauthUri).toContain('otpauth://totp/Soccernity:kid%40example.com');
    expect(start.otpauthUri).toContain(`secret=${start.secret}`);

    const parked = h.redis.rawValue('2fa:pending:user:u1') as string;
    expect(parked.startsWith('v1:')).toBe(true);
    expect(parked).not.toContain(start.secret);
    expect(h.dob.decryptString(parked)).toBe(start.secret);
    expect((await h.users.find('u1'))?.totpSecretEncrypted).toBeNull(); // not on the account until confirmed
  });

  it('starting again replaces the pending secret', async () => {
    const h = build();
    h.users.seed({ id: 'u1' });
    const first = await h.svc.startEnrolment('user', 'u1');
    const second = await h.svc.startEnrolment('user', 'u1');
    expect(second.secret).not.toBe(first.secret);
    expect(h.dob.decryptString(h.redis.rawValue('2fa:pending:user:u1') as string)).toBe(second.secret);
  });

  it('the pending secret expires after 10 minutes', async () => {
    const h = build();
    h.users.seed({ id: 'u1' });
    const { secret } = await h.svc.startEnrolment('user', 'u1');
    h.redis.advance(10 * 60 + 1);
    await expect(h.svc.confirmEnrolment('user', 'u1', generateTotpCode(secret, nowMs))).rejects.toMatchObject({
      response: { code: 'two_factor_no_pending_enrolment' },
    });
  });

  it('confirm with a wrong code turns nothing on and answers the shared message', async () => {
    const h = build();
    h.users.seed({ id: 'u1' });
    const { secret } = await h.svc.startEnrolment('user', 'u1');
    const wrong = generateTotpCode(secret, nowMs) === '000000' ? '111111' : '000000';
    await expect(h.svc.confirmEnrolment('user', 'u1', wrong)).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE, status: 401 });
    expect((await h.users.find('u1'))?.totpEnabledAt).toBeNull();
  });

  it('confirm with the first valid code enables it and returns 10 backup codes ONCE, stored only as hashes', async () => {
    const h = build();
    h.users.seed({ id: 'u1' });
    const { secret } = await h.svc.startEnrolment('user', 'u1');
    const codes = await h.svc.confirmEnrolment('user', 'u1', generateTotpCode(secret, nowMs));

    expect(codes).toHaveLength(10);
    codes.forEach((c) => expect(looksLikeBackupCode(c)).toBe(true));

    const subject = (await h.users.find('u1'))!;
    expect(subject.totpEnabledAt).toBeInstanceOf(Date);
    expect(subject.totpLastUsedStep).toBe(stepAt(nowMs));
    expect(subject.totpSecretEncrypted).not.toContain(secret);
    expect(h.dob.decryptString(subject.totpSecretEncrypted as string)).toBe(secret);

    const stored = await h.users.unusedBackupCodes('u1');
    expect(stored).toHaveLength(10);
    for (const row of stored) expect(codes).not.toContain(row.codeHash); // hashes, never the codes
    expect(h.redis.rawValue('2fa:pending:user:u1')).toBeUndefined(); // the parked secret is gone
    expect(await h.svc.getStatus('user', 'u1')).toEqual({ enabled: true, backupCodesRemaining: 10 });
  });

  it('the very code that confirmed enrolment cannot be replayed to sign in', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    const challenge = await h.svc.issueChallenge('user', 'u1', false);
    await expect(
      h.svc.completeChallenge('user', challenge.challengeToken, generateTotpCode(secret, nowMs)),
    ).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE });
  });

  it('confirm without starting is a 400 and does not spend an attempt', async () => {
    const h = build();
    h.users.seed({ id: 'u1' });
    for (let i = 0; i < CODE_ATTEMPTS_MAX + 2; i++) {
      await expect(h.svc.confirmEnrolment('user', 'u1', '123456')).rejects.toMatchObject({
        response: { code: 'two_factor_no_pending_enrolment' },
      });
    }
  });

  it('start and confirm are 409 once two-factor is on', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    await expect(h.svc.startEnrolment('user', 'u1')).rejects.toMatchObject({ response: { code: 'two_factor_already_enabled' } });
    await expect(h.svc.confirmEnrolment('user', 'u1', generateTotpCode(secret, nowMs))).rejects.toMatchObject({
      response: { code: 'two_factor_already_enabled' },
    });
  });

  it('five wrong codes lock confirmation even for the right one', async () => {
    const h = build();
    h.users.seed({ id: 'u1' });
    const { secret } = await h.svc.startEnrolment('user', 'u1');
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await expect(h.svc.confirmEnrolment('user', 'u1', '000000')).rejects.toBeDefined();
    await expect(h.svc.confirmEnrolment('user', 'u1', generateTotpCode(secret, nowMs))).rejects.toBeInstanceOf(CodeEntryLockedException);
  });
});

describe('TwoFactorService: sign-in challenge', () => {
  it('an authenticator code completes it; the challenge is single-use and carries "stay signed in"', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.setNow(T0 + 30_000); // the next step: the confirming code's step is already used
    const challenge = await h.svc.issueChallenge('user', 'u1', true);
    expect(challenge.twoFactorRequired).toBe(true);
    expect(challenge.challengeExpiresInSeconds).toBe(300);

    const done = await h.svc.completeChallenge('user', challenge.challengeToken, generateTotpCode(secret, nowMs));
    expect(done).toEqual({ subjectId: 'u1', persistent: true, purpose: 'login' });
    await expect(
      h.svc.completeChallenge('user', challenge.challengeToken, generateTotpCode(secret, nowMs + 30_000)),
    ).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
  });

  it('a wrong code does NOT burn the challenge: the right one still works afterwards', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.setNow(T0 + 30_000);
    const { challengeToken } = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', challengeToken, '000000')).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE });
    await expect(h.svc.completeChallenge('user', challengeToken, generateTotpCode(secret, nowMs))).resolves.toBeDefined();
  });

  it('REPLAY: a code for a step already used is refused with the very same message as a wrong code', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.setNow(T0 + 30_000);
    const code = generateTotpCode(secret, nowMs);
    const first = await h.svc.issueChallenge('user', 'u1', false);
    await h.svc.completeChallenge('user', first.challengeToken, code);

    const second = await h.svc.issueChallenge('user', 'u1', false);
    const replay = await h.svc.completeChallenge('user', second.challengeToken, code).catch((e) => e);
    const wrong = await h.svc.completeChallenge('user', second.challengeToken, '000000').catch((e) => e);
    expect(replay.status).toBe(401);
    expect(replay.message).toBe(INVALID_CODE_MESSAGE);
    expect(replay.message).toBe(wrong.message);
    expect(replay.getResponse()).toEqual(wrong.getResponse());
  });

  it('a code one step AHEAD is accepted (clock drift), then a code for an EARLIER step than the last accepted one is refused', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1'); // last used step = S
    h.setNow(T0 + 60_000); // now at S+2: the window is S+1..S+3
    const ahead = generateTotpCode(secret, nowMs + 30_000); // S+3
    const c1 = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', c1.challengeToken, ahead)).resolves.toBeDefined();
    const behind = generateTotpCode(secret, nowMs - 30_000); // S+1 < S+3
    const c2 = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', c2.challengeToken, behind)).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE });
  });

  it('a backup code works ONCE; the second use is refused with the same message as a wrong code', async () => {
    const h = build();
    const { codes } = await enrol(h, 'user', 'u1');
    const a = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', a.challengeToken, codes[0])).resolves.toBeDefined();
    expect(await h.svc.getStatus('user', 'u1')).toEqual({ enabled: true, backupCodesRemaining: 9 });

    const b = await h.svc.issueChallenge('user', 'u1', false);
    const used = await h.svc.completeChallenge('user', b.challengeToken, codes[0]).catch((e) => e);
    const wrong = await h.svc.completeChallenge('user', b.challengeToken, 'ZZZZZZZZZZ').catch((e) => e);
    expect(used.message).toBe(INVALID_CODE_MESSAGE);
    expect(used.getResponse()).toEqual(wrong.getResponse());
  });

  it('accepts a backup code typed in lower case, with spaces or a hyphen', async () => {
    const h = build();
    const { codes } = await enrol(h, 'user', 'u1');
    const typed = `${codes[1].slice(0, 5)}-${codes[1].slice(5)}`.toLowerCase();
    const c = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', c.challengeToken, typed)).resolves.toBeDefined();
  });

  it('checks a backup code against EVERY unused code (no early exit)', async () => {
    const h = build();
    const { codes } = await enrol(h, 'user', 'u1');
    h.passwords.verifyCalls.length = 0;
    const c = await h.svc.issueChallenge('user', 'u1', false);
    await h.svc.completeChallenge('user', c.challengeToken, codes[0]); // the FIRST code matches
    expect(h.passwords.verifyCalls).toHaveLength(10);
  });

  it('refuses anything that is neither six digits nor a well-formed backup code, without hashing anything', async () => {
    const h = build();
    await enrol(h, 'user', 'u1');
    h.passwords.verifyCalls.length = 0;
    const c = await h.svc.issueChallenge('user', 'u1', false);
    // Five inputs: each is a reserved attempt, and the sixth would be the lock.
    for (const junk of ['', '12345', '1234567', 'ABC', '!!!!!!!!!!']) {
      await expect(h.svc.completeChallenge('user', c.challengeToken, junk)).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE });
    }
    expect(h.passwords.verifyCalls).toHaveLength(0);
  });

  it('five wrong codes lock the ACCOUNT for 15 minutes, even for the right code and a fresh challenge; then it recovers', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.setNow(T0 + 30_000);
    const first = await h.svc.issueChallenge('user', 'u1', false);
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await expect(h.svc.completeChallenge('user', first.challengeToken, '000000')).rejects.toBeDefined();

    const fresh = await h.svc.issueChallenge('user', 'u1', false);
    const locked = (await h.svc.completeChallenge('user', fresh.challengeToken, generateTotpCode(secret, nowMs)).catch((e) => e)) as CodeEntryLockedException;
    expect(locked).toBeInstanceOf(CodeEntryLockedException);
    expect(locked.retryAfterSeconds).toBe(CODE_LOCK_SECONDS);

    h.redis.advance(CODE_LOCK_SECONDS + 1);
    h.setNow(T0 + 30_000 + (CODE_LOCK_SECONDS + 1) * 1000);
    const later = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', later.challengeToken, generateTotpCode(secret, nowMs))).resolves.toBeDefined();
  });

  it('anything wrong with the challenge itself is the same generic 401', async () => {
    const h = build();
    await enrol(h, 'user', 'u1');
    for (const token of ['nonsense', 'a.b', '', undefined, null, 42]) {
      await expect(h.svc.completeChallenge('user', token, '123456')).rejects.toMatchObject({
        status: 401,
        message: INVALID_CHALLENGE_MESSAGE,
      });
    }
  });

  it('a challenge expires after 5 minutes', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.setNow(T0 + 30_000);
    const c = await h.svc.issueChallenge('user', 'u1', false);
    h.redis.advance(5 * 60 + 1);
    await expect(h.svc.completeChallenge('user', c.challengeToken, generateTotpCode(secret, nowMs))).rejects.toMatchObject({
      message: INVALID_CHALLENGE_MESSAGE,
    });
  });

  it('an account that stopped being active in between gets the generic 401 (and the code is never even checked)', async () => {
    for (const status of ['deactivated', 'suspended', 'pending_deletion']) {
      const h = build();
      const { secret } = await enrol(h, 'user', 'u1');
      h.setNow(T0 + 30_000);
      const c = await h.svc.issueChallenge('user', 'u1', false);
      h.users.subjects.get('u1')!.accountStatus = status;
      await expect(h.svc.completeChallenge('user', c.challengeToken, generateTotpCode(secret, nowMs))).rejects.toMatchObject({
        message: INVALID_CHALLENGE_MESSAGE,
      });
      jest.restoreAllMocks();
    }
  });

  it('a REACTIVATION challenge also accepts a deactivated account, but never a suspended or pending-deletion one', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.users.subjects.get('u1')!.accountStatus = 'deactivated';
    h.setNow(T0 + 30_000);
    const c = await h.svc.issueChallenge('user', 'u1', false, 'reactivate');
    await expect(h.svc.completeChallenge('user', c.challengeToken, generateTotpCode(secret, nowMs))).resolves.toMatchObject({
      purpose: 'reactivate',
    });
    for (const status of ['suspended', 'pending_deletion']) {
      h.users.subjects.get('u1')!.accountStatus = status;
      const again = await h.svc.issueChallenge('user', 'u1', false, 'reactivate');
      await expect(h.svc.completeChallenge('user', again.challengeToken, generateTotpCode(secret, nowMs + 30_000))).rejects.toMatchObject({
        message: INVALID_CHALLENGE_MESSAGE,
      });
    }
  });

  it('turning two-factor off (or an admin reset) in between kills an outstanding challenge', async () => {
    const h = build();
    const { secret } = await enrol(h, 'user', 'u1');
    h.setNow(T0 + 30_000);
    const c = await h.svc.issueChallenge('user', 'u1', false);
    await h.users.disable('u1');
    await expect(h.svc.completeChallenge('user', c.challengeToken, generateTotpCode(secret, nowMs))).rejects.toMatchObject({
      message: INVALID_CHALLENGE_MESSAGE,
    });
  });

  it('TOKEN-KIND SEPARATION: a user challenge is not an admin challenge, an enrolment token is neither, and vice versa', async () => {
    const h = build();
    const user = await enrol(h, 'user', 'u1');
    const admin = await enrol(h, 'admin', 'a1');
    h.setNow(T0 + 30_000);
    const userChallenge = await h.svc.issueChallenge('user', 'u1', false);
    const adminChallenge = await h.svc.issueChallenge('admin', 'a1', false);
    h.admins.seed({ id: 'a2', passwordHash: 'hash:x' });
    const enrolment = await h.svc.issueAdminEnrolmentToken('a2', false);

    const code = (secret: string) => generateTotpCode(secret, nowMs);
    await expect(h.svc.completeChallenge('admin', userChallenge.challengeToken, code(admin.secret))).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
    await expect(h.svc.completeChallenge('user', adminChallenge.challengeToken, code(user.secret))).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
    await expect(h.svc.completeChallenge('admin', enrolment.enrolmentToken, code(admin.secret))).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
    await expect(h.svc.startAdminEnrolmentWithToken(adminChallenge.challengeToken)).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
    await expect(h.svc.startAdminEnrolmentWithToken(userChallenge.challengeToken)).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
    // and the tokens still work where they belong
    await expect(h.svc.completeChallenge('user', userChallenge.challengeToken, code(user.secret))).resolves.toBeDefined();
    await expect(h.svc.completeChallenge('admin', adminChallenge.challengeToken, code(admin.secret))).resolves.toBeDefined();
  });
});

describe('TwoFactorService: backup codes and turning it off', () => {
  it('regenerate needs the password, replaces ALL codes, and the old ones stop working', async () => {
    const h = build();
    const { codes } = await enrol(h, 'user', 'u1');
    await expect(h.svc.regenerateBackupCodes('user', 'u1', 'wrong')).rejects.toMatchObject({ message: 'Incorrect password', status: 401 });
    expect(await h.svc.getStatus('user', 'u1')).toEqual({ enabled: true, backupCodesRemaining: 10 });

    const fresh = await h.svc.regenerateBackupCodes('user', 'u1', 'correct-password');
    expect(fresh).toHaveLength(10);
    expect(fresh.some((c) => codes.includes(c))).toBe(false);

    h.setNow(T0 + 30_000);
    const c = await h.svc.issueChallenge('user', 'u1', false);
    await expect(h.svc.completeChallenge('user', c.challengeToken, codes[0])).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE });
    await expect(h.svc.completeChallenge('user', c.challengeToken, fresh[0])).resolves.toBeDefined();
  });

  it('regenerate and disable are 409 when two-factor is not on', async () => {
    const h = build();
    h.users.seed({ id: 'u1', passwordHash: 'hash:correct-password' });
    await expect(h.svc.regenerateBackupCodes('user', 'u1', 'correct-password')).rejects.toMatchObject({
      response: { code: 'two_factor_not_enabled' },
    });
    await expect(h.svc.disable('user', 'u1', 'correct-password')).rejects.toMatchObject({ response: { code: 'two_factor_not_enabled' } });
  });

  it('disable needs the password, clears the secret fields and deletes every backup code', async () => {
    const h = build();
    await enrol(h, 'user', 'u1');
    await expect(h.svc.disable('user', 'u1', 'wrong')).rejects.toMatchObject({ message: 'Incorrect password' });
    expect((await h.users.find('u1'))?.totpEnabledAt).not.toBeNull(); // a wrong password changed nothing

    await h.svc.disable('user', 'u1', 'correct-password');
    expect(await h.users.find('u1')).toMatchObject({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
    expect(await h.users.unusedBackupCodes('u1')).toEqual([]);
    expect(await h.svc.getStatus('user', 'u1')).toEqual({ enabled: false, backupCodesRemaining: 0 });
  });

  it('a user can enrol again after turning it off, with a NEW secret', async () => {
    const h = build();
    const first = await enrol(h, 'user', 'u1');
    await h.svc.disable('user', 'u1', 'correct-password');
    h.setNow(T0 + 30_000);
    const again = await h.svc.startEnrolment('user', 'u1');
    expect(again.secret).not.toBe(first.secret);
    await expect(h.svc.confirmEnrolment('user', 'u1', generateTotpCode(again.secret, nowMs))).resolves.toHaveLength(10);
  });
});

describe('TwoFactorService: admin enrolment at sign-in', () => {
  it('start with the token returns the secret; confirm turns it on, returns the codes once and spends the token', async () => {
    const h = build();
    h.admins.seed({ id: 'a1' });
    const { enrolmentToken, expiresInSeconds } = await h.svc.issueAdminEnrolmentToken('a1', true);
    expect(expiresInSeconds).toBe(600);

    const start = await h.svc.startAdminEnrolmentWithToken(enrolmentToken);
    const done = await h.svc.confirmAdminEnrolmentWithToken(enrolmentToken, generateTotpCode(start.secret, nowMs));
    expect(done.adminId).toBe('a1');
    expect(done.persistent).toBe(true);
    expect(done.backupCodes).toHaveLength(10);
    expect((await h.admins.find('a1'))?.totpEnabledAt).toBeInstanceOf(Date);

    await expect(h.svc.startAdminEnrolmentWithToken(enrolmentToken)).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE }); // spent
  });

  it('a wrong code leaves the token usable; a deactivated admin or one who already enrolled cannot use it', async () => {
    const h = build();
    h.admins.seed({ id: 'a1' });
    const { enrolmentToken } = await h.svc.issueAdminEnrolmentToken('a1', false);
    const start = await h.svc.startAdminEnrolmentWithToken(enrolmentToken);
    await expect(h.svc.confirmAdminEnrolmentWithToken(enrolmentToken, '000000')).rejects.toMatchObject({ message: INVALID_CODE_MESSAGE });
    await expect(h.svc.confirmAdminEnrolmentWithToken(enrolmentToken, generateTotpCode(start.secret, nowMs))).resolves.toBeDefined();

    h.admins.seed({ id: 'a2', accountStatus: 'deactivated' });
    const t2 = await h.svc.issueAdminEnrolmentToken('a2', false);
    await expect(h.svc.startAdminEnrolmentWithToken(t2.enrolmentToken)).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });

    h.admins.seed({ id: 'a3' });
    const t3 = await h.svc.issueAdminEnrolmentToken('a3', false);
    const s3 = await h.svc.startAdminEnrolmentWithToken(t3.enrolmentToken);
    await h.svc.confirmEnrolment('admin', 'a3', generateTotpCode(s3.secret, nowMs)); // enrolled by another route meanwhile
    await expect(h.svc.startAdminEnrolmentWithToken(t3.enrolmentToken)).rejects.toMatchObject({
      response: { code: 'two_factor_already_enabled' },
    });
  });

  it('the enrolment token expires after 10 minutes', async () => {
    const h = build();
    h.admins.seed({ id: 'a1' });
    const { enrolmentToken } = await h.svc.issueAdminEnrolmentToken('a1', false);
    h.redis.advance(10 * 60 + 1);
    await expect(h.svc.startAdminEnrolmentWithToken(enrolmentToken)).rejects.toMatchObject({ message: INVALID_CHALLENGE_MESSAGE });
  });
});

describe('TwoFactorService: ADMIN_2FA_ENFORCED', () => {
  it('only the literal "true" turns enforcement on', () => {
    expect(build({ ADMIN_2FA_ENFORCED: 'true' }).svc.isAdminEnforced()).toBe(true);
    for (const value of ['TRUE', 'True', '1', 'yes', 'false', '', ' true', 'true ']) {
      expect(build({ ADMIN_2FA_ENFORCED: value }).svc.isAdminEnforced()).toBe(false);
    }
    expect(build({}).svc.isAdminEnforced()).toBe(false); // unset: off
  });

  it('logs a warning at start-up while it is not "true", and stays quiet when it is', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    build({}).svc.onModuleInit();
    build({ ADMIN_2FA_ENFORCED: 'TRUE' }).svc.onModuleInit();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('ADMIN_2FA_ENFORCED');
    warn.mockClear();
    build({ ADMIN_2FA_ENFORCED: 'true' }).svc.onModuleInit();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('TwoFactorService: admin reset', () => {
  it('clears the target, runs the audit callback in the same call, and reports false when there was nothing to reset', async () => {
    const h = build();
    await enrol(h, 'admin', 'a1');
    const extra = jest.fn().mockResolvedValue(undefined);
    expect(await h.svc.resetAdmin('a1', extra)).toBe(true);
    expect(extra).toHaveBeenCalledTimes(1);
    expect(await h.admins.find('a1')).toMatchObject({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
    expect(await h.admins.unusedBackupCodes('a1')).toEqual([]);

    extra.mockClear();
    expect(await h.svc.resetAdmin('a1', extra)).toBe(false);
    expect(extra).not.toHaveBeenCalled();
    expect(await h.svc.resetAdmin('nobody', extra)).toBe(false);
  });

  it('also clears a stuck wrong-code lock, so the reset admin can enrol straight away', async () => {
    const h = build();
    await enrol(h, 'admin', 'a1');
    const c = await h.svc.issueChallenge('admin', 'a1', false);
    for (let i = 0; i < CODE_ATTEMPTS_MAX; i++) await h.svc.completeChallenge('admin', c.challengeToken, '000000').catch(() => undefined);
    await h.svc.resetAdmin('a1', async () => undefined);
    expect(h.redis.keys().filter((k) => k.startsWith('2fa:attempts:admin:a1'))).toEqual([]);
  });
});
