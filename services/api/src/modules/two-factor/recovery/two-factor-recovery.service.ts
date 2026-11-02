import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { APP_CLOCK, Clock, systemClock } from '../../../clock/clock';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { PasswordService } from '../../auth/password/password.service';
import { AuthLimitExceeded, AuthLimitsService } from '../../auth/rate-limit/auth-limits/auth-limits.service';
import { AuthLimitsStore, limitKey, normaliseEmail } from '../../auth/rate-limit/auth-limits/auth-limits.store';
import { RegistrationEmailService } from '../../auth/registration/email/registration-email.service';
import { TokenService } from '../../auth/token/token.service';
import { formatNoticeTime } from '../../guardian-security-notice/guardian-security-notice.service';
import { resolvePublicName } from '../../users/public-name.util';
import { TwoFactorService } from '../two-factor.service';
import {
  ADULT_LINK_TTL_MS,
  ADULT_WAIT_MS,
  ENDED_STATES,
  GENERIC_REQUEST_ANSWER,
  GUARDIAN_LINK_TTL_MS,
  LinkState,
  RECOVERY_HOUR_WINDOW_SECONDS,
  RECOVERY_LINK_EXPIRED_CODE,
  RECOVERY_LINK_INVALID_CODE,
  RECOVERY_LINK_USED_CODE,
  RECOVERY_MIN_GAP_SECONDS,
  RECOVERY_REQUESTS_PER_HOUR,
  RECOVERY_RETENTION_MS,
  RecoveryAudience,
  RecoveryKind,
  RecoveryState,
  SWEEP_BATCH_SIZE,
  TWO_FACTOR_RECOVERY_UNAVAILABLE_CODE,
} from './two-factor-recovery.constants';
import { issueRecoveryToken, parseRecoveryToken, recoverySecretMatches } from './two-factor-recovery.tokens';

// Narrow Redis subset so a unit test can substitute a fake.
export interface RecoveryRedisClient {
  ping(): Promise<string>;
}

export interface RecoveryRequestAnswer {
  audience: RecoveryAudience;
}

export interface RecoveryLinkSummary {
  state: LinkState;
  // null only when the token matches no request at all.
  kind: RecoveryKind | null;
  // Only when state is "valid", and only for the guardian page: the minor's PUBLIC name (username, or "Soccernity
  // member"; never the real name) and when the request was made.
  minor?: { publicName: string };
  requestedAt?: string;
}

export interface ConfirmedRecovery {
  state: 'waiting';
  executeAt: string;
  // The separate single-use cancel token, so the confirm page can offer "This wasn't me" without a second email.
  // It is also in the notice email. The person holding the confirm link controls the mailbox either way.
  cancelToken: string;
}

export interface WaitingRecovery {
  executeAt: Date;
}

interface RequestRow {
  id: string;
  userId: string;
  kind: string;
  state: string;
  linkTokenHash: string;
  cancelTokenHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  executeAt: Date | null;
}

const ROW_SELECT = {
  id: true,
  userId: true,
  kind: true,
  state: true,
  linkTokenHash: true,
  cancelTokenHash: true,
  createdAt: true,
  expiresAt: true,
  executeAt: true,
} as const;

// Thrown inside a transaction to roll the whole thing back when a guarded claim lost a race.
class LostClaim extends Error {}

export type CompleteOutcome = 'done' | 'lost' | 'not_enabled';

