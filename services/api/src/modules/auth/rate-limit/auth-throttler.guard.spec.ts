import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { AUTH_THROTTLER_NAME } from './rate-limit.constants';

// Builds a minimal fake ExecutionContext good enough for ThrottlerGuard's
// canActivate() — it only needs switchToHttp().getRequest()/getResponse()
// plus getHandler()/getClass() for Reflector lookups (which return
// undefined here since no @Throttle/@SkipThrottle metadata is attached,
// so the guard's constructor-level options apply as-is).
function buildContext(ip: string): ExecutionContext {
  const req = { ip, headers: {} };
  const res = { header: jest.fn() };
  const handler = function loginHandler() {};
  const classRef = class LoginController {};

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => handler,
    getClass: () => classRef,
  } as unknown as ExecutionContext;
}

// ThrottlerStorageService schedules a setTimeout per tracked key to expire
// it and only clears those timers in onApplicationShutdown() — which Nest
// calls automatically in a real app, but nothing calls for us here since
// we're instantiating the guard directly rather than booting a module.
// Track every instance created in a test and shut it down afterward so
// Jest doesn't report leaked timer handles.
const storagesToShutDown: ThrottlerStorageService[] = [];

afterEach(() => {
  storagesToShutDown.forEach((storage) => storage.onApplicationShutdown());
  storagesToShutDown.length = 0;
});

async function buildGuard(limit: number, ttlMs: number) {
  const storage = new ThrottlerStorageService();
  storagesToShutDown.push(storage);
  const guard = new AuthThrottlerGuard(
    [{ name: AUTH_THROTTLER_NAME, limit, ttl: ttlMs }],
    storage,
    new Reflector(),
  );
  // Nest normally calls this lifecycle hook when the module boots; we're
  // instantiating directly, so trigger it ourselves.
  await guard.onModuleInit();
  return guard;
}

describe('AuthThrottlerGuard', () => {
  it('allows requests up to the configured limit', async () => {
    const guard = await buildGuard(3, 60_000);
    const context = buildContext('203.0.113.10');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks the request once it exceeds the configured limit', async () => {
    const guard = await buildGuard(3, 60_000);
    const context = buildContext('203.0.113.11');

    await guard.canActivate(context);
    await guard.canActivate(context);
    await guard.canActivate(context);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('tracks distinct clients independently (IP-based)', async () => {
    const guard = await buildGuard(1, 60_000);
    const contextA = buildContext('203.0.113.20');
    const contextB = buildContext('203.0.113.21');

    await expect(guard.canActivate(contextA)).resolves.toBe(true);
    // Same limit, different IP — must not be affected by contextA's hit.
    await expect(guard.canActivate(contextB)).resolves.toBe(true);
    // Second hit from the original IP is now over its own limit.
    await expect(guard.canActivate(contextA)).rejects.toBeInstanceOf(ThrottlerException);
  });
});
