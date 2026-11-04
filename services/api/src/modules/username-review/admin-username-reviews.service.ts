import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import { isAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';
import { decodeUsernameReviewCursor, encodeUsernameReviewCursor } from './cursor.util';
import { DecideUsernameReviewDto } from './dto/decide-username-review.dto';
import { ListUsernameReviewsQueryDto } from './dto/list-username-reviews-query.dto';
import { REVOKER_ID_SQL } from './revoker.sql';
import {
  USERNAME_REVIEW_DEFAULT_PAGE_SIZE,
  USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE,
  USERNAME_REVIEW_MAX_PAGE_SIZE,
  USERNAME_REVIEW_NOT_FOUND_CODE,
  USERNAME_REVIEW_NOT_PENDING_CODE,
  USERNAME_REVIEW_NOTIFICATION_TYPE,
  USERNAME_REVIEW_OWN_REVOCATION_CODE,
  USERNAME_REVIEW_REASON_INVALID_CODE,
  USERNAME_REVIEW_REASON_MAX_LENGTH,
  USERNAME_REVIEW_REASON_MIN_LENGTH,
  USERNAME_REVIEW_USER_HAS_USERNAME_CODE,
  USERNAME_REVIEW_USER_UNAVAILABLE_CODE,
  UsernameReviewOutcome,
} from './username-review.constants';

export interface UsernameReviewListItem {
  id: string;
  status: string;
  createdAt: Date;
  // The user's optional message (free text, at most 500 characters).
  message: string | null;
  // The handle that was removed.
  removedUsername: string;
  revokedAt: Date;
  userId: string;
  // The user's display name. NEVER their date of birth, email, phone or any other contact detail.
  userDisplayName: string;
  // The admin who revoked, by name; null when that cannot be determined (very old rows with no audit entry).
  revokedBy: { displayName: string } | null;
}

export interface UsernameReviewPage {
  items: UsernameReviewListItem[];
  nextCursor: string | null;
}

export interface UsernameReviewDecisionResult {
  id: string;
  status: UsernameReviewOutcome;
  decidedAt: Date;
}

interface ListRow {
  id: string;
  status: string;
  createdAt: Date;
  message: string | null;
  removedUsername: string;
  revokedAt: Date;
  userId: string;
  userDisplayName: string;
  revokedByName: string | null;
}

interface DecideRow {
  id: string;
  status: string;
  userId: string;
  revokedUsernameId: string;
  handle: string;
  revokerId: string | null;
  isMinor: boolean;
  accountStatus: string;
}

// backend/b139-username-review (B-139 part (c); Decision Log #467, founder decision 2026-11-03): the ADMIN side of
// the revoked-username review route -- the "Username reviews" list and the decide action.
//
// WHO MAY SEE / DECIDE (the controller already limits the route to moderator and superadmin; editors get a 403):
//   - The admin who REVOKED the username does not see its request in the list and gets a coded 403 if they try to
//     decide it ("a DIFFERENT admin decides", the second-admin principle of #138). Revoker identity:
//     revoker.sql.ts (the revokedByAdminId column, else the audit-log row).
//   - A request from a MINOR's account is absent from the list for an admin who is not child-safety vetted, and a
//     decide on it is the same coded 404 as a missing id (the Contest, media-review and audit-log rule, using
//     isAdminChildSafetyVetted, a fresh read, whatever the role).
//   If the revoker is the only eligible admin the request simply waits; no alert or fallback is decided.
//
// WHAT A DECISION DOES (ONE transaction):
//   reinstate: the user's username comes back (only if they still have none and nobody else holds the handle), the
//              RevokedUsername record is deleted (its request goes with it by cascade; the permanent bar and the
//              hold end), and the audit row records it.
//   decline:   the record and its permanent bar stay; the request becomes 'declined'. FINAL: no second review (a
//              declined request makes the unique index on revokedUsernameId block another one).
//   Both write ONE AdminActionLog row ('user.username_review_decided'; notes = decision, handle, REASON) in the same
//   transaction, so a decision can never exist without its audit entry.
// AFTER the commit, best effort (a failure never undoes the decision): an in-app Notification to the user and, for a
// MINOR, a kind-of-action guardian notice (never the reason; the withhold rule is applied inside the service).
// NO email. The REASON is internal: it is never sent to the user or the guardian.
//
// usernameChangedAt: the revoke cleared it. Reinstating leaves it NULL, so a reinstatement neither grants nor burns
// a username change: the account has a username again with no cooldown running, exactly as after any first pick.
@Injectable()
export class AdminUsernameReviewsService {
  private readonly logger = new Logger(AdminUsernameReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guardianNotices: GuardianSecurityNoticeService,
  ) {}

  async list(query: ListUsernameReviewsQueryDto, admin: { sub: string }): Promise<UsernameReviewPage> {
    const limit = Math.min(query.limit ?? USERNAME_REVIEW_DEFAULT_PAGE_SIZE, USERNAME_REVIEW_MAX_PAGE_SIZE);
    const vetted = await isAdminChildSafetyVetted(this.prisma, admin.sub);

    const conditions: Prisma.Sql[] = [
      // An anonymised account has nothing left to reinstate (its requests are deleted at anonymisation).
      Prisma.sql`u."accountStatus" <> 'deleted'`,
      // The revoker does not see their own revocation's request. IS DISTINCT FROM: an unknown revoker (NULL) is
      // visible to everyone.
      Prisma.sql`rev."id" IS DISTINCT FROM ${admin.sub}`,
    ];
    if (query.status) conditions.push(Prisma.sql`r."status" = ${query.status}`);
    // A minor's request is for child-safety-vetted admins only; it is not hidden by a placeholder, it is absent.
    if (!vetted) conditions.push(Prisma.sql`u."isMinor" = false`);
    if (query.cursor) {
      const c = decodeUsernameReviewCursor(query.cursor);
      conditions.push(Prisma.sql`(r."createdAt", r."id") < (${c.createdAt}, ${c.id})`);
    }

    const rows = await this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
      SELECT r."id", r."status", r."createdAt", r."message",
             rv."username" AS "removedUsername", rv."revokedAt",
             r."userId", u."displayName" AS "userDisplayName",
             ra."fullName" AS "revokedByName"
      FROM "UsernameReviewRequest" r
      JOIN "RevokedUsername" rv ON rv."id" = r."revokedUsernameId"
      JOIN "User" u ON u."id" = r."userId"
      CROSS JOIN LATERAL (SELECT ${REVOKER_ID_SQL} AS "id") rev
      LEFT JOIN "AdminUser" ra ON ra."id" = rev."id"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY r."createdAt" DESC, r."id" DESC
      LIMIT ${limit + 1}`);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        message: r.message,
        removedUsername: r.removedUsername,
        revokedAt: r.revokedAt,
        userId: r.userId,
        userDisplayName: r.userDisplayName,
        revokedBy: r.revokedByName === null ? null : { displayName: r.revokedByName },
      })),
      nextCursor: hasMore && last ? encodeUsernameReviewCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async decide(id: string, dto: DecideUsernameReviewDto, admin: { sub: string }): Promise<UsernameReviewDecisionResult> {
    const reason = this.cleanReason(dto.reason);
    const outcome: UsernameReviewOutcome = dto.decision === 'reinstate' ? 'reinstated' : 'declined';

    const vetted = await isAdminChildSafetyVetted(this.prisma, admin.sub);
    const row = await this.loadForDecision(id);
    // Missing, or a minor's request that this admin may not see: the SAME 404, so neither can be told apart.
    if (!row || (row.isMinor && !vetted)) throw this.notFound();
    if (row.revokerId !== null && row.revokerId === admin.sub) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: USERNAME_REVIEW_OWN_REVOCATION_CODE,
        message: 'A different admin must decide a review of a username you removed.',
      });
    }
    if (row.status !== 'pending') throw this.notPending();
    if (row.accountStatus === 'deleted') {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: USERNAME_REVIEW_USER_UNAVAILABLE_CODE,
        message: 'This account has been deleted; there is nothing to reinstate.',
      });
    }

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        // Race-safe claim: the status test is in the WHERE of the write, so two admins deciding at once leave one
        // winner and the other a 409. A throw anywhere below rolls this back too.
        const claimed = await tx.usernameReviewRequest.updateMany({
          where: { id, status: 'pending' },
          data: { status: outcome, decidedAt: now, decidedByAdminId: admin.sub },
        });
        if (claimed.count === 0) throw this.notPending();

        if (outcome === 'reinstated') {
          // Another user's running hold on this handle (their own record, after they took it and were revoked).
          const heldByAnother = await tx.revokedUsername.findFirst({
            where: { username: row.handle, userId: { not: row.userId }, holdUntil: { gt: now } },
            select: { id: true },
          });
          if (heldByAnother) throw this.handleUnavailable();

          // Only if the user still has NO username (the write itself tests it; a username chosen since is a 409).
          // usernameChangedAt is deliberately not touched (see the class comment). A taken handle is a P2002,
          // mapped to a 409 below, which rolls the whole transaction back.
          const restored = await tx.user.updateMany({
            where: { id: row.userId, username: null, accountStatus: { not: 'deleted' } },
            data: { username: row.handle },
          });
          if (restored.count === 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              code: USERNAME_REVIEW_USER_HAS_USERNAME_CODE,
              message: 'This user has chosen a new username since, so the old one cannot be restored.',
            });
          }
        }

        // The audit row first, then (for a reinstatement) the record: deleting the record cascades the request away.
        await tx.adminActionLog.create({
          data: {
            adminId: admin.sub,
            action: ADMIN_ACTION_LOG_ACTIONS.USER_USERNAME_REVIEW_DECIDED,
            targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
            targetId: row.userId,
            notes: `decision=${dto.decision}; username=${row.handle}; reason=${reason}`,
          },
        });

        if (outcome === 'reinstated') {
          await tx.revokedUsername.delete({ where: { id: row.revokedUsernameId } });
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw this.handleUnavailable();
      throw err;
    }

    await this.afterCommit(row.userId, outcome);
    this.logger.log(`Admin ${admin.sub} ${dto.decision === 'reinstate' ? 'reinstated' : 'declined'} username review ${id}.`);
    return { id, status: outcome, decidedAt: now };
  }

  // Best effort, in this order, each in its own try: the user's in-app notification, then the guardian notice.
  // Neither may undo or fail the decision that has already committed.
  private async afterCommit(userId: string, outcome: UsernameReviewOutcome): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { userId, type: USERNAME_REVIEW_NOTIFICATION_TYPE, payloadRefId: outcome },
        select: { id: true },
      });
    } catch (err) {
      this.logger.warn(`Username-review notification for user ${userId} failed: ${(err as Error).message}`);
    }
    // For a minor only (the service checks isMinor and the withhold flag itself); kind of action, never the reason.
    this.guardianNotices.notifyInBackground(userId, outcome === 'reinstated' ? 'username_restored' : 'username_review_declined');
  }

  private async loadForDecision(id: string): Promise<DecideRow | null> {
    const rows = await this.prisma.$queryRaw<DecideRow[]>(Prisma.sql`
      SELECT r."id", r."status", r."userId", r."revokedUsernameId",
             rv."username" AS "handle", rev."id" AS "revokerId",
             u."isMinor", u."accountStatus"
      FROM "UsernameReviewRequest" r
      JOIN "RevokedUsername" rv ON rv."id" = r."revokedUsernameId"
      JOIN "User" u ON u."id" = r."userId"
      CROSS JOIN LATERAL (SELECT ${REVOKER_ID_SQL} AS "id") rev
      WHERE r."id" = ${id}
      LIMIT 1`);
    return rows[0] ?? null;
  }

  // Trimmed, 10 to 500 characters, judged after trimming (so spaces do not count).
  private cleanReason(raw: string): string {
    const reason = (raw ?? '').trim();
    if (reason.length < USERNAME_REVIEW_REASON_MIN_LENGTH || reason.length > USERNAME_REVIEW_REASON_MAX_LENGTH) {
      throw new BadRequestException({
        message: `A reason of ${USERNAME_REVIEW_REASON_MIN_LENGTH} to ${USERNAME_REVIEW_REASON_MAX_LENGTH} characters is required.`,
        code: USERNAME_REVIEW_REASON_INVALID_CODE,
      });
    }
    return reason;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      error: 'Not Found',
      code: USERNAME_REVIEW_NOT_FOUND_CODE,
      message: 'Username review request not found',
    });
  }

  private notPending(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: USERNAME_REVIEW_NOT_PENDING_CODE,
      message: 'This request has already been decided.',
    });
  }

  private handleUnavailable(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE,
      message: 'This username is no longer available to restore.',
    });
  }
}
