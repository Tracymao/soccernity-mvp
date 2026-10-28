import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import {
  buildGlobalThrottlerOptions,
  createIdentityResolver,
  GlobalRateLimitNumbers,
} from './global-rate-limit.config';
import * as Sentry from '@sentry/nestjs';
import { RefreshRateLimit, SkipGlobalRateLimit, SkipGlobalWriteLimit, UploadRateLimit } from './global-rate-limit.decorators';
import { GlobalThrottlerGuard } from './global-throttler.guard';

// Small numbers so each class is reachable in a few calls.
const NUMBERS: GlobalRateLimitNumbers = {
  userMax: 4,
  userWindowMs: 60_000,
  anonMax: 5,
  anonWindowMs: 60_000,
  writeMax: 2,
  writeWindowMs: 60_000,
  uploadMax: 1,
  uploadWindowMs: 600_000,
  refreshIpMax: 3,
  refreshIpWindowMs: 60_000,
  refreshTokenMax: 2,
  refreshTokenWindowMs: 60_000,
};

class SampleController {
  read() {}
  other() {}
  write() {}
  @UploadRateLimit()
  upload() {}
  @SkipGlobalRateLimit()
  skipped() {}
  @SkipGlobalWriteLimit()
  writeExempt() {}
  @SkipGlobalWriteLimit()
  @RefreshRateLimit()
  refresh() {}
}
@SkipGlobalRateLimit()
class SkippedController {
  anything() {}
}

type Handler = keyof SampleController;

function ctx(opts: {
  handler?: Handler;
  method?: string;
  ip?: string;
  token?: string;
  body?: Record<string, unknown>;
  cookie?: string;
  klass?: Function;
  res?: { header: jest.Mock };
}): ExecutionContext {
  const req = {
    ip: opts.ip ?? '203.0.113.1',
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { 'x-auth-mode': 'cookie', cookie: opts.cookie } : {}),
    },
    body: opts.body,
  };
  const res = opts.res ?? { header: jest.fn() };
  const handler = (SampleController.prototype as any)[opts.handler ?? 'read'];
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => handler,
    getClass: () => opts.klass ?? SampleController,
  } as unknown as ExecutionContext;
}

const storages: ThrottlerStorageService[] = [];
afterEach(() => {
  storages.forEach((s) => s.onApplicationShutdown());
  storages.length = 0;
  jest.restoreAllMocks();
});

// A token "u1".."u9" verifies to that user; anything else is invalid.
const verify = (t: string) => {
  if (/^u\d$/.test(t)) return { sub: t };
  throw new Error('bad token');
};

async function build(storage: ThrottlerStorageService = new ThrottlerStorageService()) {
  storages.push(storage);
  const options = buildGlobalThrottlerOptions(NUMBERS, createIdentityResolver(verify));
  const guard = new GlobalThrottlerGuard(options, storage, new Reflector());
  await guard.onModuleInit();
  return guard;
}

const hits = async (guard: GlobalThrottlerGuard, n: number, make: () => ExecutionContext) => {
  for (let i = 0; i < n; i++) await expect(guard.canActivate(make())).resolves.toBe(true);
};

describe('GlobalThrottlerGuard: signed-in class (per user)', () => {
  it('allows the limit, then rejects with a 429', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.userMax, () => ctx({ token: 'u1' }));
    await expect(guard.canActivate(ctx({ token: 'u1' }))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('counts a user across ALL routes, not per route', async () => {
    const guard = await build();
    await hits(guard, 2, () => ctx({ token: 'u1', handler: 'read' }));
    await hits(guard, 2, () => ctx({ token: 'u1', handler: 'other' }));
    await expect(guard.canActivate(ctx({ token: 'u1', handler: 'read' }))).rejects.toBeInstanceOf(ThrottlerException);
    await expect(guard.canActivate(ctx({ token: 'u1', handler: 'other' }))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('tracks users independently and keys on the user, not the IP', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.userMax, () => ctx({ token: 'u1', ip: '198.51.100.1' }));
    // same user from another IP is still over the limit; another user on the same IP is not
    await expect(guard.canActivate(ctx({ token: 'u1', ip: '198.51.100.2' }))).rejects.toBeInstanceOf(ThrottlerException);
    await expect(guard.canActivate(ctx({ token: 'u2', ip: '198.51.100.1' }))).resolves.toBe(true);
  });

  it('does not touch the anonymous bucket', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.userMax, () => ctx({ token: 'u1' }));
    await hits(guard, NUMBERS.anonMax, () => ctx({}));
  });
});

