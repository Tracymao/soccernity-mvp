import { buildAppClock, isTestClockEnabled, systemClock, testClockVarsSet } from './clock';

// backend/test-clock-qa. The environment-driven test clock: honoured only when NODE_ENV=test or
// E2E_TEST_CLOCK=1, never in production, and a no-op (the real system clock) when nothing is set.

const ISO = '2026-11-05T10:00:00Z';

describe('buildAppClock', () => {
  it('is the system clock when no test-clock variable is set', () => {
    expect(buildAppClock({})).toBe(systemClock);
    expect(buildAppClock({ NODE_ENV: 'development' })).toBe(systemClock);
    expect(buildAppClock({ NODE_ENV: 'production' })).toBe(systemClock);
  });

  it('is frozen at TEST_CLOCK_ISO when NODE_ENV=test', () => {
    const clock = buildAppClock({ NODE_ENV: 'test', TEST_CLOCK_ISO: ISO });
    expect(clock.now().toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });

  it('is honoured outside NODE_ENV=test only with E2E_TEST_CLOCK=1', () => {
    expect(buildAppClock({ NODE_ENV: 'development', TEST_CLOCK_ISO: ISO, E2E_TEST_CLOCK: '1' }).now().toISOString()).toBe(
      '2026-11-05T10:00:00.000Z',
    );
    expect(buildAppClock({ TEST_CLOCK_ISO: ISO, E2E_TEST_CLOCK: '1' }).now().toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });

  it('ignores TEST_CLOCK_ISO when neither NODE_ENV=test nor E2E_TEST_CLOCK=1 allows it', () => {
    expect(buildAppClock({ TEST_CLOCK_ISO: ISO })).toBe(systemClock);
    expect(buildAppClock({ NODE_ENV: 'development', TEST_CLOCK_ISO: ISO })).toBe(systemClock);
    expect(buildAppClock({ NODE_ENV: 'development', TEST_CLOCK_ISO: ISO, E2E_TEST_CLOCK: '0' })).toBe(systemClock);
    expect(buildAppClock({ NODE_ENV: 'development', TEST_CLOCK_ISO: ISO, E2E_TEST_CLOCK: 'true' })).toBe(systemClock);
  });

  it('ignores a blank TEST_CLOCK_ISO', () => {
    expect(buildAppClock({ NODE_ENV: 'test', TEST_CLOCK_ISO: '  ' })).toBe(systemClock);
  });

  it('advances in real time from the start instant with TEST_CLOCK_ADVANCE=1', () => {
    let real = 1_000_000;
    const clock = buildAppClock({ NODE_ENV: 'test', TEST_CLOCK_ISO: ISO, TEST_CLOCK_ADVANCE: '1' }, () => real);
    expect(clock.now().toISOString()).toBe('2026-11-05T10:00:00.000Z');
    real += 90_000;
    expect(clock.now().toISOString()).toBe('2026-11-05T10:01:30.000Z');
    real += 3_600_000;
    expect(clock.now().toISOString()).toBe('2026-11-05T11:01:30.000Z');
  });

  it('stays frozen without TEST_CLOCK_ADVANCE even as real time passes', () => {
    let real = 5;
    const clock = buildAppClock({ NODE_ENV: 'test', TEST_CLOCK_ISO: ISO }, () => real);
    real += 10 * 60 * 60 * 1000;
    expect(clock.now().toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });

  it('accepts an offset instead of Z', () => {
    const clock = buildAppClock({ NODE_ENV: 'test', TEST_CLOCK_ISO: '2026-11-05T10:00:00+01:00' });
    expect(clock.now().toISOString()).toBe('2026-11-05T09:00:00.000Z');
  });

  it.each([['not a date'], ['2026-11-05'], ['2026-11-05T10:00:00'], ['2026-13-45T10:00:00Z'], ['1730800000']])(
    'refuses to start on an unusable TEST_CLOCK_ISO (%p)',
    (bad) => {
      expect(() => buildAppClock({ NODE_ENV: 'test', TEST_CLOCK_ISO: bad })).toThrow(/TEST_CLOCK_ISO/);
    },
  );

  describe('in production', () => {
    it.each([
      [{ TEST_CLOCK_ISO: ISO }],
      [{ E2E_TEST_CLOCK: '1' }],
      [{ TEST_CLOCK_ADVANCE: '1' }],
      [{ TEST_CLOCK_ISO: ISO, E2E_TEST_CLOCK: '1' }],
    ])('throws instead of building a test clock (%j)', (vars) => {
      expect(() => buildAppClock({ NODE_ENV: 'production', ...vars })).toThrow(/production/);
    });

    it('never honours E2E_TEST_CLOCK=1 as an enabler', () => {
      expect(() => buildAppClock({ NODE_ENV: 'production', TEST_CLOCK_ISO: ISO, E2E_TEST_CLOCK: '1' })).toThrow();
    });
  });
});

describe('isTestClockEnabled / testClockVarsSet', () => {
  it('enables on NODE_ENV=test or E2E_TEST_CLOCK=1 only', () => {
    expect(isTestClockEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(isTestClockEnabled({ E2E_TEST_CLOCK: '1' })).toBe(true);
    expect(isTestClockEnabled({ E2E_TEST_CLOCK: ' 1 ' })).toBe(true);
    expect(isTestClockEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isTestClockEnabled({ E2E_TEST_CLOCK: 'yes' })).toBe(false);
  });

  it('lists only the variables set to a non-blank value', () => {
    expect(testClockVarsSet({})).toEqual([]);
    expect(testClockVarsSet({ TEST_CLOCK_ISO: '', E2E_TEST_CLOCK: '  ' })).toEqual([]);
    expect(testClockVarsSet({ TEST_CLOCK_ISO: ISO, TEST_CLOCK_ADVANCE: '1', E2E_TEST_CLOCK: '1' })).toEqual([
      'TEST_CLOCK_ISO',
      'TEST_CLOCK_ADVANCE',
      'E2E_TEST_CLOCK',
    ]);
  });
});
