import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AuthLimitExceeded, AuthLimitsService } from '../../auth/rate-limit/auth-limits/auth-limits.service';
import { AuthLimitsStore } from '../../auth/rate-limit/auth-limits/auth-limits.store';
import { TwoFactorRecoverySweepService } from './two-factor-recovery-sweep.service';
import {
  ADULT_LINK_TTL_MS,
  ADULT_WAIT_MS,
  GUARDIAN_LINK_TTL_MS,
  RECOVERY_RETENTION_MS,
  TWO_FACTOR_RECOVERY_UNAVAILABLE_CODE,
} from './two-factor-recovery.constants';
import { TwoFactorRecoveryService } from './two-factor-recovery.service';
import { hashRecoverySecret, parseRecoveryToken } from './two-factor-recovery.tokens';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

// ---------------------------------------------------------------------------------------------------------------
// Unit tests for TwoFactorRecoveryService (B-276; Decision Log #455, #456). Everything is in memory: a stateful fake of
// the one table and the user rows, the REAL AuthLimitsService / AuthLimitsStore over a fake Redis whose key expiry
// follows the test clock (so the 60-second gap, the hourly cap and the login lock are the real ones), and a clock the
// tests move. Real Postgres is proven in test/two-factor-recovery.e2e-spec.ts.
// ---------------------------------------------------------------------------------------------------------------

const T0 = new Date('2030-01-01T10:00:00.000Z');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IP = '203.0.113.7';

interface Row {
  id: string;
  userId: string;
  kind: string;
  state: string;
  linkTokenHash: string;
  cancelTokenHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  executeAt: Date | null;
  doneAt: Date | null;
}

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  accountStatus: string;
  totpEnabledAt: Date | null;
  isMinor: boolean;
  displayName: string;
  username: string | null;
  guardian: { email: string; consentStatus: string } | null;
  // B-280: the "withhold guardian notices" flag (the existence of a GuardianNoticeWithhold row).
  withheld: boolean;
}

function userRow(over: Partial<UserRow> & { id: string; email: string }): UserRow {
  return {
    passwordHash: 'hash:pw',
    accountStatus: 'active',
    totpEnabledAt: new Date('2029-01-01T00:00:00Z'),
    isMinor: false,
    displayName: 'Real Name',
    username: null,
    guardian: null,
    withheld: false,
    ...over,
  };
}

type Where = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as Where[]).some((w) => matches(row, w))) return false;
      continue;
    }
    const actual = (row as unknown as Record<string, unknown>)[k];
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      const cond = v as Record<string, unknown>;
      if ('in' in cond && !(cond.in as unknown[]).includes(actual)) return false;
      if ('gt' in cond && !((actual as Date) > (cond.gt as Date))) return false;
      if ('lte' in cond && !((actual as Date) <= (cond.lte as Date))) return false;
      if ('lt' in cond && !((actual as Date) < (cond.lt as Date))) return false;
    } else if (actual instanceof Date && v instanceof Date ? actual.getTime() !== v.getTime() : actual !== v) {
      return false;
    }
  }
  return true;
}

// A Redis stand-in with real INCR / EXPIRE / TTL semantics whose clock is the test clock.
function fakeRedis(now: () => number) {
  const store = new Map<string, { value: number; expiresAt: number | null }>();
  const live = (key: string) => {
    const e = store.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  };
  return {
    down: false,
    async ping() {
      if (this.down) throw new Error('redis down');
      return 'PONG';
    },
    async incr(key: string) {
      if (this.down) throw new Error('redis down');
      const e = live(key);
      if (!e) {
        store.set(key, { value: 1, expiresAt: null });
        return 1;
      }
      e.value += 1;
      return e.value;
    },
    async decr(key: string) {
      const e = live(key);
      if (!e) {
        store.set(key, { value: -1, expiresAt: null });
        return -1;
      }
      e.value -= 1;
      return e.value;
    },
    async expire(key: string, seconds: number) {
      const e = live(key);
      if (e) e.expiresAt = now() + seconds * 1000;
      return e ? 1 : 0;
    },
    async ttl(key: string) {
      const e = live(key);
      if (!e) return -2;
      return e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - now()) / 1000);
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
    async set(key: string, _v: string, _m: 'EX', seconds: number, _f: 'NX') {
      if (live(key)) return null;
      store.set(key, { value: 1, expiresAt: now() + seconds * 1000 });
      return 'OK' as const;
    },
  };
}