// backend/b276-two-factor-recovery (B-276; Decision Log #455, #456). A USER who lost both the authenticator device and
// every backup code. Admins keep the peer-superadmin reset. Whether the person is a minor is decided when the request
// is made (User.isMinor). The routes and the full rules are in ../README.md ("Recovery"); the code is the contract.
//
//  request  email + password. Every failure (unknown email, wrong password, two-factor off, inactive account) is the
//           SAME 202 { audience: "account" }, sends nothing, and does the same argon2 work. Only a correct password on
//           an active account with two-factor on gets a different answer:
//             adult                      -> link to the account's own email         { audience: "account" }
//             minor, confirmed guardian  -> link to the GUARDIAN (72 h), notice to
//                                           the minor's own address                 { audience: "guardian" }
//             minor, no confirmed guardian -> nothing is sent                       { audience: "no_guardian" }
//  confirm  (adult) the link starts the 24-hour wait and emails a notice with a separate cancel link.
//  cancel   (adult) the cancel link, or a successful two-factor sign-in, stops a waiting request.
//  approve / decline  (guardian). Approve removes two-factor at once; decline cancels and tells the minor.
//  sweep    TwoFactorRecoverySweepService completes due waits hourly and deletes old rows.
//
// REMOVING two-factor is one primitive (complete()): the guarded claim on the request row and the clearing of the
// secret and every backup code (TwoFactorService.resetUser, the same repository code the admin peer reset uses) happen
// in ONE transaction, so a lost race or a failed clear leaves both untouched. ENDING SESSIONS happens BEFORE that
// transaction, never after: the sessions live in Redis and cannot join it, and revoking first guarantees that
// "two-factor removed" never exists alongside a session that was opened with it. The cost is that a request which then
// loses its race (cancelled in the same instant) signs the person out once, which is harmless.
@Injectable()
export class TwoFactorRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(TwoFactorRecoveryService.name);
  // Fixed-cost dummy hash so the failure paths do the same argon2 work as a real check (like AuthService).
  private dummyPasswordHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly limits: AuthLimitsService,
    private readonly limitStore: AuthLimitsStore,
    private readonly email: RegistrationEmailService,
    @Inject(RedisService) private readonly redis: RecoveryRedisClient,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordService.hash(randomBytes(32).toString('hex'));
  }

  // -----------------------------------------------------------------
  // 1. request
  // -----------------------------------------------------------------

  async request(rawEmail: string, password: string, ip: string): Promise<RecoveryRequestAnswer> {
    // Recovery is unavailable while Redis is down (Decision Log #439): the sign-in it ends in needs Redis too, and
    // the limiters below would otherwise silently fall back to per-process memory.
    await this.assertAvailable();

    const email = normaliseEmail(rawEmail);
    // The EXISTING login limiter: a per-IP ceiling, then the (account, IP) pair's failed-attempt budget, then the
    // account-wide ceiling. A wrong password here spends the same budget as a wrong password at sign-in.
    const ticket = await this.limits.beginLogin(ip, email);
    let settled = false;
    try {
      await this.chargeRecoveryBudget(email);

      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          accountStatus: true,
          totpEnabledAt: true,
          isMinor: true,
          displayName: true,
          guardian: { select: { email: true, consentStatus: true } },
        },
      });
      const valid = await this.passwordService.verify(user?.passwordHash ?? this.dummyPasswordHash, password);

      if (!user || !valid || user.accountStatus !== 'active' || !user.totpEnabledAt) {
        // The four failures are indistinguishable, in the answer, the work and the budget they spend.
        settled = true;
        await this.limits.endLogin(ticket, 'failed-credentials');
        return { ...GENERIC_REQUEST_ANSWER };
      }

      // The password was right: the attempt is not a failed credential check.
      settled = true;
      await this.limits.endLogin(ticket, 'success');

      const now = this.clock.now();
      if (!user.isMinor) {
        const created = await this.createRequest(user.id, 'adult', now, ADULT_LINK_TTL_MS);
        if (created) await this.email.sendTwoFactorRecoveryLinkEmail(user.email, created.token);
        return { audience: 'account' };
      }

      const guardianEmail = user.guardian?.email?.trim();
      if (user.guardian?.consentStatus !== 'confirmed' || !guardianEmail) {
        // A minor with no confirmed guardian: nothing is created and nothing is sent. The page points to Contact Us.
        return { audience: 'no_guardian' };
      }
      const created = await this.createRequest(user.id, 'guardian', now, GUARDIAN_LINK_TTL_MS);
      if (created) {
        await this.email.sendTwoFactorRecoveryGuardianLinkEmail(guardianEmail, created.token, user.displayName);
        await this.email.sendTwoFactorRecoveryMinorNoticeEmail(user.email, user.displayName);
      }
      return { audience: 'guardian' };
    } catch (err) {
      // Any error that is not an answer gives the reserved login slots back: an infrastructure failure must not
      // spend a person's sign-in budget.
      if (!settled) await this.limits.endLogin(ticket, 'other');
      throw err;
    }
  }

  // The recovery-specific budget, keyed on the NORMALISED EMAIL ALONE and charged for every request whether the
  // account exists or not, so a 429 says nothing about the account: at most 3 an hour and a 60-second gap.
  private async chargeRecoveryBudget(email: string): Promise<void> {
    const gapKey = limitKey('recovery-gap', email);
    const hourKey = limitKey('recovery-hour', email);

    const gap = await this.limitStore.hit(gapKey, RECOVERY_MIN_GAP_SECONDS);
    if (gap !== null && gap.count > 1) {
      const retry = await this.limitStore.retryAfterSeconds(gapKey, RECOVERY_MIN_GAP_SECONDS);
      await this.limitStore.release(gapKey);
      throw new AuthLimitExceeded(retry);
    }
    const hour = await this.limitStore.hit(hourKey, RECOVERY_HOUR_WINDOW_SECONDS);
    if (hour !== null && hour.count > RECOVERY_REQUESTS_PER_HOUR) {
      const retry = await this.limitStore.retryAfterSeconds(hourKey, RECOVERY_HOUR_WINDOW_SECONDS);
      await this.limitStore.release(hourKey);
      // A refused request spends neither slot.
      await this.limitStore.release(gapKey);
      throw new AuthLimitExceeded(retry);
    }
  }

  // Supersedes an earlier UNUSED (pending) request and creates the new one, atomically. A request that is already
  // WAITING (an adult who confirmed) is left alone: it is in use, and replacing it would only restart their wait.
  // Returns null when nothing was created (a waiting request exists, or another request won the race).
  private async createRequest(
    userId: string,
    kind: RecoveryKind,
    now: Date,
    ttlMs: number,
  ): Promise<{ token: string } | null> {
    const id = randomUUID();
    const link = issueRecoveryToken(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const waiting = await tx.twoFactorRecoveryRequest.findFirst({ where: { userId, state: 'waiting' }, select: { id: true } });
        if (waiting) return null;
        await tx.twoFactorRecoveryRequest.updateMany({
          where: { userId, state: 'pending' },
          data: { state: 'superseded', doneAt: now },
        });
        await tx.twoFactorRecoveryRequest.create({
          data: {
            id,
            userId,
            kind,
            state: 'pending',
            linkTokenHash: link.hash,
            createdAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
        });
        return { token: link.token };
      });
    } catch (err) {
      // The one-active-request-per-account unique index: a concurrent request created it first. That request sends
      // its own email, so this one quietly does nothing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  // -----------------------------------------------------------------
  // 2. link preview (no side effects: safe for email scanners)
  // -----------------------------------------------------------------

  async describeLink(rawToken: unknown): Promise<RecoveryLinkSummary> {
    const found = await this.findByToken(rawToken, 'link');
    if (!found) return { state: 'invalid', kind: null };
    const state = this.linkState(found.row);
    const kind = found.row.kind as RecoveryKind;
    if (state !== 'valid') return { state, kind };
    if (kind === 'adult') return { state, kind };
    const user = await this.prisma.user.findUnique({
      where: { id: found.row.userId },
      select: { username: true, displayName: true },
    });
    return {
      state,
      kind,
      minor: { publicName: resolvePublicName({ username: user?.username, displayName: user?.displayName }) },
      requestedAt: found.row.createdAt.toISOString(),
    };
  }

  // -----------------------------------------------------------------
  // 3. confirm (adult) -> waiting
  // -----------------------------------------------------------------

  async confirm(rawToken: unknown): Promise<ConfirmedRecovery> {
    const found = await this.findByToken(rawToken, 'link');
    if (!found || found.row.kind !== 'adult') throw this.linkError('invalid');
    const state = this.linkState(found.row);
    if (state !== 'valid') throw this.linkError(state);

    const user = await this.prisma.user.findUnique({
      where: { id: found.row.userId },
      select: { email: true, accountStatus: true, totpEnabledAt: true, isMinor: true },
    });
    // The account changed since the link was sent: the request no longer applies.
    if (!user || user.accountStatus !== 'active' || !user.totpEnabledAt || user.isMinor) {
      await this.endRequest(found.row.id, 'superseded', ['pending']);
      throw this.linkError('expired');
    }

    const now = this.clock.now();
    const executeAt = new Date(now.getTime() + ADULT_WAIT_MS);
    const cancel = issueRecoveryToken(found.row.id);
    // The guarded claim consumes the link atomically: of two clicks, exactly one gets count 1.
    const { count } = await this.prisma.twoFactorRecoveryRequest.updateMany({
      where: { id: found.row.id, state: 'pending', expiresAt: { gt: now } },
      data: { state: 'waiting', confirmedAt: now, executeAt, cancelTokenHash: cancel.hash },
    });
    if (count !== 1) throw this.linkError('used');

    await this.email.sendTwoFactorRecoveryWaitingEmail(user.email, cancel.token, formatNoticeTime(executeAt));
    return { state: 'waiting', executeAt: executeAt.toISOString(), cancelToken: cancel.token };
  }

  // -----------------------------------------------------------------
  // 4. cancel (adult)
  // -----------------------------------------------------------------

  async cancel(rawCancelToken: unknown): Promise<{ state: 'cancelled' }> {
    const found = await this.findByToken(rawCancelToken, 'cancel');
    if (!found) throw this.linkError('invalid');
    // Only a WAITING request can be cancelled by link. It stays cancellable until the sweep actually removes
    // two-factor, even a little past executeAt: the guarded claim below is what decides a race with the sweep.
    if (found.row.state !== 'waiting') throw this.linkError('used');
    const ended = await this.endRequest(found.row.id, 'cancelled', ['waiting']);
    if (!ended) throw this.linkError('used');
    return { state: 'cancelled' };
  }

  // -----------------------------------------------------------------
  // 5. guardian approve / decline
  // -----------------------------------------------------------------

  async approve(rawToken: unknown): Promise<{ state: 'done' }> {
    const found = await this.findByToken(rawToken, 'link');
    if (!found || found.row.kind !== 'guardian') throw this.linkError('invalid');
    const state = this.linkState(found.row);
    if (state !== 'valid') throw this.linkError(state);

    const user = await this.prisma.user.findUnique({
      where: { id: found.row.userId },
      select: { email: true, displayName: true, accountStatus: true, totpEnabledAt: true, isMinor: true },
    });
    // A guardian may only remove two-factor from a MINOR's active account. If the person turned 18 (the age sweep),
    // closed the account, or already turned two-factor off in the meantime, the request no longer applies.
    if (!user || !user.isMinor || user.accountStatus !== 'active' || !user.totpEnabledAt) {
      await this.endRequest(found.row.id, 'superseded', ['pending']);
      throw this.linkError('expired');
    }

    await this.assertAvailable();
    const outcome = await this.complete(found.row.id, found.row.userId, 'pending', this.clock.now());
    if (outcome === 'lost') throw this.linkError('used');
    if (outcome === 'not_enabled') {
      await this.endRequest(found.row.id, 'superseded', ['pending']);
      throw this.linkError('expired');
    }
    await this.email.sendTwoFactorRecoveryApprovedEmail(user.email, user.displayName);
    return { state: 'done' };
  }

  async decline(rawToken: unknown): Promise<{ state: 'declined' }> {
    const found = await this.findByToken(rawToken, 'link');
    if (!found || found.row.kind !== 'guardian') throw this.linkError('invalid');
    const state = this.linkState(found.row);
    if (state !== 'valid') throw this.linkError(state);

    const ended = await this.endRequest(found.row.id, 'declined', ['pending']);
    if (!ended) throw this.linkError('used');
    const user = await this.prisma.user.findUnique({
      where: { id: found.row.userId },
      select: { email: true, displayName: true },
    });
    if (user) await this.email.sendTwoFactorRecoveryDeclinedEmail(user.email, user.displayName);
    return { state: 'declined' };
  }

  // -----------------------------------------------------------------
  // The removal primitive, shared by approve and the sweep
  // -----------------------------------------------------------------

  // Ends the user's sessions, then removes two-factor and marks the request done in ONE transaction. The claim on the
  // request row is guarded on `fromState` (and, for a pending request, on not being expired), so of two simultaneous
  // callers exactly one wins; the loser's transaction rolls back and clears nothing.
  async complete(requestId: string, userId: string, fromState: 'pending' | 'waiting', now: Date): Promise<CompleteOutcome> {
    await this.tokenService.revokeAllSessionsForUser(userId);
    try {
      const removed = await this.twoFactor.resetUser(userId, async (tx) => {
        const { count } = await tx.twoFactorRecoveryRequest.updateMany({
          where: {
            id: requestId,
            state: fromState,
            ...(fromState === 'pending' ? { expiresAt: { gt: now } } : {}),
          },
          data: { state: 'done', doneAt: now },
        });
        if (count !== 1) throw new LostClaim();
      });
      return removed ? 'done' : 'not_enabled';
    } catch (err) {
      if (err instanceof LostClaim) return 'lost';
      throw err;
    }
  }

  // -----------------------------------------------------------------
  // 6/7. sweep support and the sign-in hooks
  // -----------------------------------------------------------------

  // The waiting request for a user, if any (login's recoveryPending). Only called after the password step succeeded.
  async findWaiting(userId: string): Promise<WaitingRecovery | null> {
    const row = await this.prisma.twoFactorRecoveryRequest.findFirst({
      where: { userId, state: 'waiting' },
      select: { executeAt: true },
    });
    return row?.executeAt ? { executeAt: row.executeAt } : null;
  }

  // A successful two-factor sign-in (a device code or a backup code) proves the person still has a factor, so a
  // WAITING request is cancelled. Never throws: it must not turn a successful sign-in into an error.
  async cancelWaitingOnSignIn(userId: string): Promise<void> {
    try {
      await this.prisma.twoFactorRecoveryRequest.updateMany({
        where: { userId, state: 'waiting' },
        data: { state: 'cancelled', doneAt: this.clock.now() },
      });
    } catch (err) {
      this.logger.error(`Could not cancel a waiting two-factor recovery on sign-in: ${(err as Error)?.message ?? err}`);
    }
  }

  // Completes every adult wait that has run out. Returns the ids it completed and the ids it cancelled because the
  // account changed (closed, or two-factor already off), for the sweep's log line.
  async completeDue(now: Date): Promise<{ completed: string[]; cancelled: string[] }> {
    const due = await this.prisma.twoFactorRecoveryRequest.findMany({
      where: { state: 'waiting', executeAt: { lte: now } },
      orderBy: { executeAt: 'asc' },
      take: SWEEP_BATCH_SIZE,
      select: { id: true, userId: true, user: { select: { email: true, accountStatus: true, totpEnabledAt: true } } },
    });
    const completed: string[] = [];
    const cancelled: string[] = [];
    for (const row of due) {
      try {
        if (row.user.accountStatus !== 'active' || !row.user.totpEnabledAt) {
          if (await this.endRequest(row.id, 'cancelled', ['waiting'], now)) cancelled.push(row.id);
          continue;
        }
        const outcome = await this.complete(row.id, row.userId, 'waiting', now);
        if (outcome === 'done') {
          completed.push(row.id);
          await this.email.sendTwoFactorRecoveryCompletedEmail(row.user.email);
        } else if (outcome === 'not_enabled') {
          if (await this.endRequest(row.id, 'cancelled', ['waiting'], now)) cancelled.push(row.id);
        }
        // 'lost': cancelled in the same instant; nothing to do.
      } catch (err) {
        // One bad row must not strand the rest; it stays waiting and the next run retries it.
        this.logger.error(`Two-factor recovery sweep: could not complete request ${row.id}: ${(err as Error)?.message ?? err}`);
      }
    }
    return { completed, cancelled };
  }

  // Deletes ended rows 30 days after they ended, and never-used links 30 days after they expired.
  async deleteOld(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - RECOVERY_RETENTION_MS);
    const { count } = await this.prisma.twoFactorRecoveryRequest.deleteMany({
      where: {
        OR: [
          { state: { in: [...ENDED_STATES] }, doneAt: { lt: cutoff } },
          { state: 'pending', expiresAt: { lt: cutoff } },
        ],
      },
    });
    return count;
  }

  // -----------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------

  // Marks a request ended, guarded on its current state. true only for the caller that actually changed it.
  private async endRequest(
    id: string,
    to: Exclude<RecoveryState, 'pending' | 'waiting' | 'done'>,
    from: RecoveryState[],
    now: Date = this.clock.now(),
  ): Promise<boolean> {
    const { count } = await this.prisma.twoFactorRecoveryRequest.updateMany({
      where: { id, state: { in: from } },
      data: { state: to, doneAt: now },
    });
    return count === 1;
  }

  // Finds a request by its token and checks the secret in constant time. Wrong id, wrong secret and a cancel token on a
  // link endpoint (or the reverse) are all simply "not found".
  private async findByToken(rawToken: unknown, which: 'link' | 'cancel'): Promise<{ row: RequestRow } | null> {
    const parsed = parseRecoveryToken(rawToken);
    if (!parsed) return null;
    const row = await this.prisma.twoFactorRecoveryRequest.findUnique({ where: { id: parsed.id }, select: ROW_SELECT });
    if (!row) return null;
    const stored = which === 'link' ? row.linkTokenHash : row.cancelTokenHash;
    if (!recoverySecretMatches(parsed.secret, stored)) return null;
    return { row };
  }

  // How a link looks to a client. Only a pending request that has not expired is usable. A superseded one reads as
  // expired (the person should ask again); every other ended state reads as used.
  private linkState(row: RequestRow): LinkState {
    if (row.state === 'pending') return row.expiresAt.getTime() > this.clock.now().getTime() ? 'valid' : 'expired';
    if (row.state === 'superseded') return 'expired';
    return 'used';
  }

  private async assertAvailable(): Promise<void> {
    try {
      await this.redis.ping();
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: TWO_FACTOR_RECOVERY_UNAVAILABLE_CODE,
        message: 'Two-factor recovery is not available right now. Try again in a few minutes.',
      });
    }
  }

  // A rejected link action: 400 with the state a page needs ("invalid" | "expired" | "used") and a stable code.
  private linkError(state: Exclude<LinkState, 'valid'>): BadRequestException {
    const code =
      state === 'invalid' ? RECOVERY_LINK_INVALID_CODE : state === 'expired' ? RECOVERY_LINK_EXPIRED_CODE : RECOVERY_LINK_USED_CODE;
    const message =
      state === 'invalid'
        ? 'This link is not valid.'
        : state === 'expired'
          ? 'This link has expired.'
          : 'This link has already been used.';
    return new BadRequestException({ statusCode: 400, error: 'Bad Request', code, state, message });
  }
}
