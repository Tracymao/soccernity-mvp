import { RECEIVING_BODIES, RECEIVING_BODY_KEYS, OTHER_BODY_KEY, suggestedBodiesFor, suggestedBodyKeysFor } from './receiving-bodies.constants';

// backend/suspected-illegal-imagery-path (B-206). The table of receiving bodies is PENDING COUNSEL: this spec pins its shape
// (every entry marked pending, no invented web address) and the suggestion helper by uploader country.
describe('receiving bodies', () => {
  it('marks every body pending counsel and carries no web address', () => {
    for (const body of Object.values(RECEIVING_BODIES)) {
      expect(body.pendingCounsel).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/https?:\/\//i);
    }
  });

  it('suggests IWF and NCA for GB, NCMEC for US, the national hotline for an EU member state, and nothing for NG or unknown', () => {
    expect(suggestedBodyKeysFor('GB')).toEqual(expect.arrayContaining(['iwf', 'nca']));
    expect(suggestedBodyKeysFor('US')).toEqual(['ncmec']);
    expect(suggestedBodyKeysFor('IE')).toEqual(['inhope_national_hotline']);
    expect(suggestedBodyKeysFor('NG')).toEqual([]);
    expect(suggestedBodyKeysFor(null)).toEqual([]);
    expect(suggestedBodyKeysFor('ZZ')).toEqual([]);
  });

  it('is case-insensitive on the country and returns full entries from the keyed table', () => {
    expect(suggestedBodiesFor('gb').map((b) => b.key)).toEqual(expect.arrayContaining(['iwf', 'nca']));
    for (const key of suggestedBodyKeysFor('US')) expect(RECEIVING_BODY_KEYS).toContain(key);
  });

  it("allows 'other' as a recorded key", () => {
    expect(RECEIVING_BODY_KEYS).toContain(OTHER_BODY_KEY);
  });
});
