import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import { requiresCardVerification } from '../auth/guardian-consent/card-verification-policy.util';
import { computeConsentTokenExpiresAt } from '../auth/guardian-consent/consent-token.constants';
import { computeIsMinor, computeIsUnder16, isPlausibleDateOfBirth } from '../auth/registration/age.util';
import { AgeTier, ageTierFor } from '../auth/registration/age-tier.util';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { CorrectDobDto } from './dto/correct-dob.dto';

// What the correction did to the guardian request. Reported to the admin and
// recorded in the audit entry.
export type DobCorrectionGuardianOutcome =
  | 'unchanged' // age tier did not change, or nothing about it needed to move
  | 'cancelled' // the account became an adult: the open request's link was killed
  | 'restarted' // existing Guardian row reset to a fresh pending request
  | 'created' // an adult account became a minor: a Guardian row was created
  | 'kept_confirmed' // tier changed but the confirmed consent was left standing
  | 'skipped_pending_deletion'; // account is on the deletion path: not touched

export interface DobCorrectionResult {
  userId: string;
  ageTierBefore: AgeTier;
  ageTierAfter: AgeTier;
  guardianRequest: DobCorrectionGuardianOutcome;
  declineCounterReset: boolean;
  incorrectDetailsFlagCleared: boolean;
}

type GuardianInput = NonNullable<CorrectDobDto['guardian']>;

type GuardianPlan =
  | { kind: 'none'; outcome: DobCorrectionGuardianOutcome }
  | { kind: 'cancel'; outcome: 'cancelled' }
  | { kind: 'restart'; outcome: 'restarted'; cardNowRequired: boolean; newGuardian: GuardianInput | undefined }
  | { kind: 'create'; outcome: 'created'; cardNowRequired: boolean; guardian: GuardianInput };

// B-103 (Decision Log #390, #395 B4, #398, #403 item 15): the audited support
// action that corrects a user's date of birth. DOB is read-only for users
// after the Age Gate (#367); this is the only way it changes.
//
// WHAT IT DOES, in one transaction:
//   1. Validates the corrected date with the SAME check registration uses
//      (isPlausibleDateOfBirth) and re-derives isMinor / isUnder16 with the same
//      functions registration uses (computeIsMinor / computeIsUnder16), so the
//      flags every guard reads move immediately rather than waiting for the
//      daily age-reclassification sweep.
//   2. Re-runs the card-verification policy (requiresCardVerification) against
//      the corrected date and the user's DERIVED safeguarding country.
//   3. If the age TIER (under 13 / under 16 / under 18 / adult) changed, cancels
//      the in-flight guardian request and, when the account is a minor, restarts
//      it -- see decideGuardianPlan().
//   4. Clears Guardian.incorrectDetailsReportedAt: the correction is the remedy
//      for "the guardian says the details are wrong" (B-029).
//   5. Resets the decline counter when a restart happened (#403 item 15).
//   6. Writes the audit row IN THE SAME TRANSACTION as the change, so a
//      correction can never exist without its audit entry (unlike
//      AdminActionLogService.record, which runs after commit).
//
// THE AUDIT ROW NEVER HOLDS A DATE OF BIRTH: admin, target, reason, old tier,
// new tier, timestamp -- plus what happened to the guardian request, as
// categories. The response does not echo the dates either.
@Injectable()
export class AdminUserDobCorrectionService {
  private readonly logger = new Logger(AdminUserDobCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dobEncryption: DobEncryptionService,
    private readonly config: ConfigService,
    private readonly emailService: RegistrationEmailService,
  ) {}

  async correctDateOfBirth(userId: string, adminId: string, dto: CorrectDobDto): Promise<DobCorrectionResult> {
    const newDob = new Date(dto.dateOfBirth);
    // Same validation registration applies (RegistrationService.register).
    if (!isPlausibleDateOfBirth(newDob)) {
      throw new BadRequestException('dateOfBirth must be a real, non-future date');
    }

    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException('A reason of at least 10 characters is required.');
    }