describe('GlobalThrottlerGuard: anonymous class (per IP)', () => {
  it('allows the limit, then rejects', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.anonMax, () => ctx({ ip: '203.0.113.9' }));
    await expect(guard.canActivate(ctx({ ip: '203.0.113.9' }))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('keys on the IP: another IP is unaffected', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.anonMax, () => ctx({ ip: '203.0.113.9' }));
    await expect(guard.canActivate(ctx({ ip: '203.0.113.10' }))).resolves.toBe(true);
  });

  it('treats an invalid token as anonymous (IP fallback), not as a user', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.anonMax, () => ctx({ token: 'forged', ip: '203.0.113.20' }));
    await expect(guard.canActivate(ctx({ token: 'forged', ip: '203.0.113.20' }))).rejects.toBeInstanceOf(ThrottlerException);
    // the invalid token never created a user bucket
    await expect(guard.canActivate(ctx({ token: 'u1', ip: '203.0.113.20' }))).resolves.toBe(true);
  });
});

describe('GlobalThrottlerGuard: writes class', () => {
  it('counts POST, PUT, PATCH and DELETE but never GET', async () => {
    const guard = await build();
    // a GET-only stream is limited only by the user class (4), never the writes class (2)
    await hits(guard, 3, () => ctx({ token: 'u1', method: 'GET' }));
    const g2 = await build();
    for (const method of ['POST', 'PUT']) await expect(g2.canActivate(ctx({ token: 'u2', method }))).resolves.toBe(true);
    await expect(g2.canActivate(ctx({ token: 'u2', method: 'PATCH' }))).rejects.toBeInstanceOf(ThrottlerException);
    const g3 = await build();
    for (const method of ['DELETE', 'PATCH']) await expect(g3.canActivate(ctx({ token: 'u3', method }))).resolves.toBe(true);
    await expect(g3.canActivate(ctx({ token: 'u3', method: 'POST' }))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('is global per caller across routes', async () => {
    const guard = await build();
    await guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'write' }));
    await guard.canActivate(ctx({ token: 'u1', method: 'DELETE', handler: 'other' }));
    await expect(guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'read' }))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('applies to anonymous writes too, per IP', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.writeMax, () => ctx({ method: 'POST', ip: '203.0.113.30' }));
    await expect(guard.canActivate(ctx({ method: 'POST', ip: '203.0.113.30' }))).rejects.toBeInstanceOf(ThrottlerException);
    await expect(guard.canActivate(ctx({ method: 'GET', ip: '203.0.113.30' }))).resolves.toBe(true);
  });
});

describe('GlobalThrottlerGuard: uploads class', () => {
  it('limits only routes tagged @UploadRateLimit()', async () => {
    const guard = await build();
    // an ordinary POST is not an upload: it is bounded by the writes class (2), not the upload class (1)
    await expect(guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'write' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'write' }))).resolves.toBe(true);
  });

  it('rejects the second upload when the limit is one', async () => {
    const guard = await build();
    await expect(guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'upload' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'upload' }))).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('keys the upload limit on the caller, so another user can still upload', async () => {
    const guard = await build();
    await guard.canActivate(ctx({ token: 'u1', method: 'POST', handler: 'upload' }));
    await expect(guard.canActivate(ctx({ token: 'u2', method: 'POST', handler: 'upload' }))).resolves.toBe(true);
  });
});

describe('GlobalThrottlerGuard: exemptions', () => {
  it('never limits a handler tagged @SkipGlobalRateLimit()', async () => {
    const guard = await build();
    await hits(guard, 50, () => ctx({ token: 'u1', method: 'POST', handler: 'skipped' }));
    // and it consumed nothing from the caller's buckets
    await hits(guard, NUMBERS.writeMax, () => ctx({ token: 'u1', method: 'POST', handler: 'write' }));
  });

  it('never limits a controller tagged @SkipGlobalRateLimit()', async () => {
    const guard = await build();
    await hits(guard, 50, () => ctx({ method: 'POST', klass: SkippedController }));
  });
});

