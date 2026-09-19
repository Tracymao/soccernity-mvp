import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { GRACE_PERIOD_DAYS } from '../../account-deletion/account-deletion-sweep.service';
import { AuthService } from '../auth.service';
import { RegistrationEmailService } from '../registration/email/registration-email.service';
import { computeConsentTokenExpiresAt, computeWithdrawalTokenExpiresAt } from './consent-token.constants';

// sprint-1/guardian-consent-decline-withdraw-expiry -- the three distinct
// ways consent can end up refused. All three land the SAME
// Guardian.consentStatus ("declined") and the same account outcome
// (pending_deletion); this type exists only to pick the right copy for
// the minor's notification email, which genuinely differs between them:
// "your guardian said no", "your guardian changed their mind", and
// "nobody answered" are three different things to be told about your own
// account, and collapsing them into one message would be misleading.
export type ConsentRefusalReason = 'declined' | 'withdrawn' | 'expired';

// Sprint 1 / sprint-1/f5-f6-missing-endpoints — the response shape for
// GET /auth/guardian-consent/status (see getConsentStatus below). Carries
// exactly what Build Plan Section 8.3's Restricted Pending State and
// Activation Confirmation screens need to render for real, no more:
//
// - consentStatus: the real, current value, straight off the Guardian
//   row — never inferred from a JWT claim (structurally impossible
//   anyway, see token.types.ts) or cached.
// - guardianEmail: for a future "change guardian email" UI action — this
//   PR only exposes the data that action would need, it doesn't build
//   the action itself.
// - canResend: computed with the exact same condition
//   resendConsent() below already gates a real resend on
//   (consentStatus === 'pending'), so the frontend never has to
//   re-derive or duplicate that business rule client-side.
// - consentTimestamp: null until confirmed, useful for the Activation
//   Confirmation screen. Costs nothing extra since it's already selected.
export interface GuardianConsentStatusResponse {
  consentStatus: string;
  guardianEmail: string;
  canResend: boolean;
  consentTimestamp: Date | null;
}

// Build Plan Section 8.3, step 4: the guardian-facing confirmation
// endpoint. Steps 1-3 (age declaration, guardian-details capture, the
// consent email carrying this token) are RegistrationService's job
// (PR B2); step 5 (restricted-pending enforcement on other endpoints
// while consent is outstanding) is B7, not this PR. This service only
// covers step 4: turning a clicked consent link into a confirmed
// Guardian row.
//
// Guardian.consentToken (prisma/schema.prisma) is a persistent column,
// not an ephemeral Redis-backed value like
// registration/email-verification/email-verification-token.store.ts's
// email-verification token -- a guardian may legitimately click the
// same email link twice (double-click, re-opening an old email), so
// unlike that store's delete-on-consume, the token itself stays valid
// to look up indefinitely *within its expiry window* (DPIA finding R5 --
// see consent-token.constants.ts). "Single-use" here means the *state
// transition* (pending -> confirmed, setting consentTimestamp) happens
// at most once; confirming an already-confirmed, still-unexpired token
// is a no-op that still returns success, not an error and not a second
// timestamp write. An expired token, confirmed or not, is rejected.
@Injectable()
export class GuardianConsentService {
  private readonly logger = new Logger(GuardianConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: RegistrationEmailService,
    // sprint-1/guardian-consent-decline-withdraw-expiry -- injected ONLY
    // for startPendingDeletion(), so a refused consent reuses the exact
    // same account-deletion entry point POST /auth/delete-account uses
    // instead of inventing a parallel one. No import cycle: AuthModule
    // imports AuthFoundationModule only, and does not import this module
    // (or anything that does) -- see guardian-consent.module.ts.
    private readonly authService: AuthService,
  ) {}