    const now = new Date();
    const emailsToSend: Array<() => Promise<void>> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          dateOfBirth: true,
          accountStatus: true,
          derivedCountry: true,
          guardian: true,
        },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      // Anonymized (Decision Log #341): no DOB to correct and nobody to restart.
      if (user.accountStatus === 'deleted' || user.dateOfBirth === null) {
        throw new ConflictException(
          'This user has been deleted and anonymized; there is no date of birth to correct.',
        );
      }

      const oldDob = this.dobEncryption.decrypt(user.dateOfBirth);
      if (oldDob.getTime() === newDob.getTime()) {
        throw new BadRequestException('That is already the date of birth on file.');
      }

      const tierBefore = ageTierFor(oldDob, now);
      const tierAfter = ageTierFor(newDob, now);
      const isMinor = computeIsMinor(newDob, now);
      const isUnder16 = computeIsUnder16(newDob, now);

      const guardian = user.guardian;
      const plan = this.decideGuardianPlan({
        tierBefore,
        tierAfter,
        accountStatus: user.accountStatus,
        guardian,
        cardNowRequired: requiresCardVerification(newDob, user.derivedCountry, now),
        guardianDetails: dto.guardian,
        userEmail: user.email,
      });

      // Optimistic lock on the stored ciphertext: if another correction landed
      // since the read above the value no longer matches and nothing is written.
      const updated = await tx.user.updateMany({
        where: { id: userId, dateOfBirth: user.dateOfBirth },
        data: { dateOfBirth: this.dobEncryption.encrypt(newDob), isMinor, isUnder16 },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'The date of birth changed while this was being processed. Please refresh and try again.',
        );
      }

      let declineCounterReset = false;
      const incorrectDetailsFlagCleared = guardian?.incorrectDetailsReportedAt != null;

      if (plan.kind === 'restart' && guardian) {
        const token = randomUUID();
        await tx.guardian.update({
          where: { id: guardian.id },
          data: {
            ...(plan.newGuardian
              ? {
                  name: plan.newGuardian.name.trim(),
                  email: plan.newGuardian.email.trim().toLowerCase(),
                  relationship: plan.newGuardian.relationship,
                }
              : {}),
            consentStatus: 'pending',
            consentToken: token,
            consentTokenExpiresAt: computeConsentTokenExpiresAt(this.config),
            consentAutoResentAt: null,
            consentDeclineSource: null,
            declineCount: 0,
            incorrectDetailsReportedAt: null,
            withdrawalToken: null,
            withdrawalTokenExpiresAt: null,
            // The earlier consent (if any) was given on the wrong age facts and
            // is superseded; the new approval will stamp these afresh.
            consentTimestamp: null,
            consentScreenVersion: null,
            consentDeviceType: null,
            consentVerificationMethod: null,
            consentVerificationAt: null,
            // A different age may mean a different consent path: re-decided here
            // and frozen again, exactly as registration does it.
            cardVerificationRequired: plan.cardNowRequired,
            stripePaymentIntentId: null,
            cardVerifiedAt: null,
            cardRefundedAt: null,
          },
        });
        declineCounterReset = guardian.declineCount > 0;
        const to = plan.newGuardian?.email.trim().toLowerCase() ?? guardian.email;
        emailsToSend.push(() => this.emailService.sendGuardianConsentEmail(to, token, user.displayName));
      } else if (plan.kind === 'create') {
        const token = randomUUID();
        await tx.guardian.create({
          data: {
            minorUserId: userId,
            name: plan.guardian.name.trim(),
            email: plan.guardian.email.trim().toLowerCase(),
            relationship: plan.guardian.relationship,
            cardVerificationRequired: plan.cardNowRequired,
            consentToken: token,
            consentTokenExpiresAt: computeConsentTokenExpiresAt(this.config),
          },
        });
        const to = plan.guardian.email.trim().toLowerCase();
        emailsToSend.push(() => this.emailService.sendGuardianConsentEmail(to, token, user.displayName));
      } else if (plan.kind === 'cancel' && guardian) {
        // The account is now an adult: the open request's link must stop working.
        // The row and its history are KEPT (Decision Log #349); status stays
        // 'pending', which is inert for a non-minor because every sweep and
        // refusal path skips non-minors (#349). Token replaced and expired.
        await tx.guardian.update({
          where: { id: guardian.id },
          data: {
            consentToken: randomUUID(),
            consentTokenExpiresAt: now,
            incorrectDetailsReportedAt: null,
          },
        });
      } else if (guardian && incorrectDetailsFlagCleared) {
        await tx.guardian.update({ where: { id: guardian.id }, data: { incorrectDetailsReportedAt: null } });
      }

      // Audit entry: admin, target, reason, old tier, new tier, timestamp
      // (createdAt). Never a DOB value.
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.USER_DOB_CORRECTED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          targetId: userId,
          notes:
            `age_tier ${tierBefore} -> ${tierAfter}; guardian_request=${plan.outcome}; ` +
            `decline_counter_reset=${declineCounterReset}; incorrect_details_flag_cleared=${incorrectDetailsFlagCleared}; ` +
            `reason=${reason}`,
        },
      });

      const out: DobCorrectionResult = {
        userId,
        ageTierBefore: tierBefore,
        ageTierAfter: tierAfter,
        guardianRequest: plan.outcome,
        declineCounterReset,
        incorrectDetailsFlagCleared,
      };
      return out;
    });

    // After commit, best effort: a mail failure must never undo a correction.
    for (const send of emailsToSend) {
      try {
        await send();
      } catch (err) {
        this.logger.warn(
          `Guardian consent email after DOB correction for user ${userId} failed: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Admin ${adminId} corrected the date of birth of user ${userId} (${result.ageTierBefore} -> ${result.ageTierAfter}).`,
    );
    return result;
  }

  // The tier-change rules (Decision Log #395 B4; #390). Pure.
  //
  //   tier unchanged ................. nothing to cancel or restart.
  //   tier changed, now an ADULT ..... an open (pending) request is CANCELLED.
  //   tier changed, still/now a MINOR:
  //     account on the deletion path . left alone (skipped_pending_deletion).
  //     no Guardian row ............... a new one is CREATED -- guardian details
  //                                     are required (nobody to ask otherwise).
  //     request pending or declined ... RESTARTED (in flight, or reopenable).
  //     consent CONFIRMED ............. restarted only if that consent can no
  //                                     longer stand: the account was an adult
  //                                     (consent was given about different age
  //                                     facts) or the corrected age now needs the
  //                                     card step the guardian never completed.
  //                                     Otherwise KEPT: the guardian approved the
  //                                     child and a minor-to-minor correction
  //                                     does not undo that. (An adopted default,
  //                                     veto-able: #395 B4 speaks only of an
  //                                     "in-flight" request.)
  private decideGuardianPlan(input: {
    tierBefore: AgeTier;
    tierAfter: AgeTier;
    accountStatus: string;
    guardian: {
      consentStatus: string;
      cardVerifiedAt: Date | null;
      cardRefundedAt: Date | null;
    } | null;
    cardNowRequired: boolean;
    guardianDetails: CorrectDobDto['guardian'];
    userEmail: string;
  }): GuardianPlan {
    const { tierBefore, tierAfter, accountStatus, guardian, cardNowRequired, guardianDetails, userEmail } = input;

    if (tierBefore === tierAfter) return { kind: 'none', outcome: 'unchanged' };

    if (tierAfter === 'adult') {
      return guardian && guardian.consentStatus === 'pending'
        ? { kind: 'cancel', outcome: 'cancelled' }
        : { kind: 'none', outcome: 'unchanged' };
    }

    // From here the corrected age is a minor tier.
    if (accountStatus === 'pending_deletion') return { kind: 'none', outcome: 'skipped_pending_deletion' };

    const checkNewGuardian = (g: GuardianInput): void => {
      if (g.email.trim().toLowerCase() === userEmail.trim().toLowerCase()) {
        throw new BadRequestException("The guardian email can't be the user's own email address.");
      }
    };

    if (!guardian) {
      if (!guardianDetails) {
        throw new BadRequestException(
          'This correction makes the account a minor and no guardian is on file. Provide guardian name, email and relationship.',
        );
      }
      checkNewGuardian(guardianDetails);
      return { kind: 'create', outcome: 'created', cardNowRequired, guardian: guardianDetails };
    }

    if (guardian.consentStatus === 'confirmed') {
      const consentCannotStand = tierBefore === 'adult' || (cardNowRequired && !guardian.cardVerifiedAt);
      if (!consentCannotStand) return { kind: 'none', outcome: 'kept_confirmed' };
    }

    // A completed-but-unrefunded charge cannot be cleared without orphaning it
    // (CardRefundRetrySweepService finds it by these fields) -- same refusal
    // changeGuardianEmail makes.
    if (guardian.cardVerifiedAt && !guardian.cardRefundedAt) {
      throw new ConflictException(
        'A card verification for the current guardian is still being settled. Try the correction again in a little while.',
      );
    }

    if (guardianDetails) checkNewGuardian(guardianDetails);
    return { kind: 'restart', outcome: 'restarted', cardNowRequired, newGuardian: guardianDetails };
  }
}