function build(users: UserRow[]) {
  const clock = { current: T0.getTime(), now: () => new Date(clock.current) };
  const rows: Row[] = [];
  const log: string[] = [];

  const table = {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
    findFirst: jest.fn(async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null),
    findMany: jest.fn(async ({ where, take }: { where: Where; take?: number }) => {
      const found = rows.filter((r) => matches(r, where)).sort((a, b) => (a.executeAt?.getTime() ?? 0) - (b.executeAt?.getTime() ?? 0));
      return found.slice(0, take ?? found.length).map((r) => {
        const u = users.find((x) => x.id === r.userId);
        return { ...r, user: u ? { ...u, guardianNoticeWithhold: u.withheld ? { id: 'withhold-1' } : null } : undefined };
      });
    }),
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        id: data.id as string,
        userId: data.userId as string,
        kind: data.kind as string,
        state: (data.state as string) ?? 'pending',
        linkTokenHash: data.linkTokenHash as string,
        cancelTokenHash: null,
        createdAt: (data.createdAt as Date) ?? clock.now(),
        expiresAt: data.expiresAt as Date,
        confirmedAt: null,
        executeAt: null,
        doneAt: null,
      };
      rows.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: Where }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { count: hit.length };
    }),
  };
  let prismaRef: unknown;
  const prisma = {
    twoFactorRecoveryRequest: table,
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const u = users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
        return u ? { ...u, guardianNoticeWithhold: u.withheld ? { id: 'withhold-1' } : null } : null;
      }),
    },
    guardianNoticeWithhold: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) =>
        users.find((x) => x.id === where.userId)?.withheld ? { id: 'withhold-1' } : null,
      ),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown): Promise<unknown> => cb(prismaRef)),
  };
  prismaRef = prisma;

  const redis = fakeRedis(() => clock.current);
  const emails = {
    sendTwoFactorRecoveryLinkEmail: jest.fn(async (..._args: string[]) => undefined),
    sendTwoFactorRecoveryGuardianLinkEmail: jest.fn(async (..._args: string[]) => undefined),
    sendTwoFactorRecoveryMinorNoticeEmail: jest.fn(async (..._args: string[]) => undefined),
    sendTwoFactorRecoveryWaitingEmail: jest.fn(async (..._args: string[]) => undefined),
    sendTwoFactorRecoveryCompletedEmail: jest.fn(async (..._args: string[]) => undefined),
    sendTwoFactorRecoveryApprovedEmail: jest.fn(async (..._args: string[]) => undefined),
    sendTwoFactorRecoveryDeclinedEmail: jest.fn(async (..._args: string[]) => undefined),
  };
  const passwords = {
    hash: jest.fn(async (p: string) => `hash:${p}`),
    verify: jest.fn(async (h: string, p: string) => h === `hash:${p}`),
  };
  const tokenService = {
    revokeAllSessionsForUser: jest.fn(async (id: string) => {
      log.push(`revoke:${id}`);
    }),
  };
  // Mirrors TwoFactorService.resetUser: the clearing and `extra` are one unit; if `extra` throws nothing is cleared.
  const twoFactor = {
    resetUser: jest.fn(async (userId: string, extra: (tx: unknown) => Promise<void>) => {
      const u = users.find((x) => x.id === userId);
      if (!u || !u.totpEnabledAt) return false;
      await extra(prismaRef);
      u.totpEnabledAt = null;
      log.push(`cleared:${userId}`);
      return true;
    }),
  };
  const limitStore = new AuthLimitsStore(redis as never);
  const notifier = { notifyInBackground: jest.fn() };
  const limits = new AuthLimitsService(limitStore, notifier as never, { get: () => undefined } as never);

  const service = new TwoFactorRecoveryService(
    prisma as never,
    twoFactor as never,
    passwords as never,
    tokenService as never,
    limits,
    limitStore,
    emails as never,
    redis as never,
    clock,
  );
  const sweep = new TwoFactorRecoverySweepService(service, clock);
  return { service, sweep, rows, users, clock, redis, emails, passwords, tokenService, twoFactor, prisma, limits, limitStore, log };
}

const adult = () => userRow({ id: 'adult-1', email: 'adult@example.com' });
const minor = (guardian: UserRow['guardian'] = { email: 'guardian@example.com', consentStatus: 'confirmed' }) =>
  userRow({ id: 'minor-1', email: 'minor@example.com', isMinor: true, displayName: 'Young Person', username: 'young_one', guardian });

// The token a mock email call received (links are emailed as "<id>.<secret>").
const sentToken = (fn: jest.Mock, argIndex = 1): string => fn.mock.calls[fn.mock.calls.length - 1][argIndex] as string;

async function expectLinkError(promise: Promise<unknown>, state: 'invalid' | 'expired' | 'used') {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BadRequestException);
  expect((err as BadRequestException).getResponse()).toEqual(expect.objectContaining({ state, code: `two_factor_recovery_link_${state}` }));
}

