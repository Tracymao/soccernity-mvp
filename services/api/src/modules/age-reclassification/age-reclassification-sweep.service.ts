import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { calculateAge, computeIsMinor, computeIsUnder16 } from '../auth/registration/age.util';

export interface AgeReclassificationResult {
  scanned: number;
  reclassifiedUserIds: string[];
  // Accounts reclassified in the YOUNGER direction (isMinor/isUnder16
  // false -> true). Never notified; surfaced here and via logger.warn for
  // manual investigation.
  reclassifiedYoungerUserIds: string[];
}

// Notification.type written when a user turns 16 (payloadRefId identifies
// which milestone, so the type can grow without a new column).
export const AGE_MILESTONE_NOTIFICATION_TYPE = 'age_milestone';
export const UNDER_16_LIFTED_MILESTONE = 'under_16_lifted';

// sprint-1/age-reclassification-sweep (Decision Log #349; closes the gap
// Decision Log #346/#347 both disclosed). User.isMinor and User.isUnder16
// were set once at registration and never recomputed, so a user who turned
// 16 stayed restricted from messaging/Bants/Community-Groups-create forever
// and one who turned 18 stayed on guardian-consent gating forever.
//
// TRANSITION BEHAVIOUR (decided deliberately):
//  - IMMEDIATE, not "next login". Every consumer reads these flags fresh
//    from Postgres per request: GuardianConsentGuard, Under16RestrictionGuard,
//    MessagingService (adult->minor block, recipient checks), UsersService,
//    the Club/Community-Group roster filters. The access token carries only
//    { sub, role } (token.types.ts) and no guard reads the flags from it, so
//    the very next request after this sweep commits sees the new
//    classification, including on a still-live session. (AuthUserSummary in
//    login/register responses does include isMinor, but that is a snapshot
//    for the client, never a server-side trust input.)
//  - Turning 16: nothing to reverse -- the restriction is only ever a
//    per-request guard read, so it simply stops applying.
//  - Turning 18: an existing Guardian row is NOT deleted or given a new
//    terminal status. A 'confirmed' row is consent history and is just no
//    longer read for gating (GuardianConsentGuard short-circuits on
//    !isMinor). A 'pending' row is inert: the expiry sweep and every
//    refusal path now skip non-minors, so an adult can never be auto-
//    declined into deletion by a lapsed request made when they were a
//    child. Deleting the row would destroy consent evidence.
//  - Both directions are handled (a mis-stored flag is corrected either way).
//
// Every change writes an AgeReclassificationLog row in the SAME transaction
// as the User update. Accounts with no dateOfBirth (anonymized 'deleted'
// rows) are never touched.
@Injectable()
export class AgeReclassificationSweepService {
  private readonly logger = new Logger(AgeReclassificationSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: RegistrationEmailService,
    private readonly dobEncryption: DobEncryptionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailySweep(): Promise<void> {
    const result = await this.sweepReclassifications();
    // Logged unconditionally, like the other sweeps: silence must not be
    // indistinguishable from "never ran".
    this.logger.log(
      `Age reclassification sweep complete: scanned=${result.scanned} ` +
        `reclassified=${result.reclassifiedUserIds.length} ` +
        `reclassifiedYounger=${result.reclassifiedYoungerUserIds.length}`,
    );
  }

  // `now` is injectable for deterministic tests, same as the other sweeps.
  async sweepReclassifications(now: Date = new Date()): Promise<AgeReclassificationResult> {
    // dateOfBirth is stored encrypted (security/dob-field-encryption), so
    // the old SQL range narrowing on it is impossible. Instead page through
    // every account that has a DOB (keyset, 500 per page -- never one giant
    // read), decrypt in memory, and keep only rows whose stored flags
    // disagree with the DOB. The exact decision is still made by the shared
    // age.util functions, the same ones registration uses. Cost is one
    // decrypt per account per daily run -- fine at MVP scale; revisit (e.g.
    // a stored non-sensitive birthday-month index) only if the table grows
    // to where this matters. `scanned` is now accounts EXAMINED, not the
    // old SQL-narrowed candidate count.
    const candidates: Array<{
      id: string;
      displayName: string;
      dateOfBirth: Date;
      isMinor: boolean;
      isUnder16: boolean;
    }> = [];
    let scanned = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.user.findMany({
        where: { dateOfBirth: { not: null } },
        select: { id: true, displayName: true, dateOfBirth: true, isMinor: true, isUnder16: true },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) break;
      for (const row of page) {
        scanned++;
        if (!row.dateOfBirth) continue;
        try {
          const dob = this.dobEncryption.decrypt(row.dateOfBirth);
          if (computeIsMinor(dob, now) !== row.isMinor || computeIsUnder16(dob, now) !== row.isUnder16) {
            candidates.push({ ...row, dateOfBirth: dob });
          }
        } catch (err) {
          // One undecryptable row must not strand the rest.
          this.logger.error(
            `Age reclassification sweep: could not decrypt dateOfBirth for user ${row.id}: ${(err as Error).message}`,
          );
        }
      }
      cursor = page[page.length - 1].id;
    }

    const reclassifiedUserIds: string[] = [];
    const reclassifiedYoungerUserIds: string[] = [];

    for (const user of candidates) {
      if (!user.dateOfBirth) continue;
      const nextMinor = computeIsMinor(user.dateOfBirth, now);
      const nextUnder16 = computeIsUnder16(user.dateOfBirth, now);
      if (nextMinor === user.isMinor && nextUnder16 === user.isUnder16) continue;

      const ageAtChange = calculateAge(user.dateOfBirth, now);
      try {
        const changed = await this.prisma.$transaction(async (tx) => {
          // Guarded on the values we read, so a concurrent change is a
          // no-op here rather than a lost update.
          const updated = await tx.user.updateMany({
            where: { id: user.id, isMinor: user.isMinor, isUnder16: user.isUnder16 },
            data: { isMinor: nextMinor, isUnder16: nextUnder16 },
          });
          if (updated.count === 0) return false;

          const logs = [];
          if (nextMinor !== user.isMinor) {
            logs.push({
              userId: user.id,
              field: 'isMinor',
              fromValue: user.isMinor,
              toValue: nextMinor,
              ageAtChange,
              occurredAt: now,
            });
          }
          if (nextUnder16 !== user.isUnder16) {
            logs.push({
              userId: user.id,
              field: 'isUnder16',
              fromValue: user.isUnder16,
              toValue: nextUnder16,
              ageAtChange,
              occurredAt: now,
            });
          }
          await tx.ageReclassificationLog.createMany({ data: logs });
          return true;
        });
        if (!changed) continue;
        reclassifiedUserIds.push(user.id);

        // Younger direction: a corrected date of birth, not a birthday.
        // Deliberately NOT notified -- a case for a human, flagged loudly
        // and distinctly from the ordinary aging-up path.
        if ((!user.isMinor && nextMinor) || (!user.isUnder16 && nextUnder16)) {
          reclassifiedYoungerUserIds.push(user.id);
          this.logger.warn(
            `Age reclassification sweep: user ${user.id} reclassified YOUNGER ` +
              `(isMinor ${user.isMinor}->${nextMinor}, isUnder16 ${user.isUnder16}->${nextUnder16}, ` +
              `age=${ageAtChange}). Likely a corrected dateOfBirth -- needs manual investigation; no notification sent.`,
          );
        }

        // The reclassification has ALREADY committed above; nothing below
        // can roll it back.
        if (user.isMinor && !nextMinor) {
          await this.notifyGuardianOfTurning18(user.id, user.displayName);
        }
        if (user.isUnder16 && !nextUnder16) {
          await this.notifyUserOfTurning16(user.id);
        }
      } catch (err) {
        // One bad row must not strand the rest; it is retried next run.
        this.logger.error(
          `Age reclassification sweep: failed for user ${user.id}: ${(err as Error).message}`,
        );
      }
    }

    return { scanned, reclassifiedUserIds, reclassifiedYoungerUserIds };
  }

  // Best-effort (never throws): informs the guardian on file that the
  // account is no longer guardian-consent-gated. Asks nothing of them.
  private async notifyGuardianOfTurning18(userId: string, displayName: string): Promise<void> {
    try {
      const guardian = await this.prisma.guardian.findUnique({
        where: { minorUserId: userId },
        select: { email: true, name: true },
      });
      if (!guardian) return;
      await this.emailService.sendGuardianMinorTurned18Email(guardian.email, displayName, guardian.name);
    } catch (err) {
      this.logger.error(
        `Age reclassification sweep: failed to notify guardian of user ${userId} turning 18: ${(err as Error).message}`,
      );
    }
  }

  // Best-effort (never throws): in-app notice to the user themselves.
  private async notifyUserOfTurning16(userId: string): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          type: AGE_MILESTONE_NOTIFICATION_TYPE,
          payloadRefId: UNDER_16_LIFTED_MILESTONE,
        },
      });
    } catch (err) {
      this.logger.error(
        `Age reclassification sweep: failed to notify user ${userId} of turning 16: ${(err as Error).message}`,
      );
    }
  }
}
