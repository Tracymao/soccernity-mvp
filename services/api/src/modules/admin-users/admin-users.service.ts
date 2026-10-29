import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionSweepService, resolveHeldInvestigationAlertDays } from '../account-deletion/account-deletion-sweep.service';
import { findActiveAccountHold } from '../account-hold/account-hold.rules';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import { TokenService } from '../auth/token/token.service';
import { revokeEngagementPointsForAccount } from '../points/engagement-points.util';
import { ACCOUNT_HOLD_ACTIVE_CODE, ADMIN_USERS_DEFAULT_PAGE_SIZE, ADMIN_USERS_MAX_PAGE_SIZE } from './admin-users.constants';
import { decodeAdminUsersCursor, encodeAdminUsersCursor } from './cursor.util';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

// GET /admin/users response shape — lean, list-appropriate columns only
// (Section 5.5's low-bandwidth discipline, the same reasoning
// ARTICLE_LIST_SELECT/CLUB_SELECT/GROUP_SELECT already follow).
// Admins see BOTH the real displayName and the optional username (added by
// profile/username-column-and-display-convention) -- the admin console is not
// an "other user" surface, so no publicName resolution here.
const USER_LIST_SELECT = {
  id: true,
  displayName: true,
  username: true,
  email: true,
  accountStatus: true,
  createdAt: true,
} as const;

// B-029: how many open incorrect-details reports one read returns before
// reporting truncation. Open reports are rare; this is a safety cap.
const INCORRECT_DETAILS_LIST_CAP = 200;

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
    // feat/admin-action-log — see AdminActionLogService's own header
    // comment. Called after each successful accountStatus write below.
    private readonly adminActionLogService: AdminActionLogService,
  ) {}

  // GET /admin/users/held-investigations -- accounts whose deletion has
  // been held by an open moderation Report for more than `olderThanDays`
  // (default 90, tunable). Visibility only; no auto-action.
  async listStalledHolds(olderThanDays?: number) {
    const items = await this.accountDeletionSweepService.listStalledHolds(olderThanDays);
    return { thresholdDays: olderThanDays ?? resolveHeldInvestigationAlertDays(), items };
  }

  // -------------------------------------------------------------------
  // B-029 (Decision Log #372): the support side of a guardian's "report
  // incorrect details" flag. The flag itself is written by
  // GuardianConsentService.reportIncorrectDetails (token-credentialed); this
  // is how support SEES the open ones and CLEARS one.
  //
  // The list is deliberately small in what it returns: who, who to contact,
  // when. No date of birth (the guardian is saying it is WRONG, and B-109 is
  // the audited place support reads it), no consent token. Open reports are
  // rare by nature, so it is one capped read, not a paginated feed; the
  // `truncated` flag says so honestly if the cap is ever hit.
  // -------------------------------------------------------------------
  async listIncorrectDetailsReports() {
    const rows = await this.prisma.guardian.findMany({
      where: { incorrectDetailsReportedAt: { not: null } },
      orderBy: [{ incorrectDetailsReportedAt: 'asc' }, { id: 'asc' }],
      take: INCORRECT_DETAILS_LIST_CAP + 1,
      select: {
        minorUserId: true,
        name: true,
        email: true,
        consentStatus: true,
        incorrectDetailsReportedAt: true,
        minorUser: { select: { displayName: true, accountStatus: true } },
      },
    });
    const truncated = rows.length > INCORRECT_DETAILS_LIST_CAP;
    const items = (truncated ? rows.slice(0, INCORRECT_DETAILS_LIST_CAP) : rows).map((r) => ({
      userId: r.minorUserId,
      minorDisplayName: r.minorUser.displayName,
      minorAccountStatus: r.minorUser.accountStatus,
      guardianName: r.name,
      guardianEmail: r.email,
      consentStatus: r.consentStatus,
      reportedAt: r.incorrectDetailsReportedAt as Date,
    }));
    return { items, truncated };
  }

  async resolveIncorrectDetailsReport(userId: string, adminId: string): Promise<{ resolved: true }> {
    // updateMany keyed on the flag being open, so a double-click or two
    // admins racing resolves it once and the loser gets the same 404 as
    // "nothing to resolve" -- and the audit log gets exactly one row.
    const cleared = await this.prisma.guardian.updateMany({
      where: { minorUserId: userId, incorrectDetailsReportedAt: { not: null } },
      data: { incorrectDetailsReportedAt: null },
    });
    if (cleared.count === 0) {
      throw new NotFoundException('No open incorrect-details report for this user');
    }
    this.logger.log(`Admin ${adminId} resolved the incorrect-details report for user ${userId}.`);
    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.GUARDIAN_INCORRECT_DETAILS_RESOLVED,
      ADMIN_ACTION_LOG_TARGET_TYPES.USER,
      userId,
    );
    return { resolved: true };
  }

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

    // 'deleted' is terminal: the row has been anonymized (Decision Log
    // #341) and its password hash can never authenticate. Letting an
    // admin flip it to active/suspended would resurrect a blank shell.
    if (user.accountStatus === 'deleted') {
      throw new ConflictException('This user has already been deleted and anonymized.');
    }

    if (dto.status === 'deleted') {
      // B-044 (Decision Log #376; veto-able default): an ACTIVE legal hold or bad-faith hold protects the
      // account from this too -- lift the hold first. Report-based holds are still skipped by this route
      // (explicit admin choice, as before). Checked before anything is revoked or changed.
      const adminHold = await findActiveAccountHold(this.prisma, userId, new Date());
      if (adminHold) {
        throw new ConflictException({
          statusCode: 409,
          code: ACCOUNT_HOLD_ACTIVE_CODE,
          holdType: adminHold.type,
          message: `This account is under an active ${adminHold.type === 'legal_hold' ? 'legal hold' : 'bad-faith hold'} and cannot be deleted until the hold is lifted.`,
        });
      }

      // Immediate, admin-triggered anonymization -- deliberately skipping
      // the self-service 30-day grace period (Decision Log #42) and a
      // report-based hold (the admin has explicitly chosen this): a
      // moderation action, not a self-service request. Since Decision
      // Log #341 this is an in-place anonymization, NOT a row DELETE --
      // reuses AccountDeletionSweepService.anonymizeUser, the same
      // primitive the scheduled sweep uses. Sessions are revoked first so
      // a still-live access token stops working immediately.
      await this.tokenService.revokeAllSessionsForUser(userId);
      await this.accountDeletionSweepService.anonymizeUser(userId, user.isMinor);
      this.logger.log(`Admin ${adminId} anonymized user ${userId} (immediate, grace period skipped).`);
      await this.adminActionLogService.record(
        adminId,
        ADMIN_ACTION_LOG_ACTIONS.USER_STATUS_UPDATED,
        ADMIN_ACTION_LOG_TARGET_TYPES.USER,
        userId,
        `status=${dto.status}`,
      );
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
      // backend/w12-points (B-093, spec 9b): a suspended account is restricted, so its baseline points are
      // revoked (what it earned, and what it earned others by engaging with them). Not undone if the
      // suspension is lifted: engagement simply earns again from then on.
      await revokeEngagementPointsForAccount(this.prisma, userId, new Date());
    }

    this.logger.log(`Admin ${adminId} set user ${userId}'s accountStatus to '${dto.status}'.`);
    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.USER_STATUS_UPDATED,
      ADMIN_ACTION_LOG_TARGET_TYPES.USER,
      userId,
      `status=${dto.status}`,
    );
    return { deleted: false, user: updated };
  }
}
