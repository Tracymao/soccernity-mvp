import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthRateLimit } from './auth-rate-limit.decorator';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { AuthRateLimitModule } from './rate-limit.module';

// Bug fixed here (Build Plan Section 5.7 / CLAUDE.md "sprint-2/e2e-
// coverage-expansion" bullet): AuthRateLimit() used to apply
// DEFAULT_AUTH_RATE_LIMIT / DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS as its own
// default parameters and always emitted a per-route @Throttle()
// override. Since NestJS's Throttler gives a route-level @Throttle()
// override priority over the module-level named-throttler config,
// every real call site (bare @AuthRateLimit()) silently ignored
// AUTH_RATE_LIMIT_MAX / AUTH_RATE_LIMIT_WINDOW_MS regardless of what was
// configured. This spec proves the fix behaviorally, not just that the
// decorator compiles: it wires the REAL AuthThrottlerGuard through the
// REAL AuthRateLimitModule (env-driven ThrottlerModule.forRootAsync()),
// exactly like guardian-consent.controller.spec.ts's "real rate
// limiting" describe block does for one specific route -- this one
// isolates the decorator itself against a throwaway controller so the
// proof isn't tangled up with any one feature route.
@Controller('test-rate-limit')
class TestRateLimitController {
  @Get()
  @AuthRateLimit()
  ping() {
    return { ok: true };
  }
}

describe('AuthRateLimit() decorator (env-driven module config, real guard)', () => {
  const originalMax = process.env.AUTH_RATE_LIMIT_MAX;
  const originalWindow = process.env.AUTH_RATE_LIMIT_WINDOW_MS;

  afterEach(() => {
    // Restore whatever was there before this spec ran -- process.env is
    // shared across the whole Jest worker (see PR #57's root-cause
    // writeup on ConfigService precedence), so leaking a test value here
    // could silently affect an unrelated spec file run later in the
    // same worker.
    if (originalMax === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX = originalMax;
    }
    if (originalWindow === undefined) {
      delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.AUTH_RATE_LIMIT_WINDOW_MS = originalWindow;
    }
  });

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthRateLimitModule],
      controllers: [TestRateLimitController],
      // AuthThrottlerGuard isn't provided by AuthRateLimitModule itself
      // (it only provides/exports the configured ThrottlerModule), so it
      // must be registered explicitly here for Nest to resolve it via
      // @UseGuards(AuthThrottlerGuard) -- same pattern
      // guardian-consent.controller.spec.ts's real-guard describe block
      // uses.
      providers: [AuthThrottlerGuard],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  // No per-test timeout override needed here anymore. This test used to
  // carry an explicit 20000ms override (see PR #70) because it
  // bootstraps a real Nest application (real AuthThrottlerGuard, real
  // AuthRateLimitModule) and makes multiple real HTTP round trips via
  // supertest in sequence -- structurally heavier than a mocked test,
  // and under full 34-suite parallel CPU contention it twice exceeded
  // Jest's old 5000ms default with "Exceeded timeout of 5000ms for a
  // test" (PR #67 and PR #69), despite the underlying rate-limiting
  // behavior being correct both times. The global Jest timeout PR
  // raised jest.config.js's testTimeout to 30000ms for the whole suite
  // -- based on measuring that even plain mocked-Prisma tests (not just
  // real-HTTP ones like this file's) can exceed 5000ms under heavy CPU
  // contention -- so this test's own real-HTTP overhead is now covered
  // by the global default with room to spare, and the redundant
  // per-test override was removed. See jest.config.js's own comment for
  // the full measured evidence behind 30000ms.
  it('respects AUTH_RATE_LIMIT_MAX/AUTH_RATE_LIMIT_WINDOW_MS when set to a value other than the hardcoded default', async () => {
    // 2 is deliberately different from DEFAULT_AUTH_RATE_LIMIT (5) --
    // under the pre-fix decorator, this route would have been governed
    // by the hardcoded default regardless of these env vars, so the
    // 3rd request below would have incorrectly returned 200, not 429.
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';

    const app = await buildApp();
    try {
      await request(app.getHttpServer()).get('/test-rate-limit').expect(200);
      await request(app.getHttpServer()).get('/test-rate-limit').expect(200);
      await request(app.getHttpServer()).get('/test-rate-limit').expect(429);
    } finally {
      await app.close();
    }
  });

  // Same reasoning as the sibling test above: a real app bootstrap plus
  // six real HTTP round trips in sequence is at least as much real work,
  // so it relies on the same global 30000ms default rather than its own
  // override.
  it('falls back to DEFAULT_AUTH_RATE_LIMIT/DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS when the env vars are not set', async () => {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;

    const app = await buildApp();
    try {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).get('/test-rate-limit').expect(200);
      }
      await request(app.getHttpServer()).get('/test-rate-limit').expect(429);
    } finally {
      await app.close();
    }
  });
});
