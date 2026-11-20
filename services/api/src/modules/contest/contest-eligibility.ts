import { Prisma } from '@prisma/client';

// backend/w7-contest (B-091, Decision Log #382; docs/contest-spec.md sections 8, 9a). Who a contest
// treats as an ELIGIBLE account -- one whose votes, likes, comments and entries count:
//
//   - an active account (deactivated, suspended, pending-deletion and anonymised accounts never count);
//   - a verified email ("accounts without a verified email never count");
//   - not restricted: an adult, or a minor whose guardian has CONFIRMED consent (the test
//     GuardianConsentGuard applies; a pending, declined or withdrawn minor is restricted and "accounts
//     with restrictions never count", and cannot vote).
//
// It is evaluated WHEN A TALLY IS TAKEN, not when the engagement is recorded: an account that is
// restricted or deactivated after it liked an entry stops counting, which is what "never count"
// means. The same filter is what the Contest notification fan-out uses for its recipients
// (contest-notifications/contest-notification-sweep.service.ts keeps its own copy of the literal;
// both must stay equal -- contest-eligibility.spec.ts pins that).
export const CONTEST_ELIGIBLE_USER: Prisma.UserWhereInput = {
  accountStatus: 'active',
  verificationStatus: 'verified',
  OR: [{ isMinor: false }, { guardian: { is: { consentStatus: 'confirmed' } } }],
};