describe('TwoFactorRecoveryService.request', () => {
  it('gives the SAME answer, does the SAME work and sends nothing for an unknown email, a wrong password, two-factor off and an inactive account', async () => {
    const t = build([
      adult(),
      userRow({ id: 'off', email: 'off@example.com', totpEnabledAt: null }),
      userRow({ id: 'gone', email: 'gone@example.com', accountStatus: 'deactivated' }),
    ]);
    await t.service.onModuleInit();

    const answers: string[] = [];
    const verifyCalls: number[] = [];
    const cases: [string, string][] = [
      ['nobody@example.com', 'pw'],
      ['adult@example.com', 'WRONG'],
      ['off@example.com', 'pw'],
      ['gone@example.com', 'pw'],
    ];
    for (const [email, password] of cases) {
      const before = t.passwords.verify.mock.calls.length;
      const a = await t.service.request(email, password, IP);
      verifyCalls.push(t.passwords.verify.mock.calls.length - before);
      answers.push(JSON.stringify(a));
    }

    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBe(JSON.stringify({ audience: 'account' }));
    // One argon2 verification each, always (a dummy hash when there is no usable account).
    expect(verifyCalls).toEqual([1, 1, 1, 1]);
    expect(t.rows).toHaveLength(0);
    for (const fn of Object.values(t.emails)) expect(fn).not.toHaveBeenCalled();
  });

  it('adult: creates a pending request that lasts 24 hours and emails a link to the account address', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();

    const answer = await t.service.request(' Adult@Example.com ', 'pw', IP);

    expect(answer).toEqual({ audience: 'account' });
    expect(t.rows).toHaveLength(1);
    const row = t.rows[0];
    expect(row).toMatchObject({ userId: 'adult-1', kind: 'adult', state: 'pending' });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(ADULT_LINK_TTL_MS);
    expect(t.emails.sendTwoFactorRecoveryLinkEmail).toHaveBeenCalledTimes(1);
    const token = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);
    expect(t.emails.sendTwoFactorRecoveryLinkEmail.mock.calls[0][0]).toBe('adult@example.com');
    // Only the HASH of the secret is stored.
    const parsed = parseRecoveryToken(token)!;
    expect(parsed.id).toBe(row.id);
    expect(row.linkTokenHash).toBe(hashRecoverySecret(parsed.secret));
    expect(JSON.stringify(row)).not.toContain(parsed.secret);
    expect(t.emails.sendTwoFactorRecoveryGuardianLinkEmail).not.toHaveBeenCalled();
  });

  it('minor with a confirmed guardian: the link goes to the GUARDIAN for 72 hours and the minor is told', async () => {
    const t = build([minor()]);
    await t.service.onModuleInit();

    const answer = await t.service.request('minor@example.com', 'pw', IP);

    expect(answer).toEqual({ audience: 'guardian' });
    const row = t.rows[0];
    expect(row).toMatchObject({ kind: 'guardian', state: 'pending' });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(GUARDIAN_LINK_TTL_MS);
    expect(t.emails.sendTwoFactorRecoveryGuardianLinkEmail).toHaveBeenCalledWith(
      'guardian@example.com',
      expect.stringContaining(row.id),
      'Young Person',
    );
    // The minor's OWN address gets a notice that it went to the guardian, and not the link.
    expect(t.emails.sendTwoFactorRecoveryMinorNoticeEmail).toHaveBeenCalledWith('minor@example.com', 'Young Person');
    expect(t.emails.sendTwoFactorRecoveryLinkEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['no guardian row', null],
    ['consent still pending', { email: 'guardian@example.com', consentStatus: 'pending' }],
    ['consent declined', { email: 'guardian@example.com', consentStatus: 'declined' }],
    ['no email on file', { email: '  ', consentStatus: 'confirmed' }],
  ])('minor with no confirmed guardian (%s): { audience: "no_guardian" }, nothing created, nothing sent', async (_name, guardian) => {
    const t = build([minor(guardian)]);
    await t.service.onModuleInit();

    expect(await t.service.request('minor@example.com', 'pw', IP)).toEqual({ audience: 'no_guardian' });

    expect(t.rows).toHaveLength(0);
    for (const fn of Object.values(t.emails)) expect(fn).not.toHaveBeenCalled();
  });

  it('a new request supersedes an earlier UNUSED one: one active request, the old link reads as expired', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    const firstToken = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);
    t.clock.current += 2 * MIN;

    await t.service.request('adult@example.com', 'pw', IP);
    const secondToken = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);

    expect(t.rows.map((r) => r.state).sort()).toEqual(['pending', 'superseded']);
    expect(t.rows.filter((r) => ['pending', 'waiting'].includes(r.state))).toHaveLength(1);
    expect((await t.service.describeLink(firstToken)).state).toBe('expired');
    expect((await t.service.describeLink(secondToken)).state).toBe('valid');
    await expectLinkError(t.service.confirm(firstToken), 'expired');
  });

  it('a request that is already WAITING is left alone: no second row, no second email', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    await t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryLinkEmail, 1));
    t.clock.current += 2 * MIN;
    t.emails.sendTwoFactorRecoveryLinkEmail.mockClear();

    expect(await t.service.request('adult@example.com', 'pw', IP)).toEqual({ audience: 'account' });

    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].state).toBe('waiting');
    expect(t.emails.sendTwoFactorRecoveryLinkEmail).not.toHaveBeenCalled();
  });

  describe('limits', () => {
    it('a second request within 60 seconds is a 429 with a Retry-After, and is allowed once the gap has passed', async () => {
      const t = build([adult()]);
      await t.service.onModuleInit();
      await t.service.request('adult@example.com', 'pw', IP);
      t.clock.current += 20 * 1000;

      const err = await t.service.request('adult@example.com', 'pw', IP).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AuthLimitExceeded);
      expect((err as AuthLimitExceeded).retryAfterSeconds).toBeGreaterThan(0);
      expect((err as AuthLimitExceeded).retryAfterSeconds).toBeLessThanOrEqual(60);

      t.clock.current += 41 * 1000;
      await expect(t.service.request('adult@example.com', 'pw', IP)).resolves.toEqual({ audience: 'account' });
    });

    it('at most three requests an hour, per account; the fourth is a 429 and the window reopens after an hour', async () => {
      const t = build([adult()]);
      await t.service.onModuleInit();
      for (let i = 0; i < 3; i++) {
        await t.service.request('adult@example.com', 'pw', IP);
        t.clock.current += 2 * MIN;
      }
      await expect(t.service.request('adult@example.com', 'pw', IP)).rejects.toBeInstanceOf(AuthLimitExceeded);
      // A refused request spent nothing and made nothing.
      expect(t.rows).toHaveLength(3);

      t.clock.current += HOUR;
      await expect(t.service.request('adult@example.com', 'pw', IP)).resolves.toEqual({ audience: 'account' });
    });

    it('the 429 is the same for an email that has no account (it is keyed on the email alone)', async () => {
      const t = build([adult()]);
      await t.service.onModuleInit();
      const outcomes: unknown[] = [];
      for (const email of ['adult@example.com', 'nobody@example.com']) {
        await t.service.request(email, 'pw', IP).catch(() => undefined);
        t.clock.current += 10 * 1000;
        outcomes.push(await t.service.request(email, 'pw', IP).then(() => 'ok', (e: unknown) => (e as Error).constructor.name));
        t.clock.current += HOUR;
      }
      expect(outcomes).toEqual(['AuthLimitExceeded', 'AuthLimitExceeded']);
    });

    it('a wrong password spends the SAME failed-attempt budget as a wrong password at sign-in', async () => {
      const t = build([adult()]);
      await t.service.onModuleInit();
      // Three wrong passwords through recovery (spaced past the gap)...
      for (let i = 0; i < 3; i++) {
        await t.service.request('adult@example.com', 'WRONG', IP);
        t.clock.current += 2 * MIN;
      }
      // ...and two more at sign-in make five failed attempts for this account and address: the sixth is refused.
      for (let i = 0; i < 2; i++) {
        const ticket = await t.limits.beginLogin(IP, 'adult@example.com');
        await t.limits.endLogin(ticket, 'failed-credentials');
      }
      await expect(t.limits.beginLogin(IP, 'adult@example.com')).rejects.toBeInstanceOf(AuthLimitExceeded);
    });

    it('a correct password does not spend the failed-attempt budget', async () => {
      const t = build([adult()]);
      await t.service.onModuleInit();
      for (let i = 0; i < 3; i++) {
        await t.service.request('adult@example.com', 'pw', IP);
        t.clock.current += 2 * MIN;
      }
      for (let i = 0; i < 5; i++) {
        const ticket = await t.limits.beginLogin(IP, 'adult@example.com');
        await t.limits.endLogin(ticket, 'failed-credentials');
      }
      // Five failed sign-ins, and the three successful recovery requests did not count among them.
      await expect(t.limits.beginLogin(IP, 'adult@example.com')).rejects.toBeInstanceOf(AuthLimitExceeded);
    });

    it('an infrastructure error gives the reserved login slots back (it is not a failed attempt)', async () => {
      const t = build([adult()]);
      await t.service.onModuleInit();
      const endLogin = jest.spyOn(t.limits, 'endLogin');
      t.prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));

      await expect(t.service.request('adult@example.com', 'pw', IP)).rejects.toThrow('db down');

      expect(endLogin).toHaveBeenCalledWith(expect.anything(), 'other');
    });
  });

  it('is unavailable while Redis is down: 503 with a code, and nothing is created, sent or counted', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    t.redis.down = true;
    const beginLogin = jest.spyOn(t.limits, 'beginLogin');

    const err = await t.service.request('adult@example.com', 'pw', IP).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toEqual(
      expect.objectContaining({ statusCode: 503, code: TWO_FACTOR_RECOVERY_UNAVAILABLE_CODE }),
    );
    expect(beginLogin).not.toHaveBeenCalled();
    expect(t.rows).toHaveLength(0);
    expect(t.emails.sendTwoFactorRecoveryLinkEmail).not.toHaveBeenCalled();
  });
});