  async confirmConsent(consentToken: string): Promise<void> {
    const guardian = await this.prisma.guardian.findUnique({ where: { consentToken } });

    // Deliberately generic — matching RegistrationService's own
    // non-enumeration posture (see register()'s duplicate-email comment):
    // an unknown token, an already-used one that's since been rotated,
    // and an expired one all land here, and this response doesn't
    // distinguish any of them.
    if (!guardian) {
      throw new BadRequestException('Invalid or expired consent token');
    }

    // DPIA finding R5: checked *before* the already-confirmed check
    // below, deliberately -- a confirmed-but-expired token must not
    // keep returning success forever. Idempotent-success only applies
    // to a still-valid token being re-clicked, not an old one that's
    // aged out.
    if (guardian.consentTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired consent token');
    }

    if (guardian.consentStatus === 'confirmed') {
      return;
    }

    // sprint-1/guardian-consent-decline-withdraw-expiry -- the ONE change
    // this PR makes to confirm, and it is a necessary one, deliberately
    // flagged rather than quietly slipped in: that PR's brief said not to
    // touch confirm's own logic, but introducing the "declined" status
    // without this check would open a real safeguarding hole. Guardian.
    // consentToken is a persistent column that keeps resolving after a
    // decline (it is NOT NULL and @unique, so it cannot be cleared), so
    // without this branch the guardian's ORIGINAL consent link would
    // still flip a declined account straight to "confirmed" -- silently
    // reversing a refusal, on an account already scheduled for deletion,
    // using a link that was emailed before the refusal was ever made.
    //
    // Not a generic "invalid or expired" message: the caller has already
    // proven possession of the real consent token, so there is nothing
    // left to enumerate, and telling them plainly what happened is more
    // useful than pretending the link is broken. A guardian who has
    // genuinely changed their mind cannot un-decline here by design --
    // the account is already in pending_deletion, and reversing that is a
    // separate decision this PR does not build (see the Decision Log
    // candidate in guardian-consent's README).
    if (guardian.consentStatus === 'declined') {
      throw new BadRequestException(
        'Consent for this account was declined or withdrawn and cannot be confirmed with this link.',
      );
    }

    // updateMany + a consentStatus guard in the where clause (rather than
    // a plain update()) closes the read-then-write race between the
    // findUnique above and this write: if two requests for the same
    // token both pass the check above concurrently, only the first
    // update that actually commits will match `consentStatus: pending`
    // -- the second finds zero matching rows and is a silent no-op,
    // never overwriting an already-set consentTimestamp.
    //
    // sprint-1/guardian-consent-decline-withdraw-expiry tightened this
    // guard from `{ not: 'confirmed' }` to the positive `'pending'`. Under
    // the old negative form, a row that became 'declined' between the
    // check above and this write would still match and be flipped to
    // 'confirmed' -- the same reversal the explicit branch above blocks,
    // just via the narrow race window rather than the happy path. The
    // positive form is the race-safe backstop for that branch, and is
    // exactly equivalent for every pre-existing case (pending was always
    // the only other value this line could match).
    await this.prisma.guardian.updateMany({
      where: { consentToken, consentStatus: 'pending' },
      data: { consentStatus: 'confirmed', consentTimestamp: new Date() },
    });
  }

  // DPIA finding R5's "re-send path": takes the MINOR's registered
  // email, not the guardian's -- the minor is the one who would know to
  // ask "did my guardian get the email," and this avoids needing a
  // second lookup-by-guardian-email path (which would also be a second
  // email-enumeration surface). Deliberately the same generic response
  // (silent success, no error) whether the email doesn't match a User,
  // matches an adult, matches a minor with no Guardian row, or matches
  // a minor whose Guardian has already confirmed -- none of those are
  // distinguishable from the caller's side, matching every other
  // non-enumeration posture in this module (RegistrationService,
  // confirmConsent above). Rate-limited by the controller
  // (@AuthRateLimit()) since an unlimited resend endpoint is a spam
  // vector against a guardian's inbox.
  async resendConsent(email: string): Promise<void> {
    // Decision Log #16: matches the same lowercase-on-write/lookup
    // normalization login()/register() use, since User.email is stored
    // lowercase.
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return;
    }

    const guardian = await this.prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    if (!guardian || guardian.consentStatus !== 'pending') {
      return;
    }

