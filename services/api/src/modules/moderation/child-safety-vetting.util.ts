import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from './moderation.constants';

// The ONE rule for "is this admin child-safety vetted", shared by ModerationService (reports that concern a
// minor, escalation) and the media review queue (a minor's pictures and videos; backend/media-privacy-
// vetting-followups, B-258, Decision Log #430 item 3).
//
// Read FRESH from Postgres on every call, never from the token (`AdminAccessTokenPayload` carries only
// { sub, role, aud }): the same Section 5.7 "no safety-sensitive state trusted from a cached value"
// discipline GuardianConsentGuard applies on the User side. It applies REGARDLESS of role: an unvetted
// superadmin is blocked exactly like an unvetted moderator (vetting is a separate axis from role).

export async function isAdminChildSafetyVetted(prisma: Pick<PrismaService, 'adminUser'>, adminId: string): Promise<boolean> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { childSafetyVetted: true },
  });
  return admin?.childSafetyVetted ?? false;
}

// The coded 403 every vetting gate gives (same body as ModerationService / ModerationHoldsService). Added for the
// Contact Us enquiry escalation (B-046 part B); the two existing private copies are left as they are.
export async function assertAdminChildSafetyVetted(prisma: Pick<PrismaService, 'adminUser'>, adminId: string): Promise<void> {
  if (await isAdminChildSafetyVetted(prisma, adminId)) return;
  throw new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: CHILD_SAFETY_VETTING_REQUIRED_CODE,
    message: 'This action requires a child-safety-vetted admin.',
  });
}
