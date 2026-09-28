import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password/password.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import {
  ADMIN_STAFF_ROLES_DEFAULT_PAGE_SIZE,
  ADMIN_STAFF_ROLES_MAX_PAGE_SIZE,
} from './admin-staff-roles.constants';
import { decodeAdminStaffRolesCursor, encodeAdminStaffRolesCursor } from './cursor.util';
import { CreateAdminStaffDto } from './dto/create-admin-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

// GET /admin/staff and PATCH /admin/staff/:id/role response shape — an
// explicit allowlist, never a spread of the raw Prisma AdminUser row:
// never leak passwordHash. Same discipline admin-response.mapper.ts's
// toAdminSummary, admin-users.service.ts's USER_LIST_SELECT, and
// admin-staff-vetting.service.ts's ADMIN_STAFF_VETTING_SELECT already
// apply for their own resources. accountStatus/createdAt included for
// the roster view even though this module never writes either —
// SettingsRolesPage.tsx's own sample table shows Name + Role, and a
// future real conversion of that screen will want to know whether a
// listed admin is still an active account.
//
// `childSafetyVetted`/`vettedAt`/`vettedByAdminId` were added here as a
// small, deliberate extension of this SAME select (no new route, no
// schema change — the three columns already existed) when
// SettingsRolesPage.tsx/RoleFormPages.tsx's EditRolePage were converted
// to real data: the vetting record has no GET of its own anywhere
// (AdminStaffVettingModule is PATCH-only, by design — see that module's
// README), so without also surfacing it here the Edit view would have no
// way to render a real "vetted / not vetted" toggle for another admin —
// only a write-and-hope one. This does NOT touch
// `PATCH /admin/users/:id/child-safety-vetting` (PR 3) at all; that
// endpoint's own response already carries all three fields, and writing
// through it here keeps the roster in sync for free (`updateAdminRole`'s
// own Prisma `update` reads back the same, now-wider, select).
const ADMIN_STAFF_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  accountStatus: true,
  createdAt: true,
  childSafetyVetted: true,
  vettedAt: true,
  vettedByAdminId: true,
} as const;

export type AdminStaffListItem = Prisma.AdminUserGetPayload<{ select: typeof ADMIN_STAFF_SELECT }>;

export interface AdminStaffListPage {
  items: AdminStaffListItem[];
  nextCursor: string | null;
}

// Build Plan Section 4.8 (Admin Service) — the AdminUser role-management
// slice apps/admin's Settings/Roles screens were built as a disclosed
// stub for (Decision Log #191/#250/#302: "there is no admin
// role-management endpoint"). This module is that endpoint.
//
// GET /admin/staff and PATCH /admin/staff/:id/role are both
// AdminRolesGuard('superadmin') ONLY — a deliberate divergence from
// every other Section 4.8 module's own moderator+superadmin GET split
// (ModerationModule/AdminUsersModule/AdminContentModule all admit a
// second role for reads). Deciding who else is trusted to see the full
// admin/moderator/superadmin roster and its exact role assignments is,
// like child-safety vetting (AdminStaffVettingModule's own reasoning),
// a step above ordinary moderation access — an editor or moderator has
// no task anywhere in this codebase that depends on seeing this list,
// unlike GET /admin/users (platform Users), which a moderator genuinely
// needs to do their own job. See README.md for the full reasoning.
@Injectable()
export class AdminStaffRolesService {
  private readonly logger = new Logger(AdminStaffRolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    // feat/admin-action-log — see AdminActionLogService's own header
    // comment. Called after each successful role write, with the CALLING
    // superadmin as adminId and the TARGET admin as targetId — the same
    // caller-vs-target distinction AdminStaffVettingService's own
    // vettedAt/vettedByAdminId already draw.
    private readonly adminActionLogService: AdminActionLogService,
    // Same argon2id wrapper AdminAuthService uses for login and
    // change-password (exported by AdminAuthFoundationModule).
    private readonly passwordService: PasswordService,
  ) {}