    await this.reissueConsentToken({
      guardianId: guardian.id,
      minorDisplayName: user.displayName,
      markAutoResent: false,
    });
  }

  // sprint-1/guardian-consent-decline-withdraw-expiry -- extracted
  // verbatim out of resendConsent() above so the expiry sweep
  // (GuardianConsentExpirySweepService) performs its automatic re-send
  // through the EXACT same code path a manual re-send uses, rather than
  // duplicating token rotation and email dispatch a second time where the
  // two could drift. Public for that one cross-class caller only.
  //
  // A fresh token, not an extension of the old one's expiry -- the old
  // token stops resolving entirely (consentToken is @unique; this
  // overwrites the only copy of it), closing the exact "permanent
  // credential sitting in an inbox" risk R5 describes for whichever
  // inbox the *previous* email landed in.
  //
  // markAutoResent is passed explicitly by BOTH callers rather than
  // defaulted, so neither can silently acquire the other's behaviour:
  // only the sweep sets Guardian.consentAutoResentAt, because that field
  // means specifically "the platform has already spent its one automatic
  // chase on this row" (see schema.prisma's comment on it). A manual
  // re-send by the minor must never consume that budget -- otherwise the
  // next lapse would schedule their account for deletion having sent no
  // automated warning at all.
  async reissueConsentToken(params: {
    guardianId: string;
    minorDisplayName: string;
    markAutoResent: boolean;
  }): Promise<void> {
    const updated = await this.prisma.guardian.update({
      where: { id: params.guardianId },
      data: {
        consentToken: randomUUID(),
        consentTokenExpiresAt: computeConsentTokenExpiresAt(this.config),
        ...(params.markAutoResent ? { consentAutoResentAt: new Date() } : {}),
      },
    });

    await this.emailService.sendGuardianConsentEmail(
      updated.email,
      updated.consentToken,
      params.minorDisplayName,
    );
  }

  // -------------------------------------------------------------------
  // sprint-1/guardian-consent-decline-withdraw-expiry
  //
  // Before this PR Guardian.consentStatus only ever moved pending ->
  // confirmed. There was no way for a guardian to say no, no way to take
  // back a yes, and nothing ever acted on consentTokenExpiresAt -- so an
  // unanswered request left a minor's account restricted-pending forever,
  // holding their personal data indefinitely with no resolution path.
  // These three entry points close that gap. All of them converge on the
  // single refuseConsentAndScheduleDeletion() primitive below, so the
  // resulting account state can never differ between them.
  // -------------------------------------------------------------------

  // POST /auth/guardian-consent/decline. Same trust model as
  // confirmConsent(): no guard, because the guardian is not a Soccernity
  // account holder at all and Guardian.consentToken -- a server-issued,
  // unguessable UUID that only ever landed in the guardian's own inbox --
  // is itself the credential.
  //
  // Only a PENDING request can be declined. A guardian who already
  // confirmed and has since changed their mind is doing something
  // materially different (withdrawing consent that is currently live and
  // that the minor has been relying on), and is sent through the
  // withdrawal flow instead -- which re-proves possession of the guardian
  // inbox with a fresh token rather than accepting a consent link that
  // may be up to 72 hours old.
  async declineConsent(consentToken: string): Promise<void> {
    const guardian = await this.prisma.guardian.findUnique({ where: { consentToken } });

    // Identical generic rejection to confirmConsent()'s, for identical
    // reasons -- an unknown token and a rotated one are indistinguishable
    // from the caller's side and this response keeps them that way.
    if (!guardian) {
      throw new BadRequestException('Invalid or expired consent token');
    }

    // Expiry checked before the status branches below, matching
    // confirmConsent()'s own DPIA-R5 ordering: an aged-out link must not
    // keep doing anything, in either direction.
    if (guardian.consentTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired consent token');
    }

    // Idempotent, mirroring confirmConsent()'s already-confirmed no-op: a
    // guardian double-clicking the decline link, or re-opening the email
    // later, gets success rather than an error -- and critically does NOT
    // re-enter the refusal path, which would otherwise restart the
    // minor's 30-day deletion clock (see refuseConsentAndScheduleDeletion).
    if (guardian.consentStatus === 'declined') {
      return;
    }

    // A plain, non-generic message: the caller has already proven
    // possession of the real consent token, so there is nothing left to
    // enumerate, and pointing them at the flow that CAN do what they want
    // is more useful than a misleading "invalid link".
    if (guardian.consentStatus === 'confirmed') {
      throw new BadRequestException(
        'Consent for this account has already been confirmed. Request a withdrawal link instead.',
      );
    }

    await this.refuseConsentAndScheduleDeletion({
      guardianId: guardian.id,
      minorUserId: guardian.minorUserId,
      reason: 'declined',
    });
  }

  // POST /auth/guardian-consent/withdraw/request. Mirrors resendConsent()
  // deliberately and exactly: it takes the MINOR's registered email, not
  // the guardian's, and always returns the same generic response whether
  // or not anything matched.
  //
  // Taking the minor's email rather than the guardian's is a real choice,
  // not an oversight, and it is the safer of the two: User.email is
  // @unique and Guardian.minorUserId is @unique, so a minor's address
  // identifies exactly one Guardian row -- whereas Guardian.email carries
  // no uniqueness constraint at all, so a guardian of two children would
  // be ambiguous, and accepting it would open a brand-new enumeration
  // surface against guardian addresses. It also costs nothing in safety
  // that the minor's address is the input: the withdrawal link this issues
  // is only ever emailed to Guardian.email, so a stranger who guessed a
  // real minor's address still cannot withdraw anything -- they would only
  // cause an email to arrive in the genuine guardian's inbox, which is the
  // same exposure POST /auth/guardian-consent/resend already carries and
  // is rate-limited for the same reason.
  //
  // Silent no-op unless consent is currently CONFIRMED: there is nothing
  // to withdraw from a pending request (that is a decline) and nothing to
  // withdraw from an already-declined one.
  async requestWithdrawal(email: string): Promise<void> {
    // Decision Log #16 -- same lowercase normalization every other
    // email lookup in this module uses.
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return;
    }

    const guardian = await this.prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    if (!guardian || guardian.consentStatus !== 'confirmed') {
      return;
    }

    // Rotated on every request, exactly like the consent token on resend:
    // the previously-issued withdrawal link (if any) stops resolving the
    // moment this overwrites it, so at most one live withdrawal
    // credential exists per guardian at any time.
    const updated = await this.prisma.guardian.update({
      where: { id: guardian.id },
      data: {
        withdrawalToken: randomUUID(),
        withdrawalTokenExpiresAt: computeWithdrawalTokenExpiresAt(this.config),
      },
    });

    await this.emailService.sendGuardianWithdrawalRequestEmail(
      updated.email,
      updated.withdrawalToken!,
      user.displayName,
    );
  }

  // POST /auth/guardian-consent/withdraw. The second half of the
  // withdrawal flow -- same token-is-the-credential trust model as
  // confirm/decline, but against the separate, freshly-issued
  // Guardian.withdrawalToken rather than the long-lived consent token.
  //
  // No already-withdrawn idempotency branch is needed here, unlike
  // declineConsent() above: refuseConsentAndScheduleDeletion() clears
  // withdrawalToken as part of the same write that sets "declined", so a
  // second click on the same link finds no row at all and lands on the
  // generic rejection below. That is the correct outcome -- the link is
  // genuinely spent.
  async withdrawConsent(withdrawalToken: string): Promise<void> {
    const guardian = await this.prisma.guardian.findUnique({ where: { withdrawalToken } });

    if (!guardian || !guardian.withdrawalTokenExpiresAt) {
      throw new BadRequestException('Invalid or expired withdrawal token');
    }

    if (guardian.withdrawalTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired withdrawal token');
    }

    // Defence-in-depth: requestWithdrawal only ever issues a token for a
    // confirmed row, and the token is cleared on refusal, so this should
    // be unreachable. It exists so that any future path which sets
    // withdrawalToken without that precondition cannot accidentally
    // convert a pending request into a withdrawal.
    if (guardian.consentStatus !== 'confirmed') {
      throw new BadRequestException('Invalid or expired withdrawal token');
    }

    await this.refuseConsentAndScheduleDeletion({
      guardianId: guardian.id,
      minorUserId: guardian.minorUserId,
      reason: 'withdrawn',
    });
  }

  // The single place consent is refused and the minor's account is put on
  // the deletion path -- shared by declineConsent(), withdrawConsent(),
  // and GuardianConsentExpirySweepService's implicit-decline branch, so
  // the three can never produce divergent account states.
  //
  // Public for that one cross-class caller (the sweep), the same narrow
  // reason getConsentStatusForUser() and reissueConsentToken() are public.
  //
  // Deliberately NOT a Prisma transaction. The two writes below span
  // different systems -- Postgres for the Guardian/User rows, Redis for
  // session revocation inside startPendingDeletion() -- so no single
  // transaction could cover both anyway. The ORDER is what makes a
  // partial failure safe: the Guardian row is refused FIRST, and every
  // consent-enforcement site in this codebase is an allowlist
  // (consentStatus === 'confirmed'), never a denylist, so a refused row
  // is already locked down platform-wide even if the steps after it fail.
  // The worst partial outcome is an account that is fully restricted but
  // whose 30-day clock has not started -- which fails in the safe
  // direction and is visible in the logs rather than silently permissive.
  async refuseConsentAndScheduleDeletion(params: {
    guardianId: string;
    minorUserId: string;
    reason: ConsentRefusalReason;
  }): Promise<void> {
    // updateMany with a status guard, not update() -- same read-then-write
    // race closure confirmConsent() uses. A zero-row result means another
    // concurrent request (or an earlier click) already refused this row,
    // in which case everything below has already happened once and must
    // NOT happen again: re-running startPendingDeletion() would reset
    // pendingDeletionAt to now and silently push the minor's 30-day
    // deletion date out, and re-sending the notification email would tell
    // them twice.
    //
    // withdrawalToken is cleared in the same write, which is what makes a
    // withdrawal link genuinely single-use.
    const refused = await this.prisma.guardian.updateMany({
      where: { id: params.guardianId, consentStatus: { not: 'declined' } },
      data: {
        consentStatus: 'declined',
        withdrawalToken: null,
        withdrawalTokenExpiresAt: null,
      },
    });

    if (refused.count === 0) {
      return;
    }

    const minor = await this.prisma.user.findUnique({
      where: { id: params.minorUserId },
      select: { id: true, email: true, displayName: true, accountStatus: true },
    });

    // Guardian.minorUserId is a real FK with ON DELETE RESTRICT, so a
    // missing User here is not reachable in practice -- but the Guardian
    // row has already been refused above, which is the safeguarding-
    // critical half, so there is nothing further to do and nothing to
    // notify.
    if (!minor) {
      return;
    }

    // Skip if the account is ALREADY on the deletion path -- typically
    // because the minor themselves requested deletion (POST
    // /auth/delete-account) while consent was still outstanding. Calling
    // startPendingDeletion() again would reset pendingDeletionAt to now,
    // pushing their existing, earlier 30-day deadline further out; a
    // guardian refusing consent must never have the side effect of
    // EXTENDING how long the platform holds a minor's data.
    if (minor.accountStatus !== 'pending_deletion') {
      // The one shared primitive that flips accountStatus to
      // "pending_deletion", stamps pendingDeletionAt and revokes every
      // session -- reused rather than reimplemented specifically so
      // AccountDeletionSweepService's existing 30-day grace period, hard
      // delete, cascade and ConsentAuditRecord retention (Decision Log
      // #42/#44) then apply byte-for-byte identically, with no new
      // account state invented for this flow.
      await this.authService.startPendingDeletion(minor.id);
    }

    await this.notifyMinorOfRefusal(minor.email, minor.displayName, params.reason);
  }

  // Notification failures must never fail the refusal itself -- the
  // account state change is the safeguarding-critical part and has
  // already committed by the time this runs. RegistrationEmailService
  // already swallows and logs Postmark errors internally (see its own
  // dispatch()), so this is belt-and-braces for anything it doesn't
  // catch.
  private async notifyMinorOfRefusal(
    email: string,
    displayName: string,
    reason: ConsentRefusalReason,
  ): Promise<void> {
    try {
      if (reason === 'withdrawn') {
        await this.emailService.sendConsentWithdrawnEmail(email, displayName, GRACE_PERIOD_DAYS);
        return;
      }
      if (reason === 'expired') {
        await this.emailService.sendConsentExpiredEmail(email, displayName, GRACE_PERIOD_DAYS);
        return;
      }
      await this.emailService.sendConsentDeclinedEmail(email, displayName, GRACE_PERIOD_DAYS);
    } catch (err) {
      this.logger.error(
        'Failed to notify minor of guardian-consent refusal (reason=' +
          reason +
          '): ' +
          (err as Error).message,
      );
    }
  }

  // Sprint 2 / sprint-2/verify-email-consent-status-field (Decision Log
  // #38): the shared source of truth both GET /auth/guardian-consent/status
  // (below) and POST /auth/verify-email (RegistrationService.verifyEmail,
  // via cross-module injection — see guardian-consent.module.ts's
  // `exports`) derive a caller's guardian-consent state from. Extracted
  // out of getConsentStatus() specifically so there is exactly ONE place
  // that queries Guardian-by-minorUserId and shapes the result — not two
  // parallel implementations that could drift. Public (not private)
  // specifically so RegistrationService can call it directly rather than
  // this class growing a second, narrower wrapper method per caller.
  //
  // Returns `null` rather than throwing when no Guardian row exists —
  // unlike getConsentStatus() below, this method's callers need to
  // distinguish "no guardian-consent flow applies to this user at all"
  // (the ordinary case for every non-minor) from an error, so the
  // throw-a-404 decision is left to whichever caller actually wants it
  // (getConsentStatus does; verifyEmail does not, since email verification
  // must never fail because of a downstream data-invariant question that
  // has nothing to do with the token being verified).
  async getConsentStatusForUser(minorUserId: string): Promise<GuardianConsentStatusResponse | null> {
    const guardian = await this.prisma.guardian.findUnique({ where: { minorUserId } });
    if (!guardian) {
      return null;
    }

    return {
      consentStatus: guardian.consentStatus,
      guardianEmail: guardian.email,
      // Mirrors resendConsent()'s own gate exactly (`consentStatus !==
      // 'pending'` -> no resend) so the frontend never has to re-derive
      // this business rule itself.
      canResend: guardian.consentStatus === 'pending',
      consentTimestamp: guardian.consentTimestamp,
    };
  }

  // GET /auth/guardian-consent/status. `minorUserId` is the CALLER's own
  // id, taken from the verified JWT (`sub`) by the controller — never a
  // path param, and this route is deliberately JwtAuthGuard-only, NOT
  // GuardianConsentGuard: a restricted-pending minor must be able to
  // check their own restricted status by definition, and gating this
  // behind the same guard that enforces the restriction would make that
  // impossible. See auth/README.md for the full guard-choice writeup.
  //
  // "No Guardian row for this caller" covers two indistinguishable cases
  // — the caller isn't a minor at all, or a data-invariant violation (a
  // minor with no Guardian row, which RegistrationService should never
  // produce but isn't guaranteed by a DB constraint) — both are a real
  // 404, never a silent null 200, matching this codebase's own
  // established convention (see ClubsService.assertClubExists,
  // UsersService.assertUserExists).
  async getConsentStatus(minorUserId: string): Promise<GuardianConsentStatusResponse> {
    const status = await this.getConsentStatusForUser(minorUserId);
    if (!status) {
      throw new NotFoundException('No guardian consent record exists for this account');
    }

    return status;
  }
}
