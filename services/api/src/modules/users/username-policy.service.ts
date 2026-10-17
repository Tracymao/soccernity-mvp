import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  USERNAME_CHANGE_COOLDOWN_CODE,
  USERNAME_CHANGE_COOLDOWN_DAYS,
  USERNAME_NOT_ALLOWED_CODE,
  USERNAME_NOT_ALLOWED_MESSAGE,
  USERNAME_PERSONAL_DATA_MESSAGE,
} from './username-rules.constants';
import { checkUsernameRules, clubComparableForm, UsernameOwnerContext } from './username-rules.util';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsernameAssignment {
  userId: string;
  // The handle as stored: already lower case.
  candidate: string;
  // The handle the account holds now (null when it has none).
  current: string | null;
  usernameChangedAt: Date | null;
  owner: UsernameOwnerContext;
}

// B-032 (Decision Log #369, #398 D3, #402 item 3): every rule a user-chosen
// username must pass that is not a plain string check. One place, called by
// UsersService.updateOwnProfile, so no write path can skip a rule.
//
// ORDER (cheapest first, and so a refusal reveals as little as possible):
//   1. the pure rules (username-rules.util.ts)  -> 400 username_not_allowed
//   2. a handle that is a club's name           -> 400 username_not_allowed
//   3. a handle an admin revoked FROM THIS USER -> 400 username_not_allowed
//      (permanent: the revoked user can never re-pick it, #402 item 3)
//   4. a handle under the 30-day revoke hold    -> 409 "already taken" -- to
//      everyone else it behaves exactly like a taken name and says nothing
//      about why
//   5. the change cooldown (a change from one value to another, not a first
//      choice)                                  -> 429 username_change_cooldown
// Plain uniqueness is not checked here: User.username is @unique and the write
// maps P2002 to a 409, which is also what makes two racing claims safe.
@Injectable()
export class UsernamePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAssignable(input: UsernameAssignment, now: Date = new Date()): Promise<void> {
    const { userId, candidate, current, usernameChangedAt, owner } = input;

    const failure = checkUsernameRules(candidate, owner);
    if (failure) {
      throw new BadRequestException({
        message: failure === 'personal_data' ? USERNAME_PERSONAL_DATA_MESSAGE : USERNAME_NOT_ALLOWED_MESSAGE,
        code: USERNAME_NOT_ALLOWED_CODE,
      });
    }

    if (await this.matchesClubName(candidate)) {
      throw new BadRequestException({ message: USERNAME_NOT_ALLOWED_MESSAGE, code: USERNAME_NOT_ALLOWED_CODE });
    }

    const revocations = await this.prisma.revokedUsername.findMany({
      where: { username: candidate },
      select: { userId: true, holdUntil: true },
    });
    if (revocations.some((r) => r.userId === userId)) {
      throw new BadRequestException({ message: USERNAME_NOT_ALLOWED_MESSAGE, code: USERNAME_NOT_ALLOWED_CODE });
    }
    if (revocations.some((r) => r.holdUntil.getTime() > now.getTime())) {
      throw new ConflictException('That username is already taken');
    }

    if (current !== null && usernameChangedAt) {
      const availableAt = new Date(usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS);
      if (availableAt.getTime() > now.getTime()) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `You changed your username recently. You can change it again on ${availableAt.toISOString().slice(0, 10)}.`,
            code: USERNAME_CHANGE_COOLDOWN_CODE,
            availableAt: availableAt.toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  // Impersonation of a club: the handle equals a ClubPage name once both are
  // reduced to letters and digits with a leading/trailing "fc" / "official"
  // dropped. Done in SQL (one parameterised query, no table scan into memory):
  // a Prisma `equals` cannot ignore spaces and punctuation in the stored name.
  private async matchesClubName(candidate: string): Promise<boolean> {
    const comparable = clubComparableForm(candidate);
    if (comparable.length < 3) return false;
    const rows = await this.prisma.$queryRaw<Array<{ one: number }>>`
      SELECT 1 AS one
      FROM "ClubPage"
      WHERE regexp_replace(
              regexp_replace(lower("name"), '[^a-z0-9]', '', 'g'),
              '^(fc|official)+|(fc|official)+$', '', 'g'
            ) = ${comparable}
      LIMIT 1`;
    return rows.length > 0;
  }
}
