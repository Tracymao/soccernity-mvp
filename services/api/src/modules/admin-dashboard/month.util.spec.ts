import { startOfCurrentMonthUtc } from './month.util';

describe('startOfCurrentMonthUtc', () => {
  it('returns the 1st of the month at UTC midnight for a mid-month date', () => {
    const result = startOfCurrentMonthUtc(new Date('2026-09-15T14:32:07.123Z'));
    expect(result.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('is a no-op-boundary on the 1st itself', () => {
    const result = startOfCurrentMonthUtc(new Date('2026-09-01T00:00:00.001Z'));
    expect(result.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('handles the December -> January year rollover correctly', () => {
    const result = startOfCurrentMonthUtc(new Date('2026-12-31T23:59:59.999Z'));
    expect(result.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('is computed in UTC, not local time — a late-evening UTC date near a month boundary', () => {
    // 2026-01-31T23:30:00Z is still January in UTC regardless of the
    // server's local timezone; the boundary must reflect that.
    const result = startOfCurrentMonthUtc(new Date('2026-01-31T23:30:00.000Z'));
    expect(result.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
