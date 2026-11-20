// backend/w7-contest (B-091). A tiny injectable clock.
//
// The Contest is driven entirely by the Europe/London calendar (docs/contest-spec.md section 5),
// so every rule that depends on "now" -- entry windows, the vote lock, the reveal gate, the
// engagement counting windows -- must be testable at an exact second. Services read time through
// this token instead of `new Date()`, and the e2e suites override it with a mutable fake so a
// whole contest month can be driven against real Postgres without waiting.
//
// Consumers inject it with @Optional(): a unit test that builds the service by hand, or a module
// that does not import ClockModule, silently falls back to the system clock (systemClock).

export interface Clock {
  now(): Date;
}

export const APP_CLOCK = 'APP_CLOCK';

export const systemClock: Clock = {
  now: () => new Date(),
};

// backend/test-clock-qa. An environment-driven clock so QA can drive the live Contest phases
// (weeks 1-3 Phase 1 and 2, Between Weeks, week-4 upload, final live) in a real browser against a
// real running API, instead of only through the in-process fake the e2e suites override.
//
//   TEST_CLOCK_ISO      an ISO-8601 instant with an explicit offset or Z, e.g. 2026-11-05T10:00:00Z.
//   TEST_CLOCK_ADVANCE  "1": the clock starts at TEST_CLOCK_ISO and then advances in real time.
//                       Unset: the clock is frozen at TEST_CLOCK_ISO (deterministic).
//   E2E_TEST_CLOCK      "1": allows the above when NODE_ENV is not "test" (the QA browser run
//                       starts the API with NODE_ENV=development or unset).
//
// It is honoured ONLY when NODE_ENV=test or E2E_TEST_CLOCK=1. In production none of the three may
// be set: validate-runtime-env.ts refuses to start the process, and buildAppClock() throws as a
// second line of defence. There is deliberately NO HTTP endpoint that sets or moves the clock; the
// only way in is the process environment, which an HTTP caller cannot touch.
export const TEST_CLOCK_ENV_VARS = ['TEST_CLOCK_ISO', 'TEST_CLOCK_ADVANCE', 'E2E_TEST_CLOCK'] as const;

type Env = Record<string, string | undefined>;

export function isTestClockEnabled(env: Env): boolean {
  return env.NODE_ENV === 'test' || env.E2E_TEST_CLOCK?.trim() === '1';
}

/** Names of the test-clock variables that are set to a non-blank value. */
export function testClockVarsSet(env: Env): string[] {
  return TEST_CLOCK_ENV_VARS.filter((name) => (env[name]?.trim() ?? '') !== '');
}

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The clock the app runs on. The system clock unless the test clock is configured AND allowed.
 * `realNow` is injectable so the advancing mode can be tested without waiting.
 */
export function buildAppClock(env: Env, realNow: () => number = () => Date.now()): Clock {
  const set = testClockVarsSet(env);
  if (env.NODE_ENV === 'production') {
    if (set.length > 0) {
      throw new Error(`Refusing to build a test clock in production: ${set.join(', ')} must not be set.`);
    }
    return systemClock;
  }
  const iso = env.TEST_CLOCK_ISO?.trim();
  if (!iso || !isTestClockEnabled(env)) return systemClock;
  if (!ISO_WITH_ZONE.test(iso) || Number.isNaN(Date.parse(iso))) {
    throw new Error(
      `TEST_CLOCK_ISO is not a valid ISO-8601 instant with a zone (got "${iso}"); use e.g. 2026-11-05T10:00:00Z.`,
    );
  }
  const start = Date.parse(iso);
  if (env.TEST_CLOCK_ADVANCE?.trim() === '1') {
    const bootedAt = realNow();
    return { now: () => new Date(start + (realNow() - bootedAt)) };
  }
  return { now: () => new Date(start) };
}