describe('TwoFactorRecoveryService.describeLink', () => {
  it('adult: valid shows nothing beyond the state and the kind', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    const token = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);

    expect(await t.service.describeLink(token)).toEqual({ state: 'valid', kind: 'adult' });
  });

  it('guardian: valid shows the minor\'s PUBLIC name (never the real name) and when the request was made', async () => {
    const t = build([minor()]);
    await t.service.onModuleInit();
    await t.service.request('minor@example.com', 'pw', IP);
    const token = sentToken(t.emails.sendTwoFactorRecoveryGuardianLinkEmail);

    const summary = await t.service.describeLink(token);

    expect(summary).toEqual({
      state: 'valid',
      kind: 'guardian',
      minor: { publicName: 'young_one' },
      requestedAt: T0.toISOString(),
    });
    expect(JSON.stringify(summary)).not.toContain('Young Person');
  });

  it('a minor with no username is shown as "Soccernity member"', async () => {
    const m = minor();
    m.username = null;
    const t = build([m]);
    await t.service.onModuleInit();
    await t.service.request('minor@example.com', 'pw', IP);

    const summary = await t.service.describeLink(sentToken(t.emails.sendTwoFactorRecoveryGuardianLinkEmail));

    expect(summary.minor).toEqual({ publicName: 'Soccernity member' });
  });

  it('has no side effects: reading a link twice changes nothing', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    const token = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);
    const snapshot = JSON.stringify(t.rows);
    t.prisma.twoFactorRecoveryRequest.updateMany.mockClear();

    await t.service.describeLink(token);
    await t.service.describeLink(token);

    expect(JSON.stringify(t.rows)).toBe(snapshot);
    expect(t.prisma.twoFactorRecoveryRequest.updateMany).not.toHaveBeenCalled();
  });

  it('expires: 24 hours for an adult link, 72 for a guardian link', async () => {
    const a = build([adult()]);
    await a.service.onModuleInit();
    await a.service.request('adult@example.com', 'pw', IP);
    const adultToken = sentToken(a.emails.sendTwoFactorRecoveryLinkEmail);
    a.clock.current = T0.getTime() + ADULT_LINK_TTL_MS - 1;
    expect((await a.service.describeLink(adultToken)).state).toBe('valid');
    a.clock.current = T0.getTime() + ADULT_LINK_TTL_MS + 1;
    expect(await a.service.describeLink(adultToken)).toEqual({ state: 'expired', kind: 'adult' });

    const g = build([minor()]);
    await g.service.onModuleInit();
    await g.service.request('minor@example.com', 'pw', IP);
    const guardianToken = sentToken(g.emails.sendTwoFactorRecoveryGuardianLinkEmail);
    g.clock.current = T0.getTime() + GUARDIAN_LINK_TTL_MS - 1;
    expect((await g.service.describeLink(guardianToken)).state).toBe('valid');
    g.clock.current = T0.getTime() + GUARDIAN_LINK_TTL_MS + 1;
    expect((await g.service.describeLink(guardianToken)).state).toBe('expired');
  });

  it.each([['garbage'], [''], ['no-dot'], ['a.'], ['.b'], [undefined], [42]])('"%s" is invalid', async (token) => {
    const t = build([adult()]);
    expect(await t.service.describeLink(token as never)).toEqual({ state: 'invalid', kind: null });
  });

  it('a right id with a wrong secret is invalid, and so is a cancel token used as a link token', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    const token = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);
    const id = parseRecoveryToken(token)!.id;
    expect(await t.service.describeLink(`${id}.not-the-secret`)).toEqual({ state: 'invalid', kind: null });

    const confirmed = await t.service.confirm(token);
    expect(await t.service.describeLink(confirmed.cancelToken)).toEqual({ state: 'invalid', kind: null });
    // And the used link now reads as used.
    expect(await t.service.describeLink(token)).toEqual({ state: 'used', kind: 'adult' });
  });
});

