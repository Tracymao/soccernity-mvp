import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionSweepService } from '../account-deletion/account-deletion-sweep.service';
import { TokenService } from '../auth/token/token.service';
import { ADMIN_USERS_DEFAULT_PAGE_SIZE, ADMIN_USERS_MAX_PAGE_SIZE } from './admin-users.constants';
import { decodeAdminUsersCursor, encodeAdminUsersCursor } from './cursor.util';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

// GET /admin/users response shape — lean, list-appropriate columns only
// (Section 5.5's low-bandwidth discipline, the same reasoning
// ARTICLE_LIST_SELECT/CLUB_SELECT/GROUP_SELECT already follow).
// `displayName`, not a `username` — User has no username column
// (Decision Log #58); UsersPage.tsx's own "Username" column header is
// bound to displayName instead (flagged in that PR's own comment, not
// silently mismatched).
const USER_LIST_SELECT = {
  id: true,
  displayName: true,
  email: true,
  accountStatus: true,
  createdAt: true,
} as const;

export type UserListItem = Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>;

export interface UserListPage {
  items: UserListItem[];
  nextCursor: string | null;
}

export type UpdateUserStatusResult = { deleted: true; id: string } | { deleted: false; user: UserListItem };

// Build Plan Section 4.8 (Admin Service) — platform-user management. See
// README.md for the full endpoint table, the role-gating reasoning
// (mirrors ModerationModule's own moderator/superadmin split, not
// AdminContentModule's editor/superadmin one — this is moderation-
// adjacent, not an editor's job), and every Decision Log candidate this
// module surfaces (the GET/PATCH routes beyond Section 4.8's literal
// GET-only line is untrue — see below; the `suspended` schema addition;
// skipping the self-service 30-day delete grace period).
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Session revocation on suspend/delete reuses the SAME mechanism
    // AuthService.deactivateAccount/deleteAccount already use for the
    // identical "state changed, kill existing sessions" reasoning — this
    // module never re-implements refresh-token revocation.
    private readonly tokenService: TokenService,
    // Reused directly, per this PR's brief — see updateUserStatus's own
    // comment on the `deleted` branch for the full reasoning on why this
    // is the right reuse (not a parallel deletion implementation).
    private readonly accountDeletionSweepService: AccountDeletionSweepService,
  ) {}

  private async assertUserExists(id: string): Promise<{ id: string; isMinor: boolean; accountStatus: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isMinor: true, accountStatus: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // -------------------------------------------------------------------
  // GET /admin/users (AdminRolesGuard('moderator', 'superadmin') — see
  // README.md's "who may view" reasoning for why this mirrors
  // ModerationModule's own role split rather than AdminContentModule's).
  // Keyset-paginated, newest-first, one optional exact-match `status`
  // filter (any of the four real accountStatus values).
  // -------------------------------------------------------------------
  async listUsers(query: ListUsersQueryDto): Promise<UserListPage> {
    const limit = Math.min(query.limit ?? ADMIN_USERS_DEFAULT_PAGE_SIZE, ADMIN_USERS_MAX_PAGE_SIZE);

    const conditions: Prisma.UserWhereInput[] = [];
    if (query.status) {
      conditions.push({ accountStatus: query.status });
    }
    if (query.cursor) {
      const cursor = decodeAdminUsersCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.UserWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeAdminUsersCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // -------------------------------------------------------------------
  // PATCH /admin/users/:id (AdminRolesGuard('moderator', 'superadmin')).
  // Three possible actions — see UpdateUserStatusDto/admin-users.constants.ts.
  // No per-status-machine restriction beyond the two real write values:
  // an admin may move ANY user into `active` or `suspended` from
  // whatever their current accountStatus is (including `deactivated` or
  // `pending_deletion`) — this is a moderation action, not constrained by
  // the self-service state machine those two states belong to. A
  // deliberate, disclosed choice: e.g. an admin can undo an accidental
  // self-deletion request within the grace window by setting `active`,
  // which also clears pendingDeletionAt so AccountDeletionSweepService's
  // own query (accountStatus = 'pending_deletion') can never pick the
  // row up again.
  // -------------------------------------------------------------------
  async updateUserStatus(userId: string, adminId: string, dto: UpdateUserStatusDto): Promise<UpdateUserStatusResult> {
    const user = await this.assertUserExists(userId);

    if (dto.status === 'deleted') {
      // Immediate, admin-triggered hard delete — deliberately skipping
      // the self-service 30-day grace period (Decision Log #42) entirely,
      // per this PR's own Decision Log candidate: this is a moderation
      // action, not a self-service request, and there is no reason a
      // platform-safety deletion should sit in a reversible
      // "pending_deletion" limbo waiting for tomorrow's 3am sweep.
      // Reuses AccountDeletionSweepService.hardDeleteUser directly (made
      // public by this PR specifically for this second caller) rather
      // than re-implementing the Guardian/ConsentAuditRecord snapshot +
      // cascade-delete sequence a second time — one real deletion
      // primitive, two entry points (the scheduled sweep, and this).
      // Sessions are revoked first (same reasoning as every other
      // accountStatus-changing action in this codebase): the User row is
      // about to be gone, but a still-live, not-yet-expired access token
      // should stop working immediately, not linger until it naturally
      // expires.
      await this.tokenService.revokeAllSessionsForUser(userId);
      await this.accountDeletionSweepService.hardDeleteUser(userId, user.isMinor);
      this.logger.log(`Admin ${adminId} hard-deleted user ${userId} (immediate, grace period skipped).`);
      return { deleted: true, id: userId };
    }

    const data: Prisma.UserUpdateInput = { accountStatus: dto.status };
    // Clear a stale pendingDeletionAt whenever a user is moved OUT of
    // pending_deletion by this route (see this method's own header
    // comment) — harmless either way for AccountDeletionSweepService's
    // own query (which also checks accountStatus), but leaving a stale
    // timestamp around is needless data hygiene debt.
    if (user.accountStatus === 'pending_deletion') {
      data.pendingDeletionAt = null;
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data, select: USER_LIST_SELECT });

    if (dto.status === 'suspended') {
      // Blocking future logins is meaningless if the caller's current
      // still-valid tokens keep working — the exact reasoning
      // AuthService.deactivateAccount already documents for itself.
      await this.tokenService.revokeAllSessionsForUser(userId);
    }

    this.logger.log(`Admin ${adminId} set user ${userId}'s accountStatus to '${dto.status}'.`);
    return { deleted: false, user: updated };
  }
}
