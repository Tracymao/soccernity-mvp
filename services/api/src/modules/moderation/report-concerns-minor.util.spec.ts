import { REPORT_REASON_CATEGORIES } from './moderation.constants';
import { resolveConcernsMinor } from './report-concerns-minor.util';

// Decision Log #466: the category can only raise the flag, never lower it.
describe('resolveConcernsMinor', () => {
  it('child_safety_concern is always true, whatever the reporter sent', () => {
    expect(resolveConcernsMinor('child_safety_concern', false)).toBe(true);
    expect(resolveConcernsMinor('child_safety_concern', true)).toBe(true);
  });

  it.each(REPORT_REASON_CATEGORIES.filter((c) => c !== 'child_safety_concern'))(
    '%s returns exactly what the reporter sent',
    (category) => {
      expect(resolveConcernsMinor(category, false)).toBe(false);
      expect(resolveConcernsMinor(category, true)).toBe(true);
    },
  );
});