describe('GlobalThrottlerGuard: 429 response', () => {
  it('sets a plain Retry-After header in whole seconds and throws the standard throttler error', async () => {
    const guard = await build();
    const res = { header: jest.fn() };
    await hits(guard, NUMBERS.anonMax, () => ctx({ ip: '203.0.113.40', res }));
    let error: ThrottlerException | undefined;
    try {
      await guard.canActivate(ctx({ ip: '203.0.113.40', res }));
    } catch (e) {
      error = e as ThrottlerException;
    }
    expect(error).toBeInstanceOf(ThrottlerException);
    expect(error!.getStatus()).toBe(429);
    // The stock message; Nest's exception filter turns it into { statusCode: 429, message } (asserted over
    // HTTP in global-rate-limit.http.spec.ts).
    expect(error!.getResponse()).toBe('ThrottlerException: Too Many Requests');
    const retry = res.header.mock.calls.filter(([name]) => name === 'Retry-After');
    expect(retry).toHaveLength(1);
    expect(Number(retry[0][1])).toBeGreaterThanOrEqual(1);
    expect(Number(retry[0][1])).toBeLessThanOrEqual(60);
    // no suffixed variants and no per-class X-RateLimit noise
    expect(res.header.mock.calls.map(([n]) => n).filter((n) => n !== 'Retry-After')).toEqual([]);
  });
});

describe('GlobalThrottlerGuard: fail open', () => {
  it('lets the request through (and logs) when the storage throws', async () => {
    const storage = new ThrottlerStorageService();
    jest.spyOn(storage, 'increment').mockRejectedValue(new Error('storage down'));
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const guard = await build(storage);
    await expect(guard.canActivate(ctx({ token: 'u1' }))).resolves.toBe(true);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0][0])).toMatch(/fail open/);
    expect(String(errorLog.mock.calls[0][0])).toMatch(/storage down/);
  });

  it('logs at most once a minute while the limiter stays broken', async () => {
    const storage = new ThrottlerStorageService();
    jest.spyOn(storage, 'increment').mockRejectedValue(new Error('storage down'));
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const guard = await build(storage);
    for (let i = 0; i < 25; i++) await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it('lets the request through when the identity step itself throws', async () => {
    const storage = new ThrottlerStorageService();
    storages.push(storage);
    const boom = () => {
      throw new Error('resolver exploded');
    };
    const options = buildGlobalThrottlerOptions(NUMBERS, boom);
    const guard = new GlobalThrottlerGuard(options, storage, new Reflector());
    await guard.onModuleInit();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(guard.canActivate(ctx({ token: 'u1' }))).resolves.toBe(true);
  });

  it('still returns the 429 itself (a rejection is not a failure)', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.anonMax, () => ctx({ ip: '203.0.113.50' }));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(guard.canActivate(ctx({ ip: '203.0.113.50' }))).rejects.toBeInstanceOf(ThrottlerException);
  });
});

// A guard with a roomy anonymous/user class, so only the class under test can trip.
async function buildRoomy(numbers: GlobalRateLimitNumbers = NUMBERS) {
  const storage = new ThrottlerStorageService();
  storages.push(storage);
  const options = buildGlobalThrottlerOptions({ ...numbers, anonMax: 1000, userMax: 1000 }, createIdentityResolver(verify));
  const guard = new GlobalThrottlerGuard(options, storage, new Reflector());
  await guard.onModuleInit();
  return { guard, storage };
}