describe('TwoFactorRecoveryService.confirm / cancel (adult)', () => {
  async function requested() {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    return { t, token: sentToken(t.emails.sendTwoFactorRecoveryLinkEmail) };
  }

  it('confirm starts the 24-hour wait, consumes the link and emails a notice with a separate cancel link', async () => {
    const { t, token } = await requested();
    t.clock.current += 5 * MIN;
    const now = t.clock.current;

    const result = await t.service.confirm(token);

    expect(result.state).toBe('waiting');
    expect(result.executeAt).toBe(new Date(now + ADULT_WAIT_MS).toISOString());
    const row = t.rows[0];
    expect(row).toMatchObject({ state: 'waiting' });
    expect(row.executeAt!.getTime()).toBe(now + ADULT_WAIT_MS);
    expect(row.confirmedAt!.getTime()).toBe(now);
    // The notice carries the cancel token, which is a DIFFERENT secret from the link.
    expect(t.emails.sendTwoFactorRecoveryWaitingEmail).toHaveBeenCalledWith(
      'adult@example.com',
      result.cancelToken,
      expect.stringMatching(/UTC$/),
    );
    expect(parseRecoveryToken(result.cancelToken)!.secret).not.toBe(parseRecoveryToken(token)!.secret);
    expect(row.cancelTokenHash).toBe(hashRecoverySecret(parseRecoveryToken(result.cancelToken)!.secret));
    expect(row.cancelTokenHash).not.toBe(row.linkTokenHash);
  });

  it('a second use of the link answers "used", and an expired link answers "expired"', async () => {
    const { t, token } = await requested();
    await t.service.confirm(token);
    await expectLinkError(t.service.confirm(token), 'used');

    const other = await requested();
    other.t.clock.current += ADULT_LINK_TTL_MS + 1;
    await expectLinkError(other.t.service.confirm(other.token), 'expired');
    expect(other.t.rows[0].state).toBe('pending');
  });

  it('two simultaneous clicks: exactly one wins (the claim is atomic)', async () => {
    const { t, token } = await requested();
    const results = await Promise.allSettled([t.service.confirm(token), t.service.confirm(token)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(t.emails.sendTwoFactorRecoveryWaitingEmail).toHaveBeenCalledTimes(1);
  });

  it('a guardian link is "invalid" on the adult confirm route, and garbage is invalid', async () => {
    const t = build([minor()]);
    await t.service.onModuleInit();
    await t.service.request('minor@example.com', 'pw', IP);
    await expectLinkError(t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryGuardianLinkEmail)), 'invalid');
    await expectLinkError(t.service.confirm('nonsense'), 'invalid');
  });

  it('if the account changed since the link was sent (two-factor already off), the request no longer applies', async () => {
    const { t, token } = await requested();
    t.users[0].totpEnabledAt = null;
    await expectLinkError(t.service.confirm(token), 'expired');
    expect(t.rows[0].state).toBe('superseded');
  });

  it('cancel by the cancel link stops a waiting request; a second use says "used"; the sweep then removes nothing', async () => {
    const { t, token } = await requested();
    const { cancelToken } = await t.service.confirm(token);

    expect(await t.service.cancel(cancelToken)).toEqual({ state: 'cancelled' });
    expect(t.rows[0]).toMatchObject({ state: 'cancelled' });
    expect(t.rows[0].doneAt).not.toBeNull();
    await expectLinkError(t.service.cancel(cancelToken), 'used');

    t.clock.current += ADULT_WAIT_MS + HOUR;
    const swept = await t.sweep.sweep();
    expect(swept.completed).toEqual([]);
    expect(t.twoFactor.resetUser).not.toHaveBeenCalled();
    expect(t.users[0].totpEnabledAt).not.toBeNull();
  });

  it('the cancel route does not accept a LINK token, and the link route does not accept a cancel token', async () => {
    const { t, token } = await requested();
    const { cancelToken } = await t.service.confirm(token);
    await expectLinkError(t.service.cancel(token), 'invalid');
    await expectLinkError(t.service.confirm(cancelToken), 'invalid');
    await expectLinkError(t.service.cancel('junk'), 'invalid');
  });

  it('cancel is still possible just after executeAt, until the sweep has actually removed two-factor', async () => {
    const { t, token } = await requested();
    const { cancelToken } = await t.service.confirm(token);
    t.clock.current += ADULT_WAIT_MS + 5 * MIN;

    await expect(t.service.cancel(cancelToken)).resolves.toEqual({ state: 'cancelled' });
  });

  it('cancel after the removal is "used"', async () => {
    const { t, token } = await requested();
    const { cancelToken } = await t.service.confirm(token);
    t.clock.current += ADULT_WAIT_MS;
    await t.sweep.sweep();
    await expectLinkError(t.service.cancel(cancelToken), 'used');
  });
});

