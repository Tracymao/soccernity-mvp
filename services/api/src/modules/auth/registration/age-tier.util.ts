import { calculateAge } from './age.util';

// B-103 (Decision Log #390, #395 B4): the age tier a support DOB correction
// compares before and after. The boundaries are the three the platform already
// enforces elsewhere: 13 (card-verification ceiling, COPPA band), 16
// (User.isUnder16, counsel's under-16 restrictions) and 18 (User.isMinor,
// guardian consent). 'under_13' needs no floor here: the lower sanity bound is
// the registration one (isPlausibleDateOfBirth).
export type AgeTier = 'under_13' | 'under_16' | 'under_18' | 'adult';

export function ageTierFor(dateOfBirth: Date, asOf: Date = new Date()): AgeTier {
  const age = calculateAge(dateOfBirth, asOf);
  if (age < 13) return 'under_13';
  if (age < 16) return 'under_16';
  if (age < 18) return 'under_18';
  return 'adult';
}
