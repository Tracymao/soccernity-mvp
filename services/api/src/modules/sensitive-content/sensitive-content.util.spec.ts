import {
  SENSITIVE_CATEGORIES,
  buildSensitiveContentReportReason,
  screenSensitiveContent,
} from './sensitive-content.util';

describe('screenSensitiveContent', () => {
  it.each([
    ['health', 'Players recovering from cancer treatment'],
    ['health', 'He has diabetes so subs early'],
    ['religion', 'St Peter Church Hall'],
    ['religion', 'The Muslim lads team'],
    ['ethnicity', 'All the Igbo boys vs the rest'],
    ['sexual_orientation', 'Gay supporters five-a-side'],
    ['politics', 'APC youth wing XI'],
    ['trade_union', 'Union member only match'],
    ['biometric_genetic', 'Fingerprint registration at the gate'],
  ])('flags %s: "%s"', (category, text) => {
    const flags = screenSensitiveContent({ venue: text });
    expect(flags).toHaveLength(1);
    expect(flags[0].field).toBe('venue');
    expect(flags[0].categories).toContain(category);
  });

  it('is case-insensitive and matches inflections (prefix)', () => {
    expect(screenSensitiveContent({ x: 'DIABETIC keeper' })).toHaveLength(1);
    expect(screenSensitiveContent({ x: 'Christians United' })).toHaveLength(1);
  });

  it('does not match inside an unrelated word (matches only at a word start)', () => {
    expect(screenSensitiveContent({ x: 'Mascancer Rovers' })).toEqual([]);
  });

  it('passes ordinary grassroots text', () => {
    expect(
      screenSensitiveContent({
        name: 'Hackney Wick FC',
        city: 'London',
        opponentName: 'Riverside FC',
        venue: 'Hackney Marshes, pitch 4',
      }),
    ).toEqual([]);
  });

  it('reports one flag per field, with every matching category, in field order', () => {
    const flags = screenSensitiveContent({
      name: 'Hackney Wick FC',
      opponentName: 'Church Disability FC',
      venue: 'Mosque Lane',
    });
    expect(flags.map((f) => f.field)).toEqual(['opponentName', 'venue']);
    expect([...flags[0].categories].sort()).toEqual(['health', 'religion']);
  });

  it('ignores null, undefined, empty and whitespace values', () => {
    expect(screenSensitiveContent({ a: null, b: undefined, c: '', d: '   ' })).toEqual([]);
  });

  it('only ever emits known categories and never echoes the matched text', () => {
    const flags = screenSensitiveContent({ venue: 'Cancer ward charity game' });
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) {
      for (const c of f.categories) expect(SENSITIVE_CATEGORIES).toContain(c);
      expect(JSON.stringify(f)).not.toMatch(/ward|charity/i);
    }
  });
});

describe('buildSensitiveContentReportReason', () => {
  it('lists field names and categories only, under the automated prefix', () => {
    const reason = buildSensitiveContentReportReason([
      { field: 'venue', categories: ['religion'] },
      { field: 'opponentName', categories: ['health', 'ethnicity'] },
    ]);
    expect(reason).toMatch(/^\[Automated: pre-publication sensitive-content screen\]/);
    expect(reason).toContain('venue (religion); opponentName (health, ethnicity)');
    expect(reason.length).toBeLessThanOrEqual(500);
  });
});