describe('the full adult path across the 24 hours (APP_CLOCK)', () => {
  it('request -> confirm -> wait -> the sweep removes two-factor, ends every session first, and emails a completion notice', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    const confirmedAt = t.clock.current + 10 * MIN;
    t.clock.current = confirmedAt;
    await t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryLinkEmail));

    // 23 hours 59 minutes after confirming: not yet.
    t.clock.current = confirmedAt + ADULT_WAIT_MS - MIN;
    expect(await t.sweep.sweep()).toEqual({ completed: [], cancelled: [], deleted: 0 });
    expect(t.users[0].totpEnabledAt).not.toBeNull();
    expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();

    // Exactly 24 hours: done.
    t.clock.current = confirmedAt + ADULT_WAIT_MS;
    const swept = await t.sweep.sweep();
    expect(swept.completed).toEqual([t.rows[0].id]);
    expect(t.rows[0]).toMatchObject({ state: 'done' });
    expect(t.rows[0].doneAt!.getTime()).toBe(confirmedAt + ADULT_WAIT_MS);
    expect(t.users[0].totpEnabledAt).toBeNull();
    // Sessions are ended BEFORE two-factor is cleared, never after.
    expect(t.log).toEqual(['revoke:adult-1', 'cleared:adult-1']);
    expect(t.emails.sendTwoFactorRecoveryCompletedEmail).toHaveBeenCalledWith('adult@example.com');

    // A second run finds nothing to do and sends nothing more.
    expect(await t.sweep.sweep()).toEqual({ completed: [], cancelled: [], deleted: 0 });
    expect(t.emails.sendTwoFactorRecoveryCompletedEmail).toHaveBeenCalledTimes(1);
  });

  it('a request cancelled in the instant the sweep runs loses cleanly: nothing is cleared and no email is sent', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    await t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryLinkEmail));
    t.clock.current += ADULT_WAIT_MS;
    // The cancel lands between the sweep's read and its claim: simulate by cancelling the row inside resetUser's callback.
    const original = t.twoFactor.resetUser.getMockImplementation()!;
    t.twoFactor.resetUser.mockImplementationOnce(async (userId: string, extra: (tx: unknown) => Promise<void>) => {
      t.rows[0].state = 'cancelled';
      return original(userId, extra);
    });

    const swept = await t.sweep.sweep();

    expect(swept.completed).toEqual([]);
    expect(t.users[0].totpEnabledAt).not.toBeNull();
    expect(t.emails.sendTwoFactorRecoveryCompletedEmail).not.toHaveBeenCalled();
  });

  it('a successful two-factor sign-in cancels a WAITING request (a pending one is untouched)', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    await t.service.cancelWaitingOnSignIn('adult-1');
    expect(t.rows[0].state).toBe('pending');

    await t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryLinkEmail));
    expect(await t.service.findWaiting('adult-1')).toEqual({ executeAt: new Date(T0.getTime() + ADULT_WAIT_MS) });
    await t.service.cancelWaitingOnSignIn('adult-1');

    expect(t.rows[0].state).toBe('cancelled');
    expect(await t.service.findWaiting('adult-1')).toBeNull();
    t.clock.current += ADULT_WAIT_MS + HOUR;
    expect((await t.sweep.sweep()).completed).toEqual([]);
    expect(t.users[0].totpEnabledAt).not.toBeNull();
  });

  it('cancelWaitingOnSignIn never throws', async () => {
    const t = build([adult()]);
    t.prisma.twoFactorRecoveryRequest.updateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(t.service.cancelWaitingOnSignIn('adult-1')).resolves.toBeUndefined();
  });

  it('a wait for an account that has since closed, or already turned two-factor off, is cancelled without removing anything', async () => {
    for (const change of [
      (u: UserRow) => {
        u.accountStatus = 'pending_deletion';
      },
      (u: UserRow) => {
        u.totpEnabledAt = null;
      },
    ]) {
      const t = build([adult()]);
      await t.service.onModuleInit();
      await t.service.request('adult@example.com', 'pw', IP);
      await t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryLinkEmail));
      change(t.users[0]);
      t.clock.current += ADULT_WAIT_MS;

      const swept = await t.sweep.sweep();

      expect(swept).toEqual({ completed: [], cancelled: [t.rows[0].id], deleted: 0 });
      expect(t.rows[0].state).toBe('cancelled');
      expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(t.emails.sendTwoFactorRecoveryCompletedEmail).not.toHaveBeenCalled();
    }
  });

  it('one failing row does not strand the others', async () => {
    const t = build([adult(), userRow({ id: 'adult-2', email: 'adult2@example.com' })]);
    await t.service.onModuleInit();
    for (const email of ['adult@example.com', 'adult2@example.com']) {
      await t.service.request(email, 'pw', IP);
      await t.service.confirm(sentToken(t.emails.sendTwoFactorRecoveryLinkEmail));
    }
    t.clock.current += ADULT_WAIT_MS;
    t.tokenService.revokeAllSessionsForUser.mockRejectedValueOnce(new Error('redis down'));

    const swept = await t.sweep.sweep();

    expect(swept.completed).toHaveLength(1);
    expect(t.rows.map((r) => r.state).sort()).toEqual(['done', 'waiting']);
    // The failed one is retried by the next run.
    expect((await t.sweep.sweep()).completed).toHaveLength(1);
  });
});

describe('the 30-day cleanup', () => {
  it('deletes ended rows 30 days after they ended and never-used links 30 days after they expired, and keeps the rest', async () => {
    const t = build([adult()]);
    const mk = (id: string, state: string, doneAt: Date | null, expiresAt: Date): Row => ({
      id,
      userId: 'adult-1',
      kind: 'adult',
      state,
      linkTokenHash: 'x',
      cancelTokenHash: null,
      createdAt: T0,
      expiresAt,
      confirmedAt: state === 'waiting' ? T0 : null,
      executeAt: state === 'waiting' ? new Date(T0.getTime() + DAY) : null,
      doneAt,
    });
    const old = new Date(T0.getTime() - RECOVERY_RETENTION_MS - DAY);
    const young = new Date(T0.getTime() - RECOVERY_RETENTION_MS + DAY);
    t.rows.push(
      mk('done-old', 'done', old, old),
      mk('cancelled-old', 'cancelled', old, old),
      mk('declined-old', 'declined', old, old),
      mk('superseded-old', 'superseded', old, old),
      mk('pending-expired-old', 'pending', null, old),
      mk('done-young', 'done', young, young),
      mk('pending-expired-young', 'pending', null, young),
      mk('pending-live', 'pending', null, new Date(T0.getTime() + DAY)),
      mk('waiting', 'waiting', null, old),
    );

    const swept = await t.sweep.sweep(T0);

    expect(swept.deleted).toBe(5);
    expect(t.rows.map((r) => r.id).sort()).toEqual(['done-young', 'pending-expired-young', 'pending-live', 'waiting']);
  });
});

