import { HELD_INVESTIGATION_ALERT_DAYS, resolveHeldInvestigationAlertDays } from './account-deletion-sweep.service';

describe('resolveHeldInvestigationAlertDays (B-018)', () => {
  const original = process.env.HELD_INVESTIGATION_ALERT_DAYS;
  afterEach(() => {
    if (original === undefined) delete process.env.HELD_INVESTIGATION_ALERT_DAYS;
    else process.env.HELD_INVESTIGATION_ALERT_DAYS = original;
  });

  it('defaults to the 90-day constant', () => {
    expect(HELD_INVESTIGATION_ALERT_DAYS).toBe(90);
    expect(resolveHeldInvestigationAlertDays(undefined)).toBe(90);
  });

  it('is overridable from the environment, read at call time', () => {
    process.env.HELD_INVESTIGATION_ALERT_DAYS = '30';
    expect(resolveHeldInvestigationAlertDays()).toBe(30);
    process.env.HELD_INVESTIGATION_ALERT_DAYS = '120';
    expect(resolveHeldInvestigationAlertDays()).toBe(120);
  });

  it.each([[''], ['  '], ['abc'], ['-5'], ['0'], ['1.5'], ['30 days']])(
    'falls back to the default for an unusable value (%p)',
    (raw) => {
      expect(resolveHeldInvestigationAlertDays(raw)).toBe(90);
    },
  );
});
