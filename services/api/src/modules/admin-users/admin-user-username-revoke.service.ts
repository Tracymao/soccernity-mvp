import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { USERNAME_REVOKE_HOLD_DAYS } from '../users/username-rules.constants';
import { RevokeUsernameDto } from './dto/revoke-username.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsernameRevokeResult {
  userId: string;
  // The handle that was removed (the admin saw it on the User Detail screen).
  revokedUsername: string;
  // Until when NOBODY can take it. The revoked user can never re-pick it.
  heldUntil: Date;
}

// B-033 (Decision Log #398 D3, #402 item 3): the admin action that removes a
// user's username -- manual, from User Detail, at any time after one exists,
// triggered by a report or an admin review (an offensive, impersonating or
// personal-data handle).
//
// IN ONE TRANSACTION:
//   1. clears User.username and User.usernameChangedAt. No account exists
//      without a username (#369), so this puts the account straight back in the
//      incomplete-profile gate (B-027) with no extra state: other users see the
//      'Soccernity member' placeholder, it cannot post, and the next login
//      reports nextStep 'create_profile'. The guard reads the column fresh, so
//      this bites on the user's EXISTING access token, with no re-login.
//   2. writes a RevokedUsername row: a 30-day hold for everyone, and a
//      permanent bar on THIS user re-picking that handle (#402 item 3).
//   3. writes the audit row (admin, target, handle, hold end and the REASON),
//      so a revoke can never exist without its audit entry.
// AFTER the commit, best effort: the user is emailed (wording [COPY PENDING
// LEGAL REVIEW]); a mail failure never undoes the revoke.
//
// The revoke only removes the handle. It does not suspend the account, touch
// its content, or send anything to the reporter -- those are separate moderation
// actions.
@Injectable()
export class AdminUserUsernameRevokeService {
  private readonly logger = new Logger(AdminUserUsernameRevokeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: RegistrationEmailService,
  ) {}

  async revokeUsername(userId: string, adminId: string, dto: RevokeUsernameDto): Promise<UsernameRevokeResult> {
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException('A reason of at least 10 characters is required.');
    }

    const now = new Date();
    const heldUntil = new Date(now.getTime() + USERNAME_REVOKE_HOLD_DAYS * DAY_MS);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, username: true, accountStatus: true },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      // An anonymized account (Decision Log #341) has no username to revoke and
      // nobody to tell.
      if (user.accountStatus === 'deleted') {
        throw new ConflictException('This user has been deleted and anonymized; there is no username to revoke.');
      }
      if (user.username === null) {
        throw new ConflictException('This user has no username to revoke.');
      }
      const handle = user.username;

      // Optimistic lock on the handle read above: two admins revoking at once,
      // or a user changing it in between, leaves exactly one winner.
      const cleared = await tx.user.updateMany({
        where: { id: userId, username: handle },
        data: { username: null, usernameChangedAt: null },
      });
      if (cleared.count === 0) {
        throw new ConflictException(
          'The username changed while this was being processed. Please refresh and try again.',
        );
      }

      await tx.revokedUsername.upsert({
        where: { username_userId: { username: handle, userId } },
        create: { username: handle, userId, revokedAt: now, holdUntil: heldUntil },
        update: { revokedAt: now, holdUntil: heldUntil },
      });

      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.USER_USERNAME_REVOKED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          targetId: userId,
          notes: `username=${handle}; held_until=${heldUntil.toISOString()}; reason=${reason}`,
        },
      });

      return { handle, email: user.email, displayName: user.displayName };
    });

    try {
      await this.emailService.sendUsernameRevokedEmail(outcome.email, outcome.displayName);
    } catch (err) {
      this.logger.warn(`Username-revoked email for user ${userId} failed: ${(err as Error).message}`);
    }
    this.logger.log(`Admin ${adminId} revoked the username of user ${userId}.`);

    return { userId, revokedUsername: outcome.handle, heldUntil };
  }
}