  // -------------------------------------------------------------------
  // POST /admin/staff (Decision Log #191). Provisions a new AdminUser.
  //
  // PASSWORD CONVENTION: none existed for admin-created accounts �
  // PasswordResetService is User-only (User table, User token store), and
  // nothing else in the codebase creates an AdminUser. So this follows
  // the simplest safe shape: a temporary password (admin-supplied, or
  // generated and returned ONCE here) that the new admin is expected to
  // replace via the existing POST /admin/auth/change-password. There is
  // no "must change on first login" flag � AdminUser has no such column
  // and adding one is a schema change beyond this task; flagged in the
  // README. The generated password is never logged or written to the
  // action log.
  //
  // Email is trimmed + lower-cased, matching AdminAuthService.login(),
  // which lower-cases the lookup. A duplicate is a clean 409 (pre-check
  // plus a P2002 backstop for the race).
  // -------------------------------------------------------------------
  async createStaff(
    callerAdminId: string,
    dto: CreateAdminStaffDto,
  ): Promise<AdminStaffListItem & { temporaryPassword?: string }> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('An admin account with this email already exists.');
    }

    const generated = dto.temporaryPassword === undefined;
    const password = dto.temporaryPassword ?? randomBytes(12).toString('base64url');
    const passwordHash = await this.passwordService.hash(password);

    let created: AdminStaffListItem;
    try {
      created = await this.prisma.adminUser.create({
        data: { email, fullName: dto.fullName.trim(), role: dto.role, passwordHash },
        select: ADMIN_STAFF_SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An admin account with this email already exists.');
      }
      throw err;
    }

    this.logger.log(`Admin ${callerAdminId} created admin ${created.id} with role '${dto.role}'.`);
    await this.adminActionLogService.record(
      callerAdminId,
      ADMIN_ACTION_LOG_ACTIONS.ADMIN_USER_CREATED,
      ADMIN_ACTION_LOG_TARGET_TYPES.ADMIN_USER,
      created.id,
      `role=${dto.role}`,
    );

    return generated ? { ...created, temporaryPassword: password } : created;
  }

  // -------------------------------------------------------------------
  // GET /admin/staff. Keyset-paginated, newest-first, one optional
  // exact-match `role` filter (Section 5.5 discipline — same shape as
  // AdminUsersService.listUsers' own `status` filter).
  // -------------------------------------------------------------------
  async listStaff(query: ListStaffQueryDto): Promise<AdminStaffListPage> {
    const limit = Math.min(query.limit ?? ADMIN_STAFF_ROLES_DEFAULT_PAGE_SIZE, ADMIN_STAFF_ROLES_MAX_PAGE_SIZE);

    const conditions: Prisma.AdminUserWhereInput[] = [];
    if (query.role) {
      conditions.push({ role: query.role });
    }
    if (query.cursor) {
      const cursor = decodeAdminStaffRolesCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.AdminUserWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.adminUser.findMany({
      where,
      select: ADMIN_STAFF_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeAdminStaffRolesCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // -------------------------------------------------------------------
  // PATCH /admin/staff/:id/role. Writes ONLY AdminUser.role — see
  // UpdateAdminRoleDto's own comment for why every other AdminUser field
  // is out of scope here. No self-role-change restriction is imposed
  // (mirrors AdminStaffVettingService.setChildSafetyVetting's own
  // "nothing in the task brief asked for this to be blocked" precedent):
  // a superadmin may change their own role, including demoting
  // themselves — with one guard below.
  //
  // THE ONE SAFETY GUARD THIS ENDPOINT ADDS BEYOND THE LITERAL TASK ASK,
  // disclosed rather than silently built in: demoting the LAST remaining
  // active superadmin is rejected with a 409. There is no self-service
  // admin/moderator registration endpoint (Decision Log #191) and no
  // "promote to superadmin" recovery path other than this same PATCH —
  // so if every active superadmin ever demoted themselves (or each
  // other), no one could ever call this endpoint again, and recovering
  // would require the same direct-DB-insert Decision Log #191 already
  // requires for account creation. A single COUNT query, checked only
  // when the TARGET's *current* role is superadmin and the *new* role
  // is not, prevents that one irreversible mistake. Deactivated
  // superadmin accounts do not count toward "remaining" (they cannot
  // log in, so cannot exercise this endpoint anyway).
  // -------------------------------------------------------------------
  async updateAdminRole(
    targetAdminId: string,
    callerAdminId: string,
    dto: UpdateAdminRoleDto,
  ): Promise<AdminStaffListItem> {
    const target = await this.assertAdminExists(targetAdminId);

    if (target.role === 'superadmin' && dto.role !== 'superadmin') {
      const remainingActiveSuperadmins = await this.prisma.adminUser.count({
        where: { role: 'superadmin', accountStatus: 'active', id: { not: targetAdminId } },
      });
      if (remainingActiveSuperadmins === 0) {
        throw new ConflictException(
          'Cannot change this role: it belongs to the last active superadmin account.',
        );
      }
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: targetAdminId },
      data: { role: dto.role },
      select: ADMIN_STAFF_SELECT,
    });

    this.logger.log(`Admin ${callerAdminId} set admin ${targetAdminId}'s role to '${dto.role}'.`);
    await this.adminActionLogService.record(
      callerAdminId,
      ADMIN_ACTION_LOG_ACTIONS.ADMIN_ROLE_CHANGED,
      ADMIN_ACTION_LOG_TARGET_TYPES.ADMIN_USER,
      targetAdminId,
      `role=${dto.role}`,
    );

    return updated;
  }

  private async assertAdminExists(id: string): Promise<{ id: string; role: string }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!admin) {
      throw new NotFoundException('Admin account not found');
    }
    return admin;
  }
}