describe('GlobalThrottlerGuard: @SkipGlobalWriteLimit()', () => {
  it('lets 40 writes from one IP through a tagged handler, while an untagged write route still 429s past its limit', async () => {
    const { guard } = await buildRoomy({ ...NUMBERS, writeMax: 30 });
    await hits(guard, 40, () => ctx({ method: 'POST', handler: 'writeExempt', ip: '203.0.113.50' }));
    // the tagged calls consumed none of the writes budget: all 30 untagged writes still pass, the 31st does not
    await hits(guard, 30, () => ctx({ method: 'POST', handler: 'write', ip: '203.0.113.50' }));
    await expect(guard.canActivate(ctx({ method: 'POST', handler: 'write', ip: '203.0.113.50' }))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('is still counted by the anonymous class', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.anonMax, () => ctx({ method: 'POST', handler: 'writeExempt', ip: '203.0.113.52' }));
    await expect(
      guard.canActivate(ctx({ method: 'POST', handler: 'writeExempt', ip: '203.0.113.52' })),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('is still counted by the signed-in user class', async () => {
    const guard = await build();
    await hits(guard, NUMBERS.userMax, () => ctx({ token: 'u5', method: 'POST', handler: 'writeExempt' }));
    await expect(guard.canActivate(ctx({ token: 'u5', method: 'POST', handler: 'writeExempt' }))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });
});

describe('GlobalThrottlerGuard: refresh classes (@RefreshRateLimit())', () => {
  const refreshCtx = (o: { ip?: string; body?: Record<string, unknown>; cookie?: string; res?: { header: jest.Mock } } = {}) =>
    ctx({ method: 'POST', handler: 'refresh', ...o });

  it('limits per client IP and answers 429 with Retry-After', async () => {
    const { guard } = await buildRoomy();
    // a different token each time, so only the IP class can trip
    for (let i = 0; i < NUMBERS.refreshIpMax; i++) {
      await expect(guard.canActivate(refreshCtx({ ip: '203.0.113.60', body: { refreshToken: 't' + i } }))).resolves.toBe(true);
    }
    const res = { header: jest.fn() };
    await expect(
      guard.canActivate(refreshCtx({ ip: '203.0.113.60', body: { refreshToken: 'fresh' }, res })),
    ).rejects.toBeInstanceOf(ThrottlerException);
    expect(res.header).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^[0-9]+$/));
    // another IP is unaffected
    await expect(guard.canActivate(refreshCtx({ ip: '203.0.113.61', body: { refreshToken: 'x' } }))).resolves.toBe(true);
  });

  it('limits per presented token while a different token from the same IP passes', async () => {
    const { guard } = await buildRoomy({ ...NUMBERS, refreshIpMax: 100 });
    await hits(guard, NUMBERS.refreshTokenMax, () => refreshCtx({ ip: '203.0.113.62', body: { refreshToken: 'same' } }));
    await expect(guard.canActivate(refreshCtx({ ip: '203.0.113.62', body: { refreshToken: 'same' } }))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    await expect(guard.canActivate(refreshCtx({ ip: '203.0.113.62', body: { refreshToken: 'other' } }))).resolves.toBe(true);
  });

  it('counts a cookie-mode token the same as a body token', async () => {
    const { guard } = await buildRoomy();
    await hits(guard, 1, () => refreshCtx({ ip: '203.0.113.63', body: { refreshToken: 'tok' } }));
    await hits(guard, 1, () => refreshCtx({ ip: '203.0.113.64', cookie: 'sn_rt=tok' }));
    await expect(guard.canActivate(refreshCtx({ ip: '203.0.113.65', cookie: 'sn_rt=tok' }))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('a request presenting no token counts against the IP class only', async () => {
    const { guard, storage } = await buildRoomy();
    const spy = jest.spyOn(storage, 'increment');
    await hits(guard, 2, () => refreshCtx({ ip: '203.0.113.66', body: {} }));
    const names = spy.mock.calls.map((c) => c[4]);
    expect(names).toContain('global-refresh-ip');
    expect(names).not.toContain('global-refresh-token');
  });

  it('never puts the raw token in any storage key', async () => {
    const { guard, storage } = await buildRoomy();
    const spy = jest.spyOn(storage, 'increment');
    await guard.canActivate(refreshCtx({ ip: '203.0.113.67', body: { refreshToken: 'SUPER-SECRET-RAW-TOKEN' } }));
    await guard.canActivate(refreshCtx({ ip: '203.0.113.68', cookie: 'sn_rt=SUPER-SECRET-RAW-TOKEN' }));
    const keys = spy.mock.calls.map((c) => String(c[0]));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).not.toContain('SUPER-SECRET-RAW-TOKEN');
    expect(keys.some((k) => k.startsWith('global-refresh-token:refresh-token:'))).toBe(true);
  });

  it('does not apply to a route without @RefreshRateLimit()', async () => {
    const { guard } = await buildRoomy();
    await hits(guard, 30, () => ctx({ method: 'GET', handler: 'read', ip: '203.0.113.69', body: { refreshToken: 'same' } }));
  });
});

describe('GlobalThrottlerGuard: fail-open Sentry report', () => {
  const brokenGuard = async () => {
    const broken = { increment: jest.fn().mockRejectedValue(new Error('storage down')) } as unknown as ThrottlerStorageService;
    const guard = new GlobalThrottlerGuard(buildGlobalThrottlerOptions(NUMBERS, createIdentityResolver(verify)), broken, new Reflector());
    await guard.onModuleInit();
    return guard;
  };

  it('reports once to Sentry, tagged rate_limiter=global, however many requests fail', async () => {
    const capture = jest.spyOn(Sentry, 'captureException').mockReturnValue('id');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const guard = await brokenGuard();
    for (let i = 0; i < 5; i++) await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { tags: { rate_limiter: 'global' } });
  });

  it('never lets a failing Sentry call break the request', async () => {
    jest.spyOn(Sentry, 'captureException').mockImplementation(() => {
      throw new Error('sentry down');
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const guard = await brokenGuard();
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });
});
