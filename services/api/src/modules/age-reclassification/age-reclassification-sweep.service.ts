import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateAge, computeIsMinor, computeIsUnder16 } from '../auth/registration/age.util';

export interface AgeReclassificationResult {
  scanned: number;
  reclassifiedUserIds: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailySweep(): Promise<void> {
    const result = await this.sweepReclassifications();
    // Logged unconditionally, like the other sweeps: silence must not be
    // indistinguishable from "never ran".
    this.logger.log(
      `Age reclassification sweep complete: scanned=${result.scanned} ` +
        `reclassified=${result.reclassifiedUserIds.length}`,
    );
  }

  // `now` is injectable for deterministic tests, same as the other sweeps.
  async sweepReclassifications(now: Date = new Date()): Promise<AgeReclassificationResult> {
    // Candidate narrowing only (a stored flag that could disagree with the
    // date of birth), widened by a day each way so timezone edges are never
    // missed; the exact decision is always made by the shared age.util
    // functions below, the same ones registration uses.
    const bound = (years: number, offsetMs: number) => {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - years);
      return new Date(d.getTime() + offsetMs);
    };

    const candidates = await this.prisma.user.findMany({
      where: {
        dateOfBirth: { not: null },
        OR: [
          { isMinor: true, dateOfBirth: { lte: bound(18, DAY_MS) } },
          { isMinor: false, dateOfBirth: { gt: bound(18, -DAY_MS) } },
          { isUnder16: true, dateOfBirth: { lte: bound(16, DAY_MS) } },
          { isUnder16: false, dateOfBirth: { gt: bound(16, -DAY_MS) } },
        ],
      },
      select: { id: true, dateOfBirth: true, isMinor: true, isUnder16: true },
    });

    const reclassifiedUserIds: string[] = [];

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
        if (changed) reclassifiedUserIds.push(user.id);
      } catch (err) {
        // One bad row must not strand the rest; it is retried next run.
        this.logger.error(
          `Age reclassification sweep: failed for user ${user.id}: ${(err as Error).message}`,
        );
      }
    }

    return { scanned: candidates.length, reclassifiedUserIds };
  }
}
