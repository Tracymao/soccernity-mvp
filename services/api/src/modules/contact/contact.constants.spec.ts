import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS } from './contact.constants';

// Founder decision 2026-10-30: six categories, in this order; livescores_issues removed, enquiries_feedback split.
// Decision Log #492 (b), (e) (B-298): a seventh, suspension_appeal, last.
describe('Contact categories', () => {
  it('are the seven keys, in the order the form draws them', () => {
    expect([...CONTACT_CATEGORIES]).toEqual([
      'technical_issues',
      'editorial_complaints',
      'data',
      'suggestions',
      'enquiries',
      'feedback',
      'suspension_appeal',
    ]);
  });

  it('prints the decided labels', () => {
    expect(CONTACT_CATEGORIES.map((c) => CONTACT_CATEGORY_LABELS[c])).toEqual([
      'Technical issues',
      'Editorial Complaints',
      'Data',
      'Suggestions',
      'Enquiries',
      'Feedback',
      'Appeal a suspension',
    ]);
  });

  it('no longer carries the two retired keys', () => {
    expect(CONTACT_CATEGORIES).not.toContain('livescores_issues');
    expect(CONTACT_CATEGORIES).not.toContain('enquiries_feedback');
    expect(Object.keys(CONTACT_CATEGORY_LABELS)).toHaveLength(7);
  });
});
