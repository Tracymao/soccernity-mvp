import { GUARDIAN_RELATIONSHIPS } from './guardian-relationship.constants';

// This exact list/order is load-bearing for F3's dropdown (see this
// file's main comment) — a change here without updating F3 is exactly
// the kind of silent drift this test exists to catch.
describe('GUARDIAN_RELATIONSHIPS', () => {
  it('is exactly the four starter values, in order', () => {
    expect(GUARDIAN_RELATIONSHIPS).toEqual(['Parent', 'Legal Guardian', 'Grandparent', 'Other']);
  });
});
