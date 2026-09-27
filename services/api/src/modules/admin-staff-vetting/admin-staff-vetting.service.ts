import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import { SetChildSafetyVettingDto } from './dto/set-child-safety-vetting.dto';

// GET-free, PATCH-only response shape for this route — an explicit
// allowlist, never a spread of the raw Prisma AdminUser row (never leak
// passwordHash), same discipline admin-response.mapper.ts's toAdminSummary
// and admin-users.service.ts's USER_LIST_SELECT already apply for their
// own resources. Includes the three vetting fields this endpoint exists
// to write — deliberately NOT folded into admin-response.mapper.ts's
// shared AdminSummary shape, which backs GET/PATCH /admin/profile (a
// different resource — "my own profile" vs. "another admin's vetting
// record") and has no reason to grow vetting-specific fields for every
// caller of it.
const ADMIN_STAFF_VETTING_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  childSafetyVetted: true,
  vettedAt: true,
  vettedByAdminId: true,
} as const;

export interface AdminStaffVettingSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  childSafetyVetted: boolean;
  vettedAt: Date | null;
  vettedByAdminId: string | null;
}

// PATCH /admin/users/:id/child-safety-vetting — the application half of
// AdminUser.childSafetyVetted (see that field's own schema comment: "a
// real safeguarding gap this schema previously had no way to represent
// at all... no application code reads or writes any of these three
// fields yet"). This is that application code.
//
// Deliberately its own top-level module, not folded into AdminModule
// (which stays scoped to Admin Console account/auth/profile — a
// self-service concern, per Decision Log #54/admin/README.md) or into
// AdminUsersModule (which manages platform User accounts, a completely
// different resource that happens to share the `/admin/users` URL
// prefix — see this module's own README for the disclosed naming
// overlap). This service only ever reads/writes AdminUser.
@Injectable()
export class AdminStaffVettingService {
  constructor(
    private readonly prisma: PrismaService,
    // feat/admin-action-log — see AdminActionLogService's own header
    // comment. Called after the write below, with the CALLING superadmin
    // as adminId and the TARGET admin as targetId (the same
    // caller-vs-target distinction setChildSafetyVetting's own vettedAt/
    // vettedByAdminId already draw).
    private readonly adminActionLogService: AdminActionLogService,
  ) {}

  // -------------------------------------------------------------------
  // Sets or unsets childSafetyVetted on the TARGET admin (:id — the
  // subject of the vetting decision, NOT the caller, who is a superadmin
  // acting on someone else's — or, since no self-vetting restriction is
  // imposed here, potentially their own — record).
  //
  // vettedAt/vettedByAdminId are written together with childSafetyVetted,
  // not independently settable:
  //   - dto.childSafetyVetted === true  -> vettedAt = now(),
  //     vettedByAdminId = the CALLING superadmin's id (a fresh record of
  //     who most recently confirmed this and when).
  //   - dto.childSafetyVetted === false -> vettedAt = null,
  //     vettedByAdminId = null (a disclosed judgment call: unsetting
  //     clears the record rather than preserving who last vetted the
  //     admin before it was revoked — this schema has no separate
  //     "un-vetted by / un-vetted at" pair to record that action
  //     against, and Report's own reviewedByAdminId/appealReviewedByAdminId
  //     fields establish the precedent that this model only tracks the
  //     MOST RECENT state of an admin-recorded decision, not a full
  //     history of it).
  // -------------------------------------------------------------------
  async setChildSafetyVetting(
    targetAdminId: string,
    callerAdminId: string,
    dto: SetChildSafetyVettingDto,
  ): Promise<AdminStaffVettingSummary> {
    await this.assertAdminExists(targetAdminId);

    const updated = await this.prisma.adminUser.update({
      where: { id: targetAdminId },
      data: {
        childSafetyVetted: dto.childSafetyVetted,
        vettedAt: dto.childSafetyVetted ? new Date() : null,
        vettedByAdminId: dto.childSafetyVetted ? callerAdminId : null,
      },
      select: ADMIN_STAFF_VETTING_SELECT,
    });

    await this.adminActionLogService.record(
      callerAdminId,
      ADMIN_ACTION_LOG_ACTIONS.ADMIN_CHILD_SAFETY_VETTING_UPDATED,
      ADMIN_ACTION_LOG_TARGET_TYPES.ADMIN_USER,
      targetAdminId,
      `childSafetyVetted=${dto.childSafetyVetted}`,
    );

    return updated;
  }

  private async assertAdminExists(id: string): Promise<void> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id }, select: { id: true } });
    if (!admin) {
      throw new NotFoundException('Admin account not found');
    }
  }
}