describe('guardian approve / decline', () => {
  async function requested(over: Partial<UserRow> = {}) {
    const m = { ...minor(), ...over };
    const t = build([m]);
    await t.service.onModuleInit();
    await t.service.request('minor@example.com', 'pw', IP);
    return { t, token: sentToken(t.emails.sendTwoFactorRecoveryGuardianLinkEmail) };
  }

  it('approve removes two-factor at once, ends every session first, marks the request done and emails the MINOR\'s own address', async () => {
    const { t, token } = await requested();
    t.clock.current += HOUR;

    expect(await t.service.approve(token)).toEqual({ state: 'done' });

    expect(t.users[0].totpEnabledAt).toBeNull();
    expect(t.rows[0]).toMatchObject({ state: 'done' });
    expect(t.log).toEqual(['revoke:minor-1', 'cleared:minor-1']);
    expect(t.emails.sendTwoFactorRecoveryApprovedEmail).toHaveBeenCalledWith('minor@example.com', 'Young Person');
    // Exactly one guardian email for the whole flow: the request link. Approving sends the guardian nothing.
    expect(t.emails.sendTwoFactorRecoveryGuardianLinkEmail).toHaveBeenCalledTimes(1);
    expect(t.emails.sendTwoFactorRecoveryDeclinedEmail).not.toHaveBeenCalled();
  });

  it('a second approve says "used" and removes nothing more; two simultaneous approvals have exactly one winner', async () => {
    const { t, token } = await requested();
    const results = await Promise.allSettled([t.service.approve(token), t.service.approve(token)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(t.emails.sendTwoFactorRecoveryApprovedEmail).toHaveBeenCalledTimes(1);
    await expectLinkError(t.service.approve(token), 'used');
  });

  it('decline cancels, leaves two-factor on and tells the minor (to change their password); a later approve is "used"', async () => {
    const { t, token } = await requested();

    expect(await t.service.decline(token)).toEqual({ state: 'declined' });

    expect(t.rows[0]).toMatchObject({ state: 'declined' });
    expect(t.users[0].totpEnabledAt).not.toBeNull();
    expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect(t.emails.sendTwoFactorRecoveryDeclinedEmail).toHaveBeenCalledWith('minor@example.com', 'Young Person');
    await expectLinkError(t.service.approve(token), 'used');
    await expectLinkError(t.service.decline(token), 'used');
  });

  it('the 72-hour link expires: approve and decline both answer "expired"', async () => {
    const { t, token } = await requested();
    t.clock.current += GUARDIAN_LINK_TTL_MS + 1;
    await expectLinkError(t.service.approve(token), 'expired');
    await expectLinkError(t.service.decline(token), 'expired');
    expect(t.users[0].totpEnabledAt).not.toBeNull();
  });

  it('an ADULT link is "invalid" on the guardian routes, and garbage is invalid', async () => {
    const t = build([adult()]);
    await t.service.onModuleInit();
    await t.service.request('adult@example.com', 'pw', IP);
    const adultToken = sentToken(t.emails.sendTwoFactorRecoveryLinkEmail);
    await expectLinkError(t.service.approve(adultToken), 'invalid');
    await expectLinkError(t.service.decline(adultToken), 'invalid');
    await expectLinkError(t.service.approve('nonsense'), 'invalid');
    expect(t.users[0].totpEnabledAt).not.toBeNull();
  });

  it('if the minor has since turned 18, or the account closed, the guardian can no longer remove anything', async () => {
    for (const change of [
      (u: UserRow) => {
        u.isMinor = false;
      },
      (u: UserRow) => {
        u.accountStatus = 'pending_deletion';
      },
      (u: UserRow) => {
        u.totpEnabledAt = null;
      },
    ]) {
      const { t, token } = await requested();
      change(t.users[0]);
      await expectLinkError(t.service.approve(token), 'expired');
      expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(t.emails.sendTwoFactorRecoveryApprovedEmail).not.toHaveBeenCalled();
    }
  });

  it('approve is refused while Redis is down (it must end the sessions), and nothing is cleared', async () => {
    const { t, token } = await requested();
    t.redis.down = true;
    await expect(t.service.approve(token)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(t.users[0].totpEnabledAt).not.toBeNull();
    expect(t.rows[0].state).toBe('pending');
  });
});

// B-280 (Decision Log #458) + Decision Log #480: while guardian notices are withheld for a minor's account,
// guardian-assisted recovery is off and the minor takes the ADULT path (own email, 24-hour wait).
describe('withhold guardian notices (B-280, Decision Log #480)', () => {
  const flagged = (guardian?: UserRow['guardian']) => {
    const t = build([guardian === undefined ? minor() : minor(guardian)]);
    t.users[0].withheld = true;
    return t;
  };

  it('request: a flagged minor gets { audience: "account" } and the link goes to their OWN email; nothing goes to a guardian', async () => {
    const t = flagged();
    await t.service.onModuleInit();

    expect(await t.service.request('minor@example.com', 'pw', IP)).toEqual({ audience: 'account' });

    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ userId: 'minor-1', kind: 'adult', state: 'pending' });
    expect(t.rows[0].expiresAt.getTime() - t.clock.current).toBe(ADULT_LINK_TTL_MS);
    expect(t.emails.sendTwoFactorRecoveryLinkEmail).toHaveBeenCalledTimes(1);
    expect(t.emails.sendTwoFactorRecoveryLinkEmail.mock.calls[0][0]).toBe('minor@example.com');
    expect(t.emails.sendTwoFactorRecoveryGuardianLinkEmail).not.toHaveBeenCalled();
    expect(t.emails.sendTwoFactorRecoveryMinorNoticeEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['no guardian row', null],
    ['a pending guardian', { email: 'guardian@example.com', consentStatus: 'pending' }],
    ['a confirmed guardian', { email: 'guardian@example.com', consentStatus: 'confirmed' }],
  ] as const)('request: a flagged minor with %s takes the adult path (the flag decides, not the guardian)', async (_n, guardian) => {
    const t = flagged(guardian as UserRow['guardian']);
    await t.service.onModuleInit();
    expect(await t.service.request('minor@example.com', 'pw', IP)).toEqual({ audience: 'account' });
    expect(t.rows[0]).toMatchObject({ kind: 'adult' });
    expect(t.emails.sendTwoFactorRecoveryGuardianLinkEmail).not.toHaveBeenCalled();
  });

  it('request: the same work and the same budget as a normal request (one verification, the limiter is charged)', async () => {
    const t = flagged();
    await t.service.onModuleInit();

    await t.service.request('minor@example.com', 'pw', IP);
    expect(t.passwords.verify).toHaveBeenCalledTimes(1);
    // The 60-second gap was spent, so an immediate second request is limited like any other.
    await expect(t.service.request('minor@example.com', 'pw', IP)).rejects.toBeInstanceOf(AuthLimitExceeded);
  });

  it('request: a WRONG password on a flagged minor is the generic account answer, byte-identical to the correct one (nothing about the account is revealed)', async () => {
    const t = flagged();
    await t.service.onModuleInit();
    const wrong = await t.service.request('minor@example.com', 'WRONG', IP);
    expect(wrong).toEqual({ audience: 'account' });
    expect(t.rows).toHaveLength(0);

    const t2 = flagged();
    await t2.service.onModuleInit();
    const right = await t2.service.request('minor@example.com', 'pw', IP);
    expect(JSON.stringify(right)).toBe(JSON.stringify(wrong));
  });

  it('request: an unflagged minor is exactly as before (guardian link, or no_guardian)', async () => {
    const a = build([minor()]);
    await a.service.onModuleInit();
    expect(await a.service.request('minor@example.com', 'pw', IP)).toEqual({ audience: 'guardian' });
    const b = build([minor(null)]);
    await b.service.onModuleInit();
    expect(await b.service.request('minor@example.com', 'pw', IP)).toEqual({ audience: 'no_guardian' });
  });

  it('request: an ADULT is untouched by the flag', async () => {
    const t = build([adult()]);
    t.users[0].withheld = true;
    await t.service.onModuleInit();

    expect(await t.service.request('adult@example.com', 'pw', IP)).toEqual({ audience: 'account' });
    expect(t.emails.sendTwoFactorRecoveryLinkEmail).toHaveBeenCalledTimes(1);
  });

  describe('the adult-kind wait on a flagged minor', () => {
    async function requested() {
      const t = flagged();
      await t.service.onModuleInit();
      await t.service.request('minor@example.com', 'pw', IP);
      return { t, token: sentToken(t.emails.sendTwoFactorRecoveryLinkEmail) };
    }

    it('confirm starts the 24-hour wait while the flag is still set', async () => {
      const { t, token } = await requested();
      const result = await t.service.confirm(token);
      expect(result.state).toBe('waiting');
      expect(t.rows[0].state).toBe('waiting');
      expect(t.emails.sendTwoFactorRecoveryWaitingEmail).toHaveBeenCalledWith('minor@example.com', expect.any(String), expect.any(String));
    });

    it('confirm: if the flag was CLEARED after the request, the link reads as expired and nothing starts', async () => {
      const { t, token } = await requested();
      t.users[0].withheld = false;
      await expectLinkError(t.service.confirm(token), 'expired');
      expect(t.rows[0].state).toBe('superseded');
      expect(t.emails.sendTwoFactorRecoveryWaitingEmail).not.toHaveBeenCalled();
    });

    it('sweep: the wait completes (two-factor removed, sessions ended) while the flag is still set', async () => {
      const { t, token } = await requested();
      await t.service.confirm(token);
      t.clock.current += ADULT_WAIT_MS + 1;
      const result = await t.sweep.sweep(t.clock.now());
      expect(result.completed).toEqual([t.rows[0].id]);
      expect(t.users[0].totpEnabledAt).toBeNull();
      expect(t.log).toEqual(['revoke:minor-1', 'cleared:minor-1']);
      expect(t.emails.sendTwoFactorRecoveryCompletedEmail).toHaveBeenCalledWith('minor@example.com');
    });

    it('sweep: if the flag was CLEARED during the wait, the request is cancelled and nothing is removed', async () => {
      const { t, token } = await requested();
      await t.service.confirm(token);
      t.users[0].withheld = false;
      t.clock.current += ADULT_WAIT_MS + 1;
      const result = await t.sweep.sweep(t.clock.now());
      expect(result.completed).toEqual([]);
      expect(result.cancelled).toEqual([t.rows[0].id]);
      expect(t.rows[0].state).toBe('cancelled');
      expect(t.users[0].totpEnabledAt).not.toBeNull();
      expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(t.emails.sendTwoFactorRecoveryCompletedEmail).not.toHaveBeenCalled();
    });
  });

  describe('guardian links created before the flag was set', () => {
    async function requested() {
      const t = build([minor()]);
      await t.service.onModuleInit();
      await t.service.request('minor@example.com', 'pw', IP);
      const token = sentToken(t.emails.sendTwoFactorRecoveryGuardianLinkEmail);
      t.users[0].withheld = true;
      return { t, token };
    }

    it('describeLink reads as expired (no minor name, no request time)', async () => {
      const { t, token } = await requested();
      expect(await t.service.describeLink(token)).toEqual({ state: 'expired', kind: 'guardian' });
    });

    it('approve answers expired and removes nothing: two-factor stays on, no session ended, no email', async () => {
      const { t, token } = await requested();
      await expectLinkError(t.service.approve(token), 'expired');
      expect(t.users[0].totpEnabledAt).not.toBeNull();
      expect(t.rows[0]).toMatchObject({ state: 'pending' });
      expect(t.tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(t.emails.sendTwoFactorRecoveryApprovedEmail).not.toHaveBeenCalled();
    });

    it('decline answers expired and does nothing: the request is untouched and the minor is not emailed', async () => {
      const { t, token } = await requested();
      await expectLinkError(t.service.decline(token), 'expired');
      expect(t.rows[0]).toMatchObject({ state: 'pending' });
      expect(t.emails.sendTwoFactorRecoveryDeclinedEmail).not.toHaveBeenCalled();
    });
  });
});
