import { canDiscloseReadAt, ReceiptParty } from './read-receipt-disclosure.util';

// Read receipts (Decision Log #472; founder decision 2026-11-08): every branch of the disclosure rule.
const adult = (readReceipts: boolean | null = null): ReceiptParty => ({ isMinor: false, readReceipts });
const minor = (readReceipts: boolean | null = null): ReceiptParty => ({ isMinor: true, readReceipts });

describe('canDiscloseReadAt', () => {
  it('adult to adult with the age defaults: disclosed (adults default ON)', () => {
    expect(canDiscloseReadAt(adult(), adult())).toBe(true);
  });

  it('under 18 to under 18 with the age defaults: NOT disclosed (under-18s default OFF)', () => {
    expect(canDiscloseReadAt(minor(), minor())).toBe(false);
  });

  it('under 18 to under 18 when BOTH explicitly turned it on: disclosed', () => {
    expect(canDiscloseReadAt(minor(true), minor(true))).toBe(true);
  });

  it('under 18 to under 18 when only one of them turned it on: not disclosed', () => {
    expect(canDiscloseReadAt(minor(true), minor())).toBe(false);
    expect(canDiscloseReadAt(minor(), minor(true))).toBe(false);
  });

  it('the SENDER having it off hides it, even when the reader has it on', () => {
    expect(canDiscloseReadAt(adult(false), adult(true))).toBe(false);
  });

  it('the READER having it off hides it, even when the sender has it on', () => {
    expect(canDiscloseReadAt(adult(true), adult(false))).toBe(false);
  });

  it('different age classes never disclose, even with both explicitly on', () => {
    expect(canDiscloseReadAt(adult(true), minor(true))).toBe(false);
    expect(canDiscloseReadAt(minor(true), adult(true))).toBe(false);
  });

  it('an unknown participant (no row) discloses nothing', () => {
    expect(canDiscloseReadAt(undefined, adult())).toBe(false);
    expect(canDiscloseReadAt(adult(), undefined)).toBe(false);
  });

  it('NULL follows the stored age flag: the same NULL flips default when isMinor flips (turning 18)', () => {
    expect(canDiscloseReadAt({ isMinor: true, readReceipts: null }, { isMinor: true, readReceipts: true })).toBe(false);
    expect(canDiscloseReadAt({ isMinor: false, readReceipts: null }, { isMinor: false, readReceipts: true })).toBe(true);
  });
});
