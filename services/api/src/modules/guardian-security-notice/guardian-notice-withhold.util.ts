import { PrismaService } from '../../prisma/prisma.service';

// backend/b280-withhold-guardian-notices (B-280; Decision Log #458). "Is guardian-notice withholding switched ON for
// this account?" -- a fresh Postgres read, never cached. Used by:
//   - GuardianSecurityNoticeService.decide()  (every B-275 / B-279 guardian notice; it reads the row inside its own
//     user query rather than calling this, to stay one round trip)
//   - TwoFactorRecoveryService               (guardian-assisted two-factor recovery)
// and by nothing user-facing. The existence of the row is the flag; the reason is never read here.
export async function isGuardianNoticeWithheld(
  prisma: Pick<PrismaService, 'guardianNoticeWithhold'>,
  userId: string,
): Promise<boolean> {
  const row = await prisma.guardianNoticeWithhold.findUnique({ where: { userId }, select: { id: true } });
  return row !== null;
}
