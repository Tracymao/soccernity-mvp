import { deriveOnboardingState, guardianConsentStateFor, isProfileComplete } from './onboarding-state.util';

// B-030 / B-027 (Decision Log #367, #369, #394 A6).
describe('isProfileComplete', () => {
  it.each([
    ['temi_fc', true],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%p -> %p', (username, expected) => {
    expect(isProfileComplete({ username })).toBe(expected);
  });
});

describe('guardianConsentStateFor', () => {
  it('an adult is not_applicable whatever a leftover Guardian row says', () => {
    expect(guardianConsentStateFor(false, 'confirmed')).toBe('not_applicable');
    expect(guardianConsentStateFor(false, null)).toBe('not_applicable');
  });

  it("reports a minor's real status, 'declined' as itself (never folded into pending)", () => {
    expect(guardianConsentStateFor(true, 'pending')).toBe('pending');
    expect(guardianConsentStateFor(true, 'confirmed')).toBe('confirmed');
    expect(guardianConsentStateFor(true, 'declined')).toBe('declined');
  });

  it('fails closed: a minor with no Guardian row, or an unrecognised value, is pending', () => {
    expect(guardianConsentStateFor(true, null)).toBe('pending');
    expect(guardianConsentStateFor(true, undefined)).toBe('pending');
    expect(guardianConsentStateFor(true, 'Confirmed')).toBe('pending');
  });
});

describe('deriveOnboardingState.nextStep', () => {
  const adult = { isMinor: false, guardianConsentStatus: null, verificationStatus: 'verified', username: 'x' };

  it('restricted_pending for a minor who is pending, on every call', () => {
    expect(
      deriveOnboardingState({ ...adult, isMinor: true, guardianConsentStatus: 'pending' }).nextStep,
    ).toBe('restricted_pending');
  });

  it('restricted_pending for a declined minor too, and it wins over every later step', () => {
    const s = deriveOnboardingState({
      isMinor: true,
      guardianConsentStatus: 'declined',
      verificationStatus: 'unverified',
      username: null,
    });
    expect(s.nextStep).toBe('restricted_pending');
    expect(s.guardianConsentStatus).toBe('declined');
  });

  it('an approved minor continues the flow like an adult: verify email, then create profile', () => {
    const minor = { ...adult, isMinor: true, guardianConsentStatus: 'confirmed' };
    expect(deriveOnboardingState({ ...minor, verificationStatus: 'unverified', username: null }).nextStep).toBe('verify_email');
    expect(deriveOnboardingState({ ...minor, username: null }).nextStep).toBe('create_profile');
    expect(deriveOnboardingState(minor).nextStep).toBe('none');
  });

  it('an adult: verify_email before create_profile (verification is required BEFORE Create Profile)', () => {
    expect(deriveOnboardingState({ ...adult, verificationStatus: 'unverified', username: null }).nextStep).toBe('verify_email');
    expect(deriveOnboardingState({ ...adult, username: null }).nextStep).toBe('create_profile');
    expect(deriveOnboardingState(adult).nextStep).toBe('none');
  });

  it('a legacy account without a username is sent to create_profile', () => {
    const s = deriveOnboardingState({ ...adult, username: null });
    expect(s.profileComplete).toBe(false);
    expect(s.nextStep).toBe('create_profile');
  });

  it('a reclassified adult with a leftover declined Guardian row is not held in restricted_pending', () => {
    expect(deriveOnboardingState({ ...adult, guardianConsentStatus: 'declined' }).nextStep).toBe('none');
  });
});
